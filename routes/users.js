import express from "express";
import User from "../models/user.js";
import bcrypt from "bcryptjs";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// GET /users/department/lecturers (HOD and Admin only) - view lecturers in HOD's department
router.get("/department/lecturers", auth, requireRole(["hod", "admin"]), async (req, res) => {
  try {
    let department = req.query.department || req.user.department;

    if (!department && req.user.role !== 'admin') {
      return res.status(400).json({ error: "Your account does not have a department assigned, and no department query was provided." });
    }

    const query = { role: "lecturer" };
    if (department) {
      query.department = department;
    }

    const lecturers = await User.find(query).select("-passwordHash");
    res.json(lecturers);
  } catch (err) {
    console.error("Fetch department lecturers error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET USER BY ID (student or rep) - Secure and strip passwordHash
router.get("/:id", auth, async (req, res) => {
  try {
    // Only allow the user themselves, their assigned rep, or an admin to view their profile
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin' && req.user.role !== 'rep') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ error: "User not found" });

    // Defensively generate and save missing inviteCode for reps on details load
    if (user.role === "rep" && !user.inviteCode) {
      let inviteCode = "";
      let unique = false;
      while (!unique) {
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        inviteCode = `SYNC-${rand}`;
        const existingCode = await User.findOne({ inviteCode });
        if (!existingCode) unique = true;
      }
      user.inviteCode = inviteCode;
      await user.save();
      console.log(`[Defensive Profile API Update] Populated missing inviteCode for rep: ${user.name} -> ${inviteCode}`);
    }

    // Convert mongoose document to object to strip sensitive passwordHash cleanly
    const userObj = user.toObject();
    delete userObj.passwordHash;

    res.json(userObj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH UPDATE PROFILE
router.patch("/:id", auth, async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { name, email, groupDescription } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;
    if (groupDescription !== undefined) user.groupDescription = groupDescription;

    await user.save();

    const userObj = user.toObject();
    delete userObj.passwordHash;
    res.json(userObj);
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH CHANGE PASSWORD
router.patch("/:id/password", auth, async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old password and new password are required." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!ok) return res.status(400).json({ error: "Invalid old password." });

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
