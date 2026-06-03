import express from "express";
import User from "../models/user.js";
import Course from "../models/course.js";
import Report from "../models/report.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// POST /reports — student submits a report to rep
router.post("/", auth, async (req, res) => {
  try {
    const { message, courseId } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    const student = req.user;
    if (student.role !== 'student') {
      return res.status(403).json({ error: "Only students can submit reports." });
    }

    const repId = student.repId;
    if (!repId) return res.status(400).json({ error: "You are not assigned to any representative group." });

    // Verify representative exists
    const rep = await User.findById(repId);
    if (!rep) return res.status(404).json({ error: "Representative not found." });

    // Create Report document
    const report = new Report({
      studentId: student._id,
      repId,
      courseId: courseId || undefined,
      message,
      status: 'pending'
    });

    await report.save();

    // Defensive update to rep.reports for backward compatibility
    if (!rep.reports) rep.reports = [];
    rep.reports.push({
      studentId: student._id,
      message,
      createdAt: new Date(),
    });
    await rep.save();

    res.status(201).json({
      message: "Report submitted successfully.",
      report
    });
  } catch (err) {
    console.error("Submit report error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/student — view own submitted reports
router.get("/student", auth, async (req, res) => {
  try {
    const reports = await Report.find({ studentId: req.user._id })
      .populate("repId", "name email")
      .populate("courseId", "code name")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    console.error("Fetch student reports error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/rep — view reports submitted to rep
router.get("/rep", auth, requireRole("rep"), async (req, res) => {
  try {
    const reports = await Report.find({ repId: req.user._id })
      .populate("studentId", "name email matric")
      .populate("courseId", "code name")
      .sort({ createdAt: -1 });
    res.json(reports);
  } catch (err) {
    console.error("Fetch rep reports error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/lecturer — view escalated reports related to lecturer's courses
router.get("/lecturer", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    // 1. Find all courses taught by this lecturer
    const courses = await Course.find({ lecturerId: req.user._id });
    const courseIds = courses.map(c => c._id);

    // 2. Fetch escalated reports for these courses
    const reports = await Report.find({
      status: "escalated",
      courseId: { $in: courseIds }
    })
      .populate("studentId", "name email matric")
      .populate("repId", "name email")
      .populate("courseId", "code name")
      .sort({ createdAt: -1 });

    res.json(reports);
  } catch (err) {
    console.error("Fetch lecturer reports error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /reports/:id/escalate — escalate report to lecturer
router.post("/:id/escalate", auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found." });

    // Only student who wrote the report or their representative can escalate
    const isOwner = report.studentId.toString() === req.user._id.toString();
    const isRep = report.repId.toString() === req.user._id.toString();
    if (!isOwner && !isRep && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    report.status = "escalated";
    await report.save();

    res.json({ message: "Report escalated to lecturer successfully.", report });
  } catch (err) {
    console.error("Escalate report error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /reports/:id/resolve — resolve report
router.post("/:id/resolve", auth, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found." });

    // Determine authorization:
    // 1. Student's representative can resolve.
    // 2. The lecturer of the course can resolve if the report was escalated.
    const isRep = report.repId.toString() === req.user._id.toString();
    let isLecturer = false;

    if (report.status === "escalated" && report.courseId) {
      const course = await Course.findById(report.courseId);
      if (course && course.lecturerId.toString() === req.user._id.toString()) {
        isLecturer = true;
      }
    }

    if (!isRep && !isLecturer && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    report.status = "resolved";
    await report.save();

    res.json({ message: "Report resolved successfully.", report });
  } catch (err) {
    console.error("Resolve report error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
