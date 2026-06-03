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
      repId: finalRepIds[0], // for legacy single rep query support
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
      .populate('repIds', 'name email inviteCode groupDescription matric')
      .populate('repId', 'name email inviteCode groupDescription matric');

    // Add derived classIdentifier (joins rep group descriptions)
    const coursesList = courses.map(course => {
      const courseObj = course.toObject();
      let reps = course.repIds || [];
      if (reps.length === 0 && course.repId) {
        reps = [course.repId];
        courseObj.repIds = [course.repId];
      }
      const descriptions = reps.map(r => r ? (r.groupDescription || r.name || 'Unnamed Group') : 'Unnamed Group');
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

    // Find all courses where student's repId is in repIds list or equals repId
    const courses = await Course.find({
      $or: [
        { repIds: repId },
        { repId: repId }
      ],
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

    const repIdsList = [...(course.repIds || [])];
    if (course.repId && !repIdsList.some(id => id.toString() === course.repId.toString())) {
      repIdsList.push(course.repId);
    }

    // Get all approved students in the course's rep groups
    const students = await User.find({
      role: 'student',
      isApproved: true,
      repId: { $in: repIdsList }
    }).select('name matric email repId groupDescription group');

    // Also get the representatives since they are also students and take classes
    const reps = await User.find({ _id: { $in: repIdsList }, role: 'rep' })
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

// PATCH /courses/:id (Lecturer/HOD only) - Update course allocation details
router.patch('/:id', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const { code, name, repIds } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    // Verify ownership
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== 'admin' && req.user.role !== 'hod') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (code) course.code = code.trim().toUpperCase();
    if (name) course.name = name.trim();

    if (repIds && Array.isArray(repIds)) {
      if (repIds.length === 0) {
        return res.status(400).json({ error: 'At least one representative group is required.' });
      }

      // Verify representatives exist
      const verifiedRepsCount = await User.countDocuments({ _id: { $in: repIds }, role: 'rep' });
      if (verifiedRepsCount !== repIds.length) {
        return res.status(404).json({ error: 'One or more representative groups were not found.' });
      }

      course.repIds = repIds;
      course.repId = repIds[0]; // legacy fallback
    }

    await course.save();

    // Populate for response
    await course.populate('repIds', 'name email inviteCode groupDescription matric');
    await course.populate('repId', 'name email inviteCode groupDescription matric');

    const courseObj = course.toObject();
    let reps = course.repIds || [];
    if (reps.length === 0 && course.repId) {
      reps = [course.repId];
      courseObj.repIds = [course.repId];
    }
    const descriptions = reps.map(r => r ? (r.groupDescription || r.name || 'Unnamed Group') : 'Unnamed Group');
    courseObj.classIdentifier = descriptions.join(' & ');

    res.json(courseObj);
  } catch (err) {
    console.error('Update course error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /courses/:id (Lecturer/HOD only) - Performs cascade delete of course and all its attendance sessions/records
router.delete('/:id', auth, requireRole(['lecturer', 'hod']), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    // Verify ownership
    if (course.lecturerId.toString() !== req.user._id.toString() && req.user.role !== 'admin' && req.user.role !== 'hod') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    console.log(`[Lecturer Cascade Delete] Deleting Course: ${course.code} (${course._id})`);

    // 1. Delete all attendance records associated with this course
    const recordDeleteRes = await AttendanceRecord.deleteMany({ courseId: course._id });
    console.log(`- Deleted ${recordDeleteRes.deletedCount} attendance records`);

    // 2. Delete all attendance sessions associated with this course
    const sessionDeleteRes = await AttendanceSession.deleteMany({ courseId: course._id });
    console.log(`- Deleted ${sessionDeleteRes.deletedCount} attendance sessions`);

    // 3. Delete the course record itself
    await Course.findByIdAndDelete(course._id);
    console.log(`- Course record deleted successfully.`);

    res.json({
      message: 'Course and all associated attendance data deleted successfully.',
      stats: {
        records: recordDeleteRes.deletedCount,
        sessions: sessionDeleteRes.deletedCount
      }
    });
  } catch (err) {
    console.error('Delete course error:', err);
    res.status(500).json({ error: 'Server error performing course cascade deletion' });
  }
});

export default router;
