import express from "express";
import Announcement from "../models/announcement.js";
import Course from "../models/course.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Create announcement (rep, lecturer, hod)
router.post("/", auth, requireRole(["rep", "lecturer", "hod"]), async (req, res) => {
  try {
    const { repId, courseId, title, message } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required." });
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
      targetRepIds = [...(course.repIds || [])];
      if (course.repId && !targetRepIds.some(id => id.toString() === course.repId.toString())) {
        targetRepIds.push(course.repId);
      }
    } else if (repId) {
      targetRepIds = [repId];
      // Check authorization based on role
      if (req.user.role === 'rep' && req.user._id.toString() !== repId.toString() && req.user.role !== 'admin') {
        return res.status(403).json({ error: "Forbidden" });
      }
      if (req.user.role === 'lecturer' || req.user.role === 'hod') {
        // Verify lecturer teaches this rep group
        const course = await Course.findOne({
          $or: [
            { repIds: repId },
            { repId: repId }
          ],
          lecturerId: req.user._id
        });
        if (!course && req.user.role !== 'admin' && req.user.role !== 'hod') {
          return res.status(403).json({ error: "Forbidden. You do not teach this student group." });
        }
      }
    }

    if (targetRepIds.length === 0) {
      return res.status(400).json({ error: "repId or courseId is required to identify the target student group(s)." });
    }

    const announcements = [];
    for (const rId of targetRepIds) {
      const announcement = new Announcement({
        repId: rId,
        courseId,
        authorId: req.user._id,
        title,
        message
      });
      await announcement.save();
      announcements.push(announcement);
    }

    res.json(announcements.length === 1 ? announcements[0] : announcements);
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

// Get announcements for a course (Authenticated)
router.get("/course/:courseId", auth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const announcements = await Announcement.find({
      courseId: courseId
    }).sort({ createdAt: -1 });
    res.json(announcements);
  } catch (err) {
    console.error("Fetch course announcements error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update announcement (rep, lecturer, hod)
router.patch("/:id", auth, requireRole(["rep", "lecturer", "hod"]), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });

    // Enforce ownership
    const isAuthor = announcement.authorId && announcement.authorId.toString() === req.user._id.toString();
    const isRep = announcement.repId.toString() === req.user._id.toString();
    if (!isAuthor && !isRep && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updated = await Announcement.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    console.error("Update announcement error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete announcement (rep, lecturer, hod)
router.delete("/:id", auth, requireRole(["rep", "lecturer", "hod"]), async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: "Announcement not found" });

    // Enforce ownership
    const isAuthor = announcement.authorId && announcement.authorId.toString() === req.user._id.toString();
    const isRep = announcement.repId.toString() === req.user._id.toString();
    if (!isAuthor && !isRep && req.user.role !== 'admin') {
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
