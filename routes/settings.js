import express from "express";
import Settings from "../models/settings.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /settings/current (Authenticated)
router.get("/current", auth, async (req, res) => {
  try {
    let setting = await Settings.findOne({ key: "currentSemester" });
    if (!setting) {
      setting = new Settings({ key: "currentSemester", value: "semester1" });
      await setting.save();
    }
    res.json({ currentSemester: setting.value });
  } catch (err) {
    console.error("Get current semester error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /settings/current (Admin only)
router.post("/current", auth, requireRole("admin"), async (req, res) => {
  try {
    const { semester } = req.body;
    if (!semester || !semester.trim()) {
      return res.status(400).json({ error: "Semester name is required." });
    }

    let setting = await Settings.findOne({ key: "currentSemester" });
    const oldSemester = setting ? setting.value : null;

    if (oldSemester !== semester.trim()) {
      if (setting) {
        setting.value = semester.trim();
        await setting.save();
      } else {
        setting = new Settings({ key: "currentSemester", value: semester.trim() });
        await setting.save();
      }
      
      console.log(`[Semester Change] Active semester updated from "${oldSemester}" to "${semester.trim()}".`);
    }

    res.json({ message: "Semester updated successfully", currentSemester: setting.value });
  } catch (err) {
    console.error("Set current semester error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
