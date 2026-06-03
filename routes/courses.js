import express from 'express';
import Course from '../models/course.js';
import User from '../models/user.js';
import AttendanceSession from '../models/attendanceSession.js';
import AttendanceRecord from '../models/attendanceRecord.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Create a new course allocation (Lecturer/HOD only)
router.post('/', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const { code, name, repId } = req.body;
    if (!code || !name || !repId) {
      return res.status(400).json({ error: 'Course code, name, and representative ID are required.' });
    }

    // Check if the representative actually exists and is a representative
    const rep = await User.findOne({ _id: repId, role: 'rep' });
    if (!rep) {
      return res.status(404).json({ error: 'Representative group not found.' });
    }

    // Verify course uniqueness for this representative group
    const existing = await Course.findOne({ code: code.trim().toUpperCase(), repId });
    if (existing) {
      return res.status(400).json({ error: 'This course is already allocated to this group.' });
    }

    const course = new Course({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      lecturerId: req.user._id,
      repId
    });

    await course.save();
    res.status(201).json(course);
  } catch (err) {
    console.error('Create course error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all courses taught by the logged-in lecturer
router.get('/lecturer', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const courses = await Course.find({ lecturerId: req.user._id })
      .populate('repId', 'name email inviteCode');
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all courses assigned to a student/rep group
router.get('/student', auth, async (req, res) => {
  try {
    const repId = req.user.role === 'rep' ? req.user._id : req.user.repId;
    if (!repId) {
      return res.status(400).json({ error: 'No representative group linked to this account.' });
    }

    // Find all courses allocated to this rep group
    const courses = await Course.find({
      repId,
      excludedStudents: { $ne: req.user._id } // exclude if student has been kicked out
    }).populate('lecturerId', 'name email');

    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get student roster and attendance summary for a course (Lecturer only)
router.get('/:id/students', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Ensure the logged-in lecturer owns this course allocation (or is HOD/admin)
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== 'admin' && req.user.role !== 'hod') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get all approved students in this rep group
    const students = await User.find({
      role: 'student',
      isApproved: true,
      $or: [
        { repId: course.repId },
        { repId: course.repId.toString() }
      ]
    }).select('name matric email');

    // Also get the representative since they are also a student and take classes
    const rep = await User.findOne({ _id: course.repId, role: 'rep' }).select('name matric email');
    if (rep && rep.isApproved !== false) {
      students.push(rep);
    }

    // Fetch all attendance sessions for this course
    const totalSessions = await AttendanceSession.countDocuments({ courseId: course._id });

    // Build roster statistics
    const roster = [];
    for (const student of students) {
      const attendedSessions = await AttendanceRecord.countDocuments({
        courseId: course._id,
        studentId: student._id
      });

      const missedCount = totalSessions - attendedSessions;
      const isExcluded = course.excludedStudents.includes(student._id);

      roster.push({
        _id: student._id,
        name: student.name,
        matric: student.matric,
        email: student.email,
        role: student._id.toString() === course.repId.toString() ? 'rep' : 'student',
        totalSessions,
        attendedSessions,
        missedClasses: missedCount,
        isFlagged: missedCount >= 3 && missedCount <= 4,
        isExcluded: isExcluded || missedCount > 4
      });
    }

    res.json({
      courseCode: course.code,
      courseName: course.name,
      totalSessions,
      roster
    });
  } catch (err) {
    console.error('Fetch course students error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /courses/:id/exclude (Lecturer and HOD only) - Manually exclude student
router.post('/:id/exclude', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    // Ensure authorization (lecturer owns course, or HOD/admin)
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== 'admin' && req.user.role !== 'hod') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Add to excluded if not already there
    if (!course.excludedStudents.includes(studentId)) {
      course.excludedStudents.push(studentId);
    }
    // Remove from reinstated if they are in it
    course.reinstatedStudents = course.reinstatedStudents.filter(
      id => id.toString() !== studentId.toString()
    );

    await course.save();
    res.json({
      message: 'Student excluded successfully.',
      excludedStudents: course.excludedStudents,
      reinstatedStudents: course.reinstatedStudents
    });
  } catch (err) {
    console.error('Exclude student error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /courses/:id/reinstate (Lecturer and HOD only) - Reinstate student and override auto-exclusion
router.post('/:id/reinstate', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    // Ensure authorization (lecturer owns course, or HOD/admin)
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== 'admin' && req.user.role !== 'hod') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Remove from excluded
    course.excludedStudents = course.excludedStudents.filter(
      id => id.toString() !== studentId.toString()
    );
    // Add to reinstated if not already there
    if (!course.reinstatedStudents.includes(studentId)) {
      course.reinstatedStudents.push(studentId);
    }

    await course.save();
    res.json({
      message: 'Student reinstated successfully.',
      excludedStudents: course.excludedStudents,
      reinstatedStudents: course.reinstatedStudents
    });
  } catch (err) {
    console.error('Reinstate student error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
