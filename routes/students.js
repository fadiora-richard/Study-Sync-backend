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

    const includeRejected = req.query.includeRejected === "true";
    const query = {
      role: "student",
      $or: [
        { repId: repId },
        { repId: repId.toString() }
      ]
    };
    if (!includeRejected) {
      query.isRejected = { $ne: true };
    }

    const students = await User.find(query).select("-passwordHash");
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

    const cleanEmail = email ? email.toLowerCase().trim() : undefined;
    const cleanMatric = matric.toUpperCase().trim();

    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Invalid email address format." });
      }
      const existingEmail = await User.findOne({ email: cleanEmail });
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use." });
      }
    }

    // Check if matric already in use
    const existingMatric = await User.findOne({ matric: cleanMatric });
    if (existingMatric) {
      return res.status(400).json({ error: "Matric number already in use." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const student = new User({
      name,
      email: cleanEmail,
      matric: cleanMatric,
      passwordHash: hashed,
      role: "student",
      repId: repId,
      isApproved: true, // Manually registered students are approved by default
      approvedAt: new Date()
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
    if ((!student.repId || student.repId.toString() !== req.user._id.toString()) && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    student.isApproved = true;
    student.isRejected = false;
    student.approvedAt = new Date();
    await student.save();

    res.json({ message: "Student approved successfully", isApproved: student.isApproved, isRejected: student.isRejected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH reject a student (rep only)
router.patch("/:id/reject", auth, requireRole("rep"), async (req, res) => {
  try {
    const student = await User.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Ensure the student belongs to this representative
    if ((!student.repId || student.repId.toString() !== req.user._id.toString()) && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    student.isApproved = false;
    student.isRejected = true;
    await student.save();

    res.json({ message: "Student registration rejected successfully", isApproved: student.isApproved, isRejected: student.isRejected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit a student (rep only)
router.patch("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const { name, email, matric } = req.body;
    const cleanEmail = email ? email.toLowerCase().trim() : undefined;
    const cleanMatric = matric ? matric.toUpperCase().trim() : undefined;

    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Invalid email address format." });
      }
      const existingEmail = await User.findOne({ email: cleanEmail, _id: { $ne: req.params.id } });
      if (existingEmail) {
        return res.status(400).json({ error: "Email already in use." });
      }
    }

    if (cleanMatric) {
      const existingMatric = await User.findOne({ matric: cleanMatric, _id: { $ne: req.params.id } });
      if (existingMatric) {
        return res.status(400).json({ error: "Matric number already in use." });
      }
    }

    const student = await User.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Ensure the student belongs to this representative
    if ((!student.repId || student.repId.toString() !== req.user._id.toString()) && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    student.name = name || student.name;
    if (cleanEmail !== undefined) student.email = cleanEmail;
    if (cleanMatric !== undefined) student.matric = cleanMatric;

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

    // Ensure only the rep who owns the student (or admin) can delete/reject
    if ((!student.repId || student.repId.toString() !== req.user._id.toString()) && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    student.isApproved = false;
    student.isRejected = true;
    await student.save();

    res.json({ message: "Student invite cancelled and registration rejected", isApproved: false, isRejected: true });
  } catch (err) {
    console.error("Error deleting student:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
