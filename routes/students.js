import express from "express";
import User from "../models/user.js";
import bcrypt from "bcryptjs";
import mongoose from 'mongoose';
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET all students assigned to a rep (Rep, Lecturer, HOD, and Admin)
router.get("/", auth, requireRole(["rep", "lecturer", "hod"]), async (req, res) => {
  try {
    let repId = req.user._id;
    if (req.user.role !== "rep") {
      repId = req.query.repId;
      if (!repId) {
        return res.status(400).json({ error: "repId query parameter is required for non-representative users." });
      }
    }

    const students = await User.find({
      role: "student",
      $or: [
        { repId: repId },
        { repId: repId.toString() }
      ]
    }).select("-passwordHash");
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create a new student (rep only)
router.post("/", auth, requireRole("rep"), async (req, res) => {
  try {
    const { name, email, matric, password } = req.body;
    const repId = req.user._id;

    if (!name || !matric || !password) {
      return res.status(400).json({ error: "Name, matric number, and password are required." });
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address format." });
      }
    }

    // Check if matric already in use
    const existingMatric = await User.findOne({ matric });
    if (existingMatric) {
      return res.status(400).json({ error: "Matric number already in use." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const student = new User({
      name,
      email: email || undefined,
      matric,
      passwordHash: hashed,
      role: "student",
      repId: repId,
      isApproved: true // Manually registered students are approved by default
    });

    await student.save();
    
    // Return student details excluding sensitive hash
    const responseData = student.toObject();
    delete responseData.passwordHash;
    
    res.status(201).json(responseData);
  } catch (err) {
    console.error("Create student error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH approve a student (rep only)
router.patch("/:id/approve", auth, requireRole("rep"), async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Ensure the student belongs to this representative
    if (student.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    student.isApproved = true;
    await student.save();

    res.json({ message: "Student approved successfully", isApproved: student.isApproved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit a student (rep only)
router.patch("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const { name, email, matric } = req.body;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address format." });
      }
    }

    const student = await User.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Ensure the student belongs to this representative
    if (student.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    student.name = name || student.name;
    student.email = email || student.email;
    student.matric = matric || student.matric;

    await student.save();
    
    const responseData = student.toObject();
    delete responseData.passwordHash;

    res.json(responseData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a student (rep only)
router.delete("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const student = await User.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Ensure only the rep who owns the student (or admin) can delete
    if (student.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    console.error("Error deleting student:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
