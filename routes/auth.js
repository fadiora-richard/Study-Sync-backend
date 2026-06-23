import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import Settings from '../models/settings.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;


router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const cleanIdentifier = identifier.includes('@') ? identifier.toLowerCase().trim() : identifier.toUpperCase().trim();
    
    const user = await User.findOne({ $or: [{ matric: cleanIdentifier }, { email: cleanIdentifier }] });
    if (!user) return res.status(400).json({ message: 'User not found' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    // Enforce account approval check
    if (user.isRejected === true) {
      return res.status(403).json({ message: 'Your account registration has been rejected' });
    }

    if (user.isApproved === false) {
      return res.status(403).json({ message: 'Your account is awaiting approval' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, role: user.role, userId: user._id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { name, email, matric, password, role, signupKey, inviteCode } = req.body;

    if (!name || !password || !role) {
      return res.status(400).json({ message: "Name, password, and role are required." });
    }

    // Require matric for student and rep roles
    if ((role === 'student' || role === 'rep') && !matric) {
      return res.status(400).json({ message: "Matric number is required." });
    }

    const cleanEmail = email ? email.toLowerCase().trim() : undefined;
    const cleanMatric = matric ? matric.toUpperCase().trim() : undefined;

    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ message: "Invalid email address format." });
      }
      const emailExists = await User.findOne({ email: cleanEmail });
      if (emailExists) {
        if (emailExists.isRejected) {
          await User.deleteOne({ _id: emailExists._id });
        } else {
          return res.status(400).json({ message: "Email already in use." });
        }
      }
    }

    if (cleanMatric) {
      const matricExists = await User.findOne({ matric: cleanMatric });
      if (matricExists) {
        if (matricExists.isRejected) {
          await User.deleteOne({ _id: matricExists._id });
        } else {
          return res.status(400).json({ message: "Matric number already in use." });
        }
      }
    }

    let userRepId = undefined;
    let userInviteCode = undefined;
    let userDepartment = undefined;
    let userLevel = undefined;

    if (role === 'rep') {
      let inviteCodeSetting = await Settings.findOne({ key: "repInviteCode" });
      const correctKey = inviteCodeSetting ? inviteCodeSetting.value : (process.env.REP_SIGNUP_KEY || 'StudySyncRep2026');
      if (!signupKey || signupKey !== correctKey) {
        return res.status(403).json({ message: "Invalid or missing Representative Signup Key." });
      }

      userDepartment = req.body.department;
      userLevel = req.body.level;

      // Generate unique invite code
      let unique = false;
      while (!unique) {
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        userInviteCode = `SYNC-${rand}`;
        const existing = await User.findOne({ inviteCode: userInviteCode });
        if (!existing) unique = true;
      }
    } else if (role === 'student') {
      if (!inviteCode) {
        return res.status(400).json({ message: "Class Invitation Code is required for students." });
      }

      const rep = await User.findOne({ inviteCode: inviteCode.trim().toUpperCase(), role: 'rep' });
      if (!rep) {
        return res.status(400).json({ message: "Invalid Class Invitation Code. Rep not found." });
      }

      userRepId = rep._id;
      // Inherit department and level from representative
      userDepartment = rep.department;
      userLevel = rep.level;
    } else {
      return res.status(400).json({ message: "Invalid role specified." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email: cleanEmail,
      matric: cleanMatric,
      passwordHash,
      role,
      repId: userRepId,
      inviteCode: userInviteCode,
      department: userDepartment,
      level: userLevel
    });

    await newUser.save();

    return res.status(201).json({
      message: "Registration successful",
      role: newUser.role,
      inviteCode: newUser.inviteCode
    });

  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Server error during registration." });
  }
});

export default router;