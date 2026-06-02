import express from "express";
import Announcement from "../models/announcement.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Create announcement (rep only)
router.post("/", auth, requireRole("rep"), async (req, res) => {
  try {
    const { repId, title, message } = req.body;

    if (!repId || !title || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Ensure rep is creating their own announcements
    if (req.user._id.toString() !== repId && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const announcement = new Announcement({ repId, title, message });
    await announcement.save();

    res.json(announcement);
  } catch (err) {
    console.error("Create announcement error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get announcements for a rep (Authenticated)
router.get("/:repId", auth, async (req, res) => {
  try {
    const { repId } = req.params;
    const announcements = await Announcement.find({
      $or: [
        { repId: repId },
        { repId: repId.toString() }
      ]
    }).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    console.error("Fetch announcements error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update announcement (rep only)
router.patch("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });

    // Enforce rep ownership
    if (announcement.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    console.error("Update announcement error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete announcement (rep only)
router.delete("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });

    // Enforce rep ownership
    if (announcement.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ message: "Announcement deleted successfully" });
  } catch (err) {
    console.error("Delete announcement error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
