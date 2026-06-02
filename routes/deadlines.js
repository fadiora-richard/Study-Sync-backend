import express from "express";
import Deadline from "../models/deadline.js";
import User from "../models/user.js";
import { auth, requireRole } from "../middleware/auth.js";
import { scheduleDeadlineNotifications } from "../services/scheduler.js";

const router = express.Router();

// Create deadline (Rep only)
router.post("/", auth, requireRole("rep"), async (req, res) => {
  try {
    const { title, description, dueDate, repId } = req.body;

    if (!title || !dueDate || !repId)
      return res.status(400).json({ error: "Missing required fields." });

    // Ensure they only create deadlines for their own group
    if (req.user._id.toString() !== repId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const newDeadline = new Deadline({
      title,
      description,
      dueDate,
      repId
    });

    await newDeadline.save();

    // Dynamically schedule notifications in background
    try {
      await scheduleDeadlineNotifications(newDeadline);
    } catch (schedErr) {
      console.error("Failed to schedule notifications for new deadline:", schedErr);
    }

    res.json(newDeadline);

  } catch (err) {
    console.error("Create deadline error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get deadlines for a rep (Authenticated)
router.get("/:repId", auth, async (req, res) => {
  try {
    const deadlines = await Deadline.find({
      $or: [
        { repId: req.params.repId },
        { repId: req.params.repId.toString() }
      ]
    });
    res.json(deadlines);
  } catch (err) {
    console.error("Fetch deadlines error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update deadline (Rep only)
router.patch("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const deadline = await Deadline.findById(req.params.id);
    if (!deadline) return res.status(404).json({ error: "Deadline not found." });

    // Enforce rep ownership
    if (deadline.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await Deadline.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    // Update dynamic background notification triggers
    try {
      await scheduleDeadlineNotifications(updated);
    } catch (schedErr) {
      console.error("Failed to reschedule notifications for updated deadline:", schedErr);
    }

    res.json(updated);

  } catch (err) {
    console.error("Update deadline error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete deadline (Rep only)
router.delete("/:id", auth, requireRole("rep"), async (req, res) => {
  try {
    const deadline = await Deadline.findById(req.params.id);
    if (!deadline) return res.status(404).json({ error: "Deadline not found." });

    // Enforce rep ownership
    if (deadline.repId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    await Deadline.findByIdAndDelete(req.params.id);
    res.json({ message: "Deadline deleted successfully" });
  } catch (err) {
    console.error("Delete deadline error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Complete a deadline (Authenticated)
router.post("/complete", auth, async (req, res) => {
  try {
    const { userId, deadlineId } = req.body;

    if (!userId || !deadlineId)
      return res.status(400).json({ error: "Missing userId or deadlineId" });

    // Ensure users can only complete deadlines for themselves
    if (req.user._id.toString() !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ error: "User not found" });

    if (!user.completedDeadlines.includes(deadlineId)) {
      user.completedDeadlines.push(deadlineId);
    }

    await user.save();

    res.json({ message: "Task marked as complete", completedDeadlines: user.completedDeadlines });

  } catch (err) {
    console.error("Complete deadline error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
