import express from "express";
import User from "../models/user.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

// POST /reports — student reporting issue to rep (Authenticated)
router.post("/", auth, async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) return res.status(400).json({ error: "Missing fields" });

    // Validate that the logged in user matches the reporting student
    if (req.user._id.toString() !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const student = await User.findById(userId);
    if (!student) return res.status(404).json({ error: "Student not found" });

    const repId = student.repId;
    if (!repId) return res.status(400).json({ error: "Student has no rep assigned" });

    // For now, we just store it in rep's document (could also create a Report collection)
    const rep = await User.findById(repId);
    if (!rep) return res.status(404).json({ error: "Rep not found" });

    if (!rep.reports) rep.reports = [];
    rep.reports.push({
      studentId: student._id,
      message,
      createdAt: new Date(),
    });

    await rep.save();

    res.json({ message: "Report sent to rep successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
