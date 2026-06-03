import express from "express";
import Deadline from "../models/deadline.js";
import User from "../models/user.js";
import Course from "../models/course.js";
import { auth, requireRole } from "../middleware/auth.js";
import { scheduleDeadlineNotifications } from "../services/scheduler.js";

const router = express.Router();

// Create deadline (rep, lecturer, hod)
router.post("/", auth, requireRole(["rep", "lecturer", "hod"]), async (req, res) => {
  try {
    const { title, description, dueDate, repId, courseId } = req.body;

    if (!title || !dueDate) {
      return res.status(400).json({ error: "Title and due date are required." });
    }

    let targetRepIds = [];
    
    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }
      // Check authorization (lecturer owns course, HOD/admin can bypass)
      if (req.user.role !== 'admin' && req.user.role !== 'hod' && course.lecturerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: "Forbidden. You do not teach this course." });
      }
      targetRepIds = course.repIds || [];
    } else if (repId) {
      targetRepIds = [repId];
      // Check authorization based on role
      if (req.user.role === 'rep' && req.user._id.toString() !== repId.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (req.user.role === 'lecturer' || req.user.role === 'hod') {
        // Verify lecturer teaches this rep group
        const course = await Course.findOne({ repIds: repId, lecturerId: req.user._id });
        if (!course && req.user.role !== 'admin' && req.user.role !== 'hod') {
          return res.status(403).json({ error: "Forbidden. You do not teach this student group." });
        }
      }
    }

    if (targetRepIds.length === 0) {
      return res.status(400).json({ error: "repId or courseId is required to identify the target student group(s)." });
    }

    const deadlines = [];
    for (const rId of targetRepIds) {
      const newDeadline = new Deadline({
        title,
        description,
        dueDate,
        repId: rId,
        courseId,
        authorId: req.user._id
      });
      await newDeadline.save();

      // Dynamically schedule notifications in background
      try {
        await scheduleDeadlineNotifications(newDeadline);
      } catch (schedErr) {
        console.error("Failed to schedule notifications for new deadline:", schedErr);
      }

      deadlines.push(newDeadline);
    }

    res.json(deadlines.length === 1 ? deadlines[0] : deadlines);
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

// Update deadline (rep, lecturer, hod)
router.patch("/:id", auth, requireRole(["rep", "lecturer", "hod"]), async (req, res) => {
  try {
    const deadline = await Deadline.findById(req.params.id);
    if (!deadline) return res.status(404).json({ error: "Deadline not found." });

    // Enforce ownership
    const isAuthor = deadline.authorId && deadline.authorId.toString() === req.user._id.toString();
    const isRep = deadline.repId.toString() === req.user._id.toString();
    if (!isAuthor && !isRep && req.user.role !== 'admin') {
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

// Delete deadline (rep, lecturer, hod)
router.delete("/:id", auth, requireRole(["rep", "lecturer", "hod"]), async (req, res) => {
  try {
    const deadline = await Deadline.findById(req.params.id);
    if (!deadline) return res.status(404).json({ error: "Deadline not found." });

    // Enforce ownership
    const isAuthor = deadline.authorId && deadline.authorId.toString() === req.user._id.toString();
    const isRep = deadline.repId.toString() === req.user._id.toString();
    if (!isAuthor && !isRep && req.user.role !== 'admin') {
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
