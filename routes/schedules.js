import express from "express";
import ClassSchedule from "../models/classSchedule.js";
import Course from "../models/course.js";
import Timetable from "../models/timetable.js";
import User from "../models/user.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// helper to format subject string
const getSubjectName = (course) => {
  return `${course.code} - ${course.name}`;
};

// POST /schedules — Create a lecturer class schedule & sync to timetables
router.post("/", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    const { courseId, day, startTime, endTime, location, repIds, department, level } = req.body;
    
    if (!courseId || !day || !startTime || !endTime || !location) {
      return res.status(400).json({ error: "Missing required fields (courseId, day, startTime, endTime, location)." });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course allocation not found." });
    }

    // Verify lecturer owns the course (or is HOD/admin)
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== "admin" && req.user.role !== "hod") {
      return res.status(403).json({ error: "Forbidden: You do not own this course allocation." });
    }

    // Determine target representatives. If level and department are specified, we select matching reps.
    let finalRepIds = repIds || [];
    if (department && level) {
      const matchingReps = await User.find({
        role: "rep",
        department,
        level
      });
      const matchingRepIds = matchingReps.map(r => r._id.toString());
      // Merge with repIds
      finalRepIds = Array.from(new Set([...finalRepIds, ...matchingRepIds]));
    }

    if (finalRepIds.length === 0) {
      return res.status(400).json({ error: "No target representative groups selected or found matching the criteria." });
    }

    const schedule = new ClassSchedule({
      courseId,
      lecturerId: req.user._id,
      day,
      startTime,
      endTime,
      location,
      repIds: finalRepIds,
      department,
      level
    });

    await schedule.save();

    // Sync to each representative's timetable
    const subject = getSubjectName(course);
    for (const repId of finalRepIds) {
      let timetable = await Timetable.findOne({ repId, semester: "semester1" });
      if (!timetable) {
        timetable = new Timetable({
          repId,
          semester: "semester1",
          entries: []
        });
      }

      // Add slot copy to representative's entries
      timetable.entries.push({
        day,
        startTime,
        endTime,
        subject,
        location,
        lecturerClassId: schedule._id
      });

      await timetable.save();
    }

    res.status(201).json(schedule);
  } catch (err) {
    console.error("Create class schedule error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /schedules/course/:courseId — Fetch schedules for a course
router.get("/course/:courseId", auth, async (req, res) => {
  try {
    const schedules = await ClassSchedule.find({ courseId: req.params.courseId })
      .populate("repIds", "name groupDescription matric");
    res.json(schedules);
  } catch (err) {
    console.error("Fetch schedules error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /schedules/:id — Update lecturer schedule & sync updates to timetables
router.patch("/:id", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    const schedule = await ClassSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: "Class schedule slot not found." });
    }

    // Verify ownership
    if (schedule.lecturerId.toString() !== req.user._id.toString() && req.user.role !== "admin" && req.user.role !== "hod") {
      return res.status(403).json({ error: "Forbidden: Access denied." });
    }

    const { day, startTime, endTime, location, repIds, department, level } = req.body;

    const oldRepIds = schedule.repIds.map(id => id.toString());
    
    // Update schedule document fields
    if (day) schedule.day = day;
    if (startTime) schedule.startTime = startTime;
    if (endTime) schedule.endTime = endTime;
    if (location) schedule.location = location;
    if (department) schedule.department = department;
    if (level) schedule.level = level;

    let finalRepIds = repIds || oldRepIds;
    if (repIds) {
      schedule.repIds = repIds;
    }

    // If department or level changed/updated, resolve matching reps
    if (department || level) {
      const deptVal = department || schedule.department;
      const levelVal = level || schedule.level;
      if (deptVal && levelVal) {
        const matchingReps = await User.find({
          role: "rep",
          department: deptVal,
          level: levelVal
        });
        const matchingRepIds = matchingReps.map(r => r._id.toString());
        finalRepIds = Array.from(new Set([...finalRepIds, ...matchingRepIds]));
        schedule.repIds = finalRepIds;
      }
    }

    await schedule.save();

    const course = await Course.findById(schedule.courseId);
    const subject = getSubjectName(course);

    // Sync changes to representative timetables
    // 1. Remove entries from reps who are no longer targeted
    const removedRepIds = oldRepIds.filter(id => !finalRepIds.includes(id));
    for (const repId of removedRepIds) {
      const timetable = await Timetable.findOne({ repId, semester: "semester1" });
      if (timetable) {
        timetable.entries = timetable.entries.filter(
          entry => !entry.lecturerClassId || entry.lecturerClassId.toString() !== schedule._id.toString()
        );
        await timetable.save();
      }
    }

    // 2. Update or Add entries for targeted reps
    for (const repId of finalRepIds) {
      let timetable = await Timetable.findOne({ repId, semester: "semester1" });
      if (!timetable) {
        timetable = new Timetable({
          repId,
          semester: "semester1",
          entries: []
        });
      }

      // Check if entry already exists (by matching lecturerClassId)
      const existingEntryIndex = timetable.entries.findIndex(
        entry => entry.lecturerClassId && entry.lecturerClassId.toString() === schedule._id.toString()
      );

      const entryData = {
        day: schedule.day,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        subject,
        location: schedule.location,
        lecturerClassId: schedule._id
      };

      if (existingEntryIndex > -1) {
        // Update the copy
        timetable.entries[existingEntryIndex] = {
          ...timetable.entries[existingEntryIndex].toObject(),
          ...entryData
        };
      } else {
        // Add copy
        timetable.entries.push(entryData);
      }

      await timetable.save();
    }

    res.json(schedule);
  } catch (err) {
    console.error("Update schedule error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /schedules/:id — Delete schedule & remove from all representative timetables
router.delete("/:id", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    const schedule = await ClassSchedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ error: "Class schedule slot not found." });
    }

    // Verify ownership
    if (schedule.lecturerId.toString() !== req.user._id.toString() && req.user.role !== "admin" && req.user.role !== "hod") {
      return res.status(403).json({ error: "Forbidden: Access denied." });
    }

    // Delete schedule copies from representatives' timetables
    const repIds = schedule.repIds.map(id => id.toString());
    for (const repId of repIds) {
      const timetable = await Timetable.findOne({ repId, semester: "semester1" });
      if (timetable) {
        timetable.entries = timetable.entries.filter(
          entry => !entry.lecturerClassId || entry.lecturerClassId.toString() !== schedule._id.toString()
        );
        await timetable.save();
      }
    }

    // Delete ClassSchedule document
    await ClassSchedule.findByIdAndDelete(req.params.id);

    res.json({ message: "Class schedule slot deleted and timetables synchronized successfully." });
  } catch (err) {
    console.error("Delete schedule error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
