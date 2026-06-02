import express from "express";
import Timetable from "../models/timetable.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// CREATE a timetable (rep only)
router.post("/", auth, requireRole("rep"), async (req, res) => {
  try {
    const { repId, semester, entries } = req.body;

    if (!repId || !semester || !entries) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Ensure they can only update/create their own timetable
    if (req.user._id.toString() !== repId && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Optionally remove old timetable for this rep & semester
    await Timetable.deleteMany({
      semester,
      $or: [
        { repId },
        { repId: repId.toString() }
      ]
    });

    const timetable = new Timetable({ repId, semester, entries });
    await timetable.save();

    res.json(timetable);

  } catch (err) {
    console.error("Create timetable error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET timetable for a rep & semester (Authenticated)
router.get("/:repId/:semester", auth, async (req, res) => {
  try {
    const { repId, semester } = req.params;
    const timetable = await Timetable.findOne({
      semester,
      $or: [
        { repId },
        { repId: repId.toString() }
      ]
    });
    res.json(timetable);
  } catch (err) {
    console.error("Fetch timetable error:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE timetable by ID (rep only)
router.patch("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.id);
    if (!timetable) return res.status(404).json({ error: "Timetable not found" });

    // Enforce rep ownership
    if (timetable.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await Timetable.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    console.error("Update timetable error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE timetable by ID (rep only)
router.delete("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.id);
    if (!timetable) return res.status(404).json({ error: "Timetable not found" });

    // Enforce rep ownership
    if (timetable.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    await Timetable.findByIdAndDelete(req.params.id);
    res.json({ message: "Timetable deleted successfully" });
  } catch (err) {
    console.error("Delete timetable error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
