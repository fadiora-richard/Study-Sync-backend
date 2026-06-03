import express from "express";
import User from "../models/user.js";
import Deadline from "../models/deadline.js";
import Announcement from "../models/announcement.js";
import Timetable from "../models/timetable.js";
import bcrypt from "bcryptjs";
import Course from "../models/course.js";
import Report from "../models/report.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /admin/reps (Admin, HOD, and Lecturer)
router.get("/reps", auth, requireRole(["admin", "hod", "lecturer"]), async (req, res) => {
  try {
    const query = { role: "rep" };
    // Filter reps by department if requester is not admin and has a department set
    if (req.user.role !== "admin" && req.user.department) {
      query.department = req.user.department;
    }
    const reps = await User.find(query);

    // Defensively populate missing invite codes for legacy representatives
    for (const rep of reps) {
      if (!rep.inviteCode) {
        let inviteCode = "";
        let unique = false;
        while (!unique) {
          const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
          inviteCode = `SYNC-${rand}`;
          const existingCode = await User.findOne({ inviteCode });
          if (!existingCode) unique = true;
        }
        rep.inviteCode = inviteCode;
        await rep.save();
        console.log(`[Defensive Update] Populated missing inviteCode for rep: ${rep.name} -> ${inviteCode}`);
      }
    }

    // Return representatives list excluding passwords
    const repsList = await User.find(query).select("-passwordHash");
    res.json(repsList);
  } catch (err) {
    console.error("Fetch reps error:", err);
    res.status(500).json({ error: "Server error fetching representatives" });
  }
});

// POST /admin/create-rep (Admin, HOD, and Lecturer)
router.post("/create-rep", auth, requireRole(["admin", "hod", "lecturer"]), async (req, res) => {
  try {
    const { name, email, matric, password, department } = req.body;

    if (!name || !email || !matric || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanMatric = matric.toUpperCase().trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email address format." });
    }

    // Check if email already exists
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // Check if matric number already exists
    const existingMatric = await User.findOne({ matric: cleanMatric });
    if (existingMatric) {
      return res.status(400).json({ error: "Matric number already in use" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Auto-generate class join code
    let inviteCode = "";
    let unique = false;
    while (!unique) {
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      inviteCode = `SYNC-${rand}`;
      const existingCode = await User.findOne({ inviteCode });
      if (!existingCode) unique = true;
    }

    const rep = new User({
      name,
      email: cleanEmail,
      matric: cleanMatric,
      passwordHash: hashed,
      role: "rep",
      inviteCode,
      department: department || req.user.department
    });

    await rep.save();

    res.json({
      message: "Rep created successfully",
      rep: {
        id: rep._id,
        name: rep.name,
        email: rep.email,
        matric: rep.matric,
        role: rep.role,
        inviteCode: rep.inviteCode,
        department: rep.department
      },
    });
  } catch (err) {
    console.error("Create rep error:", err);
    res.status(500).json({ error: "Server error during representative creation" });
  }
});

// DELETE /admin/reps/:id (Admin only) - Performs cascade delete of representative and their entire group data
router.delete("/reps/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const rep = await User.findOne({ _id: id, role: "rep" });
    if (!rep) {
      return res.status(404).json({ error: "Representative not found" });
    }

    console.log(`[Admin Cascade Delete] Deleting Representative: ${rep.name} (${id})`);

    // 1. Delete all students assigned to this representative group
    const studentDeleteRes = await User.deleteMany({
      role: "student",
      $or: [{ repId: id }, { repId: id.toString() }]
    });
    console.log(`- Deleted ${studentDeleteRes.deletedCount} students`);

    // 2. Delete all deadlines associated with this representative
    const deadlineDeleteRes = await Deadline.deleteMany({
      $or: [{ repId: id }, { repId: id.toString() }]
    });
    console.log(`- Deleted ${deadlineDeleteRes.deletedCount} deadlines`);

    // 3. Delete all announcements associated with this representative
    const announcementDeleteRes = await Announcement.deleteMany({
      $or: [{ repId: id }, { repId: id.toString() }]
    });
    console.log(`- Deleted ${announcementDeleteRes.deletedCount} announcements`);

    // 4. Delete all timetables associated with this representative
    const timetableDeleteRes = await Timetable.deleteMany({
      $or: [{ repId: id }, { repId: id.toString() }]
    });
    console.log(`- Deleted ${timetableDeleteRes.deletedCount} timetables`);

    // 5. Delete the representative user record itself
    await User.findByIdAndDelete(id);
    console.log(`- Representative record deleted successfully.`);

    res.json({
      message: "Representative and entire group cascade deleted successfully.",
      stats: {
        students: studentDeleteRes.deletedCount,
        deadlines: deadlineDeleteRes.deletedCount,
        announcements: announcementDeleteRes.deletedCount,
        timetables: timetableDeleteRes.deletedCount,
      }
    });
  } catch (err) {
    console.error("Cascade delete rep error:", err);
    res.status(500).json({ error: "Server error performing representative cascade deletion" });
  }
});

// POST /admin/transfer-rep (Admin, HOD, and Lecturer)
router.post("/transfer-rep", auth, requireRole(["admin", "hod", "lecturer"]), async (req, res) => {
  try {
    const { oldRepId, newStudentId } = req.body;

    if (!oldRepId || !newStudentId) {
      return res.status(400).json({ error: "oldRepId and newStudentId are required." });
    }

    // 1. Verify old representative exists and has the rep role
    const oldRep = await User.findOne({ _id: oldRepId, role: "rep" });
    if (!oldRep) {
      return res.status(404).json({ error: "Current representative not found or invalid role." });
    }

    // 2. Verify new student exists and has student role and belongs to old rep's group
    const newRep = await User.findOne({ _id: newStudentId, role: "student" });
    if (!newRep) {
      return res.status(404).json({ error: "Target student not found or invalid role." });
    }

    if (newRep.repId.toString() !== oldRepId.toString()) {
      return res.status(400).json({ error: "Target student does not belong to the representative's group." });
    }

    console.log(`[Rep Transfer] Transferring role from ${oldRep.name} (${oldRepId}) to ${newRep.name} (${newStudentId})`);

    // 3. Keep old rep's invite code and give it to the new rep
    const inviteCode = oldRep.inviteCode;
    
    // 4. Demote the old rep to a student and save first to free up the unique inviteCode
    oldRep.role = "student";
    oldRep.inviteCode = undefined;
    oldRep.repId = newRep._id;
    await oldRep.save();

    // 5. Update the new rep's fields and save second
    newRep.role = "rep";
    newRep.inviteCode = inviteCode;
    newRep.repId = undefined; // Reps don't have a repId
    // If the student doesn't have a department, inherit it from old rep
    if (!newRep.department) {
      newRep.department = oldRep.department;
    }
    await newRep.save();

    // 6. Update all students under the old representative group to the new representative
    const studentsUpdate = await User.updateMany(
      { repId: oldRep._id, role: "student" },
      { repId: newRep._id }
    );
    console.log(`- Updated repId for ${studentsUpdate.modifiedCount} students`);

    // 7. Update course allocations (updating elements in repIds array)
    const coursesUpdate = await Course.updateMany(
      { repIds: oldRep._id },
      { $set: { "repIds.$": newRep._id } }
    );
    console.log(`- Updated repIds for ${coursesUpdate.modifiedCount} courses`);

    // 8. Update timetables, announcements, deadlines, and reports
    const timetablesUpdate = await Timetable.updateMany(
      { repId: oldRep._id },
      { repId: newRep._id }
    );
    const announcementsUpdate = await Announcement.updateMany(
      { repId: oldRep._id },
      { repId: newRep._id }
    );
    const deadlinesUpdate = await Deadline.updateMany(
      { repId: oldRep._id },
      { repId: newRep._id }
    );
    const reportsUpdate = await Report.updateMany(
      { repId: oldRep._id },
      { repId: newRep._id }
    );

    console.log(`- Updated timetables, announcements, deadlines, and reports to point to new rep.`);

    return res.json({
      message: "Representative role transferred successfully.",
      oldRep: {
        id: oldRep._id,
        name: oldRep.name,
        role: oldRep.role,
        repId: oldRep.repId
      },
      newRep: {
        id: newRep._id,
        name: newRep.name,
        role: newRep.role,
        inviteCode: newRep.inviteCode,
        department: newRep.department
      },
      updates: {
        studentsCount: studentsUpdate.modifiedCount,
        coursesCount: coursesUpdate.modifiedCount,
        timetablesCount: timetablesUpdate.modifiedCount,
        announcementsCount: announcementsUpdate.modifiedCount,
        deadlinesCount: deadlinesUpdate.modifiedCount,
        reportsCount: reportsUpdate.modifiedCount
      }
    });

  } catch (err) {
    console.error("Transfer rep error:", err);
    return res.status(500).json({ error: "Server error during representative role transfer." });
  }
});

export default router;
