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
    const { code, name, repId, repIds, repMatrics } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Course code and name are required.' });
    }

    let finalRepIds = [];

    // Support multiple inputs (repMatrics, repIds, or legacy single repId)
    if (repMatrics && Array.isArray(repMatrics)) {
      const reps = await User.find({ matric: { $in: repMatrics }, role: 'rep' });
      finalRepIds = reps.map(r => r._id);
      if (finalRepIds.length === 0) {
        return res.status(404).json({ error: 'No representatives found matching the provided matric numbers.' });
      }
    } else if (repIds && Array.isArray(repIds)) {
      finalRepIds = repIds;
    } else if (repId) {
      finalRepIds = [repId];
    }

    if (finalRepIds.length === 0) {
      return res.status(400).json({ error: 'At least one representative (or matric number) is required.' });
    }

    // Verify representatives actually exist and have correct role
    const verifiedRepsCount = await User.countDocuments({ _id: { $in: finalRepIds }, role: 'rep' });
    if (verifiedRepsCount !== finalRepIds.length) {
      return res.status(404).json({ error: 'One or more representative groups were not found.' });
    }

    // Verify that none of these representatives are already assigned to this course code for this lecturer
    const existing = await Course.findOne({
      code: code.trim().toUpperCase(),
      lecturerId: req.user._id,
      repIds: { $in: finalRepIds }
    });
    if (existing) {
      return res.status(400).json({ error: 'One or more of the selected representatives are already assigned to this course code under your account.' });
    }

    const course = new Course({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      lecturerId: req.user._id,
      repIds: finalRepIds
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
      .populate('repIds', 'name email inviteCode groupDescription matric');

    // Add derived classIdentifier (joins rep group descriptions)
    const coursesList = courses.map(course => {
      const courseObj = course.toObject();
      const descriptions = (course.repIds || []).map(r => r.groupDescription || r.name || 'Unnamed Group');
      courseObj.classIdentifier = descriptions.join(' & ');
      return courseObj;
    });

    res.json(coursesList);
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

    // Find all courses where student's repId is in repIds list
    const courses = await Course.find({
      repIds: repId,
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

    // Get all approved students in the course's rep groups
    const students = await User.find({
      role: 'student',
      isApproved: true,
      repId: { $in: course.repIds }
    }).select('name matric email repId groupDescription group');

    // Also get the representatives since they are also students and take classes
    const reps = await User.find({ _id: { $in: course.repIds }, role: 'rep' })
      .select('name matric email groupDescription group');
    
    // Combine students and reps
    const allCohortUsers = [...students];
    for (const rep of reps) {
      if (rep.isApproved !== false) {
        allCohortUsers.push(rep);
      }
    }

    // Fetch all attendance sessions for this course
    const totalSessions = await AttendanceSession.countDocuments({ courseId: course._id });

    // Build roster statistics
    const roster = [];
    for (const student of allCohortUsers) {
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
        role: student.role,
        repId: student.repId || student._id,
        groupDescription: student.groupDescription,
        group: student.group,
        totalSessions,
        attendedSessions,
        missedClasses: missedCount,
        isFlagged: missedCount >= 3 && missedCount <= 4,
        isExcluded: isExcluded || missedCount > 4
      });
    }

    // Generate groupedRoster (group by representative's groupDescription)
    const groupedRoster = {};
    const repMap = {};
    reps.forEach(r => {
      repMap[r._id.toString()] = r.groupDescription || r.name || 'Unnamed Cohort';
    });

    roster.forEach(student => {
      const repKey = student.repId ? student.repId.toString() : student._id.toString();
      const cohortName = repMap[repKey] || 'Other Cohort';
      if (!groupedRoster[cohortName]) {
        groupedRoster[cohortName] = [];
      }
      groupedRoster[cohortName].push(student);
    });

    res.json({
      courseCode: course.code,
      courseName: course.name,
      totalSessions,
      roster,
      groupedRoster
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
