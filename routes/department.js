import express from "express";
import User from "../models/user.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /department/directory — Fetch all students & lecturers in the HOD's department
router.get("/directory", auth, requireRole(["hod"]), async (req, res) => {
  try {
    const department = req.user.department;
    if (!department) {
      return res.status(400).json({ error: "Your HOD profile is not assigned to a department." });
    }

    // 1. Fetch all lecturers in the department
    const lecturers = await User.find({
      role: { $in: ["lecturer", "hod"] },
      department: department
    }).select("name email matric role department level");

    // 2. Fetch all students (and reps) in the department
    const students = await User.find({
      role: { $in: ["student", "rep"] },
      department: department
    })
      .populate("repId", "name email groupDescription")
      .select("name email matric role department level repId groupDescription");

    res.json({
      department,
      lecturers,
      students
    });
  } catch (err) {
    console.error("Fetch department directory error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
