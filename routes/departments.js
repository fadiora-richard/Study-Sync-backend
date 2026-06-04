import express from "express";
import Department from "../models/department.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /departments — Fetch all departments with their levels (Public/Authenticated)
router.get("/", async (req, res) => {
  try {
    const depts = await Department.find({}).sort({ name: 1 });
    res.json(depts);
  } catch (err) {
    console.error("Get departments error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /departments — Create a new department with configured levels (Admin only)
router.post("/", auth, requireRole("admin"), async (req, res) => {
  try {
    const { name, code, levels } = req.body;
    if (!name || !code || !levels || !Array.isArray(levels) || levels.length === 0) {
      return res.status(400).json({ error: "Name, unique code, and an array of levels are required." });
    }

    const cleanCode = code.toUpperCase().trim();
    const cleanName = name.trim();

    // Check if code or name already exists
    const existing = await Department.findOne({
      $or: [{ code: cleanCode }, { name: cleanName }]
    });

    if (existing) {
      return res.status(400).json({ error: "A department with this name or code already exists." });
    }

    const dept = new Department({
      name: cleanName,
      code: cleanCode,
      levels: levels.map(String)
    });

    await dept.save();
    res.status(201).json(dept);
  } catch (err) {
    console.error("Create department error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /departments/:id — Update department name, code, or levels (Admin only)
router.patch("/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const { name, code, levels } = req.body;
    const dept = await Department.findById(req.params.id);
    if (!dept) {
      return res.status(404).json({ error: "Department not found." });
    }

    if (name) {
      const cleanName = name.trim();
      const existingName = await Department.findOne({ name: cleanName, _id: { $ne: req.params.id } });
      if (existingName) {
        return res.status(400).json({ error: "A department with this name already exists." });
      }
      dept.name = cleanName;
    }

    if (code) {
      const cleanCode = code.toUpperCase().trim();
      const existingCode = await Department.findOne({ code: cleanCode, _id: { $ne: req.params.id } });
      if (existingCode) {
        return res.status(400).json({ error: "A department with this code already exists." });
      }
      dept.code = cleanCode;
    }

    if (levels) {
      if (!Array.isArray(levels) || levels.length === 0) {
        return res.status(400).json({ error: "Levels must be a non-empty array of strings." });
      }
      dept.levels = levels.map(String);
    }

    await dept.save();
    res.json(dept);
  } catch (err) {
    console.error("Update department error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /departments/:id — Delete a department configuration (Admin only)
router.delete("/:id", auth, requireRole("admin"), async (req, res) => {
  try {
    const dept = await Department.findByIdAndDelete(req.params.id);
    if (!dept) {
      return res.status(404).json({ error: "Department not found." });
    }
    res.json({ message: "Department configuration deleted successfully.", id: req.params.id });
  } catch (err) {
    console.error("Delete department error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
