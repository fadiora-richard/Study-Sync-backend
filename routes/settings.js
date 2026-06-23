import express from "express";
import Settings from "../models/settings.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /settings/current (Authenticated)
router.get("/current", auth, async (req, res) => {
  try {
    let semesterSetting = await Settings.findOne({ key: "currentSemester" });
    if (!semesterSetting) {
      semesterSetting = new Settings({ key: "currentSemester", value: "semester1" });
      await semesterSetting.save();
    }

    let inviteCodeSetting = await Settings.findOne({ key: "repInviteCode" });
    if (!inviteCodeSetting) {
      inviteCodeSetting = new Settings({ key: "repInviteCode", value: process.env.REP_SIGNUP_KEY || "StudySyncRep2026" });
      await inviteCodeSetting.save();
    }

    res.json({ 
      currentSemester: semesterSetting.value,
      repInviteCode: inviteCodeSetting.value
    });
  } catch (err) {
    console.error("Get current settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /settings/current (Admin only)
router.post("/current", auth, requireRole("admin"), async (req, res) => {
  try {
    const { semester, repInviteCode } = req.body;
    const responseObj = {};

    if (semester !== undefined) {
      if (!semester.trim()) {
        return res.status(400).json({ error: "Semester name is required." });
      }
      let setting = await Settings.findOne({ key: "currentSemester" });
      if (setting) {
        setting.value = semester.trim();
        await setting.save();
      } else {
        setting = new Settings({ key: "currentSemester", value: semester.trim() });
        await setting.save();
      }
      responseObj.currentSemester = setting.value;
      console.log(`[Semester Change] Active semester updated to "${setting.value}".`);
    }

    if (repInviteCode !== undefined) {
      if (!repInviteCode.trim()) {
        return res.status(400).json({ error: "Representative signup key is required." });
      }
      let setting = await Settings.findOne({ key: "repInviteCode" });
      if (setting) {
        setting.value = repInviteCode.trim();
        await setting.save();
      } else {
        setting = new Settings({ key: "repInviteCode", value: repInviteCode.trim() });
        await setting.save();
      }
      responseObj.repInviteCode = setting.value;
      console.log(`[Rep Invite Code Change] Invite code updated to "${setting.value}".`);
    }

    res.json({ message: "Settings updated successfully", ...responseObj });
  } catch (err) {
    console.error("Set settings error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
