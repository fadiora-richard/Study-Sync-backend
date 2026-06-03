import express from 'express';
import crypto from 'crypto';
import Course from '../models/course.js';
import User from '../models/user.js';
import AttendanceSession from '../models/attendanceSession.js';
import AttendanceRecord from '../models/attendanceRecord.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Helper: Haversine formula to calculate distance in meters between two GPS coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Start an attendance session (Lecturer only)
router.post('/session', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const { courseId, targetRepId, latitude, longitude, timeLimit, radius } = req.body;

    if (!courseId || latitude === undefined || longitude === undefined || !timeLimit) {
      return res.status(400).json({ error: 'Course ID, coordinates, and time limit are required.' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    // Verify lecturer ownership of course
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Verify target representative if provided
    if (targetRepId) {
      const repExists = await User.findOne({ _id: targetRepId, role: 'rep' });
      if (!repExists) {
        return res.status(404).json({ error: 'Selected representative group was not found.' });
      }
      const isAssigned = (course.repIds && course.repIds.some(id => id.toString() === targetRepId.toString())) ||
                         (course.repId && course.repId.toString() === targetRepId.toString());
      if (!isAssigned) {
        return res.status(400).json({ error: 'Selected representative group is not assigned to this course.' });
      }
    }

    // Generate dynamic QR token
    const qrToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + timeLimit * 60 * 1000);

    const session = new AttendanceSession({
      courseId,
      targetRepId: targetRepId || undefined,
      qrToken,
      latitude,
      longitude,
      radius: radius || 100, // Default 100 meters
      expiresAt
    });

    await session.save();

    res.status(201).json({
      sessionId: session._id,
      qrToken: session.qrToken,
      expiresAt: session.expiresAt
    });
  } catch (err) {
    console.error('Start attendance session error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit attendance via QR scanning (Student/Rep)
router.post('/submit', auth, async (req, res) => {
  try {
    const { qrToken, latitude, longitude } = req.body;

    if (!qrToken || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'QR Token and current coordinates are required.' });
    }

    // Find session and check expiration
    const session = await AttendanceSession.findOne({ qrToken });
    if (!session) {
      return res.status(400).json({ error: 'Invalid QR code.' });
    }

    if (new Date() > new Date(session.expiresAt)) {
      return res.status(400).json({ error: 'This attendance session has expired.' });
    }

    const course = await Course.findById(session.courseId);
    if (!course) {
      return res.status(404).json({ error: 'Associated course not found.' });
    }

    // Verify student is not excluded
    if (course.excludedStudents.includes(req.user._id)) {
      return res.status(403).json({ error: 'You have been excluded from this course due to excessive absences (exceeded 4 missed classes).' });
    }

    // Verify student belongs to this course rep group (any of the allocated rep groups)
    const studentRepId = req.user.role === 'rep' ? req.user._id : req.user.repId;

    // Check targeted cohort restrictions
    if (session.targetRepId && session.targetRepId.toString() !== studentRepId.toString()) {
      return res.status(403).json({ error: 'This attendance session is not for your cohort/group.' });
    }

    const hasRepPlural = course.repIds && course.repIds.some(id => id.toString() === studentRepId.toString());
    const hasRepSingular = course.repId && course.repId.toString() === studentRepId.toString();
    if (!hasRepPlural && !hasRepSingular) {
      return res.status(403).json({ error: 'You do not belong to any student group for this course.' });
    }

    // Location verification check
    const distance = calculateDistance(
      latitude,
      longitude,
      session.latitude,
      session.longitude
    );

    if (distance > session.radius) {
      return res.status(400).json({
        error: `Location check failed. You must be present in the classroom to sign in (Distance: ${Math.round(distance)}m, allowed: ${session.radius}m).`
      });
    }

    // Check for duplicate attendance record
    const existingRecord = await AttendanceRecord.findOne({
      sessionId: session._id,
      studentId: req.user._id
    });

    if (existingRecord) {
      return res.status(400).json({ error: 'Your attendance has already been logged for this session.' });
    }

    // Record attendance
    const record = new AttendanceRecord({
      sessionId: session._id,
      studentId: req.user._id,
      courseId: course._id
    });

    await record.save();

    // Check attendance thresholds (flag at 3, exclude at > 4 missed)
    const totalSessions = await AttendanceSession.countDocuments({
      courseId: course._id,
      $or: [
        { targetRepId: studentRepId },
        { targetRepId: { $exists: false } },
        { targetRepId: null }
      ]
    });
    const attendedCount = await AttendanceRecord.countDocuments({
      courseId: course._id,
      studentId: req.user._id
    });

    const missedCount = totalSessions - attendedCount;

    let warningMessage = 'Attendance logged successfully!';

    if (missedCount > 4) {
      // Auto-exclude student unless they have been manually reinstated
      const isReinstated = course.reinstatedStudents && course.reinstatedStudents.includes(req.user._id);
      if (isReinstated) {
        warningMessage = `Attendance logged. You have missed ${missedCount} classes, but you have a lecturer override.`;
      } else {
        if (!course.excludedStudents.includes(req.user._id)) {
          course.excludedStudents.push(req.user._id);
          await course.save();
        }
        warningMessage = `Attendance logged. However, you have missed ${missedCount} classes and have been automatically removed from this class.`;
      }
    } else if (missedCount >= 3) {
      warningMessage = `Attendance logged. Warning: You have missed ${missedCount} classes. You will be automatically removed if you miss more than 4 classes.`;
    }

    res.json({
      message: warningMessage,
      missedCount,
      attendedCount,
      totalSessions
    });
  } catch (err) {
    console.error('Submit attendance error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Nullify/Delete an attendance session (Lecturer only)
router.delete('/session/:id', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const session = await AttendanceSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Attendance session not found.' });
    }

    const course = await Course.findById(session.courseId);
    if (!course) {
      return res.status(404).json({ error: 'Associated course not found.' });
    }

    // Verify ownership
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete all records linked to this session
    await AttendanceRecord.deleteMany({ sessionId: session._id });

    // Delete the session itself
    await AttendanceSession.findByIdAndDelete(session._id);

    res.json({ message: 'Attendance session nullified/deleted successfully.' });
  } catch (err) {
    console.error('Nullify attendance session error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
