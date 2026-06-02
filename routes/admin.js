import express from "express";
import User from "../models/user.js";
import Deadline from "../models/deadline.js";
import Announcement from "../models/announcement.js";
import Timetable from "../models/timetable.js";
import bcrypt from "bcryptjs";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /admin/reps (Admin only)
router.get("/reps", auth, requireRole("admin"), async (req, res) => {
  try {
    const reps = await User.find({ role: "rep" });

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
    const repsList = await User.find({ role: "rep" }).select("-passwordHash");
    res.json(repsList);
  } catch (err) {
    console.error("Fetch reps error:", err);
    res.status(500).json({ error: "Server error fetching representatives" });
  }
});

// POST /admin/create-rep (Admin only)
router.post("/create-rep", auth, requireRole("admin"), async (req, res) => {
  try {
    const { name, email, matric, password } = req.body;

    if (!name || !email || !matric || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // Check if matric number already exists
    const existingMatric = await User.findOne({ matric });
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
      email,
      matric,
      passwordHash: hashed,
      role: "rep",
      inviteCode,
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

export default router;
