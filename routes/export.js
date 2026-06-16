import express from "express";
import Course from "../models/course.js";
import ClassSchedule from "../models/classSchedule.js";
import Deadline from "../models/deadline.js";
import Announcement from "../models/announcement.js";
import Report from "../models/report.js";
import User from "../models/user.js";
import Timetable from "../models/timetable.js";
import AttendanceSession from "../models/attendanceSession.js";
import AttendanceRecord from "../models/attendanceRecord.js";
import { auth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Helper to convert arrays to CSV string
const convertToCSV = (data, headers) => {
  const escape = (val) => {
    if (val === null || val === undefined) return "";
    let str = String(val).trim();
    if (str.includes(",") || str.includes("\n") || str.includes('"')) {
      str = str.replace(/"/g, '""');
      return `"${str}"`;
    }
    return str;
  };

  const headerRow = headers.map(h => escape(h.label)).join(",");
  const rows = data.map(item => {
    return headers.map(h => escape(item[h.key])).join(",");
  });

  return [headerRow, ...rows].join("\r\n");
};

// GET /export/semesters (Authenticated)
router.get("/semesters", auth, async (req, res) => {
  try {
    const semesters = new Set();
    const [
      coursesSem,
      schedulesSem,
      timetablesSem,
      deadlinesSem,
      announcementsSem,
      reportsSem
    ] = await Promise.all([
      Course.distinct("semester"),
      ClassSchedule.distinct("semester"),
      Timetable.distinct("semester"),
      Deadline.distinct("semester"),
      Announcement.distinct("semester"),
      Report.distinct("semester")
    ]);

    [
      ...coursesSem,
      ...schedulesSem,
      ...timetablesSem,
      ...deadlinesSem,
      ...announcementsSem,
      ...reportsSem
    ].forEach(s => {
      if (s && s.trim()) {
        semesters.add(s.trim());
      }
    });

    // Fallback if none exist
    if (semesters.size === 0) {
      semesters.add("semester1");
    }

    res.json(Array.from(semesters).sort());
  } catch (err) {
    console.error("Fetch export semesters error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/lecturer/classes?semester=... (Lecturer/HOD only)
router.get("/lecturer/classes", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    const { semester } = req.query;
    if (!semester) return res.status(400).json({ error: "Semester parameter is required." });

    const classes = await ClassSchedule.find({
      lecturerId: req.user._id,
      semester: String(semester)
    }).populate("courseId", "code name");

    const data = classes.map(c => ({
      courseCode: c.courseId ? c.courseId.code : "N/A",
      courseName: c.courseId ? c.courseId.name : "N/A",
      day: c.day,
      startTime: c.startTime,
      endTime: c.endTime,
      location: c.location,
      department: c.department || "All",
      level: c.level || "All"
    }));

    const csv = convertToCSV(data, [
      { label: "Course Code", key: "courseCode" },
      { label: "Course Name", key: "courseName" },
      { label: "Day of Week", key: "day" },
      { label: "Start Time", key: "startTime" },
      { label: "End Time", key: "endTime" },
      { label: "Location", key: "location" },
      { label: "Target Department", key: "department" },
      { label: "Target Level", key: "level" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="classes_${semester}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export lecturer classes error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/lecturer/attendance?semester=...&courseId=... (Lecturer/HOD only)
router.get("/lecturer/attendance", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    const { semester, courseId } = req.query;
    if (!semester || !courseId) {
      return res.status(400).json({ error: "Semester and courseId parameters are required." });
    }

    const course = await Course.findOne({
      _id: courseId,
      lecturerId: req.user._id,
      semester: String(semester)
    });

    if (!course) {
      return res.status(404).json({ error: "Course allocation not found for this semester." });
    }

    // Roster retrieval logic matching routes/courses.js
    const repIdsList = [...(course.repIds || [])];
    if (course.repId && !repIdsList.some(id => id.toString() === course.repId.toString())) {
      repIdsList.push(course.repId);
    }

    const students = await User.find({
      role: 'student',
      isApproved: true,
      repId: { $in: repIdsList }
    }).select('name matric email repId groupDescription');

    const reps = await User.find({ _id: { $in: repIdsList }, role: 'rep' })
      .select('name matric email groupDescription');

    const allUsers = [...students, ...reps];

    const roster = [];
    for (const student of allUsers) {
      const studentRepId = student.repId || student._id;

      // Eligible sessions
      const studentTotalSessions = await AttendanceSession.countDocuments({
        courseId: course._id,
        $or: [
          { targetRepId: studentRepId },
          { targetRepId: { $exists: false } },
          { targetRepId: null }
        ]
      });

      const attendedSessions = await AttendanceRecord.countDocuments({
        courseId: course._id,
        studentId: student._id
      });

      const missedCount = studentTotalSessions - attendedSessions;
      const isExcluded = course.excludedStudents && course.excludedStudents.some(id => id.toString() === student._id.toString());
      let status = "Normal";
      if (isExcluded || missedCount > 4) status = "Excluded";
      else if (missedCount >= 3) status = "Flagged";

      roster.push({
        name: student.name,
        matric: student.matric || "N/A",
        email: student.email,
        role: student.role === "rep" ? "Class Representative" : "Student",
        cohort: student.groupDescription || "Default Cohort",
        totalSessions: studentTotalSessions,
        attended: attendedSessions,
        missed: missedCount,
        attendanceRate: studentTotalSessions > 0 ? `${Math.round((attendedSessions / studentTotalSessions) * 100)}%` : "0%",
        status
      });
    }

    const csv = convertToCSV(roster, [
      { label: "Student Name", key: "name" },
      { label: "Matric Number", key: "matric" },
      { label: "Email Address", key: "email" },
      { label: "Role", key: "role" },
      { label: "Cohort Group", key: "cohort" },
      { label: "Eligible Sessions", key: "totalSessions" },
      { label: "Sessions Attended", key: "attended" },
      { label: "Sessions Missed", key: "missed" },
      { label: "Attendance Rate", key: "attendanceRate" },
      { label: "Status", key: "status" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="attendance_${course.code}_${semester}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export lecturer attendance error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/lecturer/deadlines?semester=... (Lecturer/HOD only)
router.get("/lecturer/deadlines", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    const { semester } = req.query;
    if (!semester) return res.status(400).json({ error: "Semester parameter is required." });

    const deadlines = await Deadline.find({
      authorId: req.user._id,
      semester: String(semester)
    }).populate("courseId", "code name").populate("repId", "groupDescription");

    const data = deadlines.map(d => ({
      title: d.title,
      description: d.description || "",
      dueDate: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : "",
      course: d.courseId ? `${d.courseId.code} - ${d.courseId.name}` : "N/A",
      targetCohort: d.repId ? d.repId.groupDescription : "General Group"
    }));

    const csv = convertToCSV(data, [
      { label: "Title", key: "title" },
      { label: "Description", key: "description" },
      { label: "Due Date", key: "dueDate" },
      { label: "Associated Course", key: "course" },
      { label: "Target Cohort", key: "targetCohort" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="lecturer_deadlines_${semester}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export lecturer deadlines error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/lecturer/announcements?semester=... (Lecturer/HOD only)
router.get("/lecturer/announcements", auth, requireRole(["lecturer", "hod"]), async (req, res) => {
  try {
    const { semester } = req.query;
    if (!semester) return res.status(400).json({ error: "Semester parameter is required." });

    const announcements = await Announcement.find({
      authorId: req.user._id,
      semester: String(semester)
    }).populate("courseId", "code name").populate("repId", "groupDescription");

    const data = announcements.map(a => ({
      title: a.title,
      message: a.message,
      course: a.courseId ? `${a.courseId.code} - ${a.courseId.name}` : "General",
      targetCohort: a.repId ? a.repId.groupDescription : "General Group",
      dateCreated: a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""
    }));

    const csv = convertToCSV(data, [
      { label: "Title", key: "title" },
      { label: "Message / Details", key: "message" },
      { label: "Associated Course", key: "course" },
      { label: "Target Cohort", key: "targetCohort" },
      { label: "Date Created", key: "dateCreated" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="lecturer_announcements_${semester}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export lecturer announcements error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/rep/tasks?semester=... (Representative only)
router.get("/rep/tasks", auth, requireRole("rep"), async (req, res) => {
  try {
    const { semester } = req.query;
    if (!semester) return res.status(400).json({ error: "Semester parameter is required." });

    const deadlines = await Deadline.find({
      repId: req.user._id,
      semester: String(semester)
    }).populate("courseId", "code name");

    const data = deadlines.map(d => ({
      title: d.title,
      description: d.description || "",
      dueDate: d.dueDate ? new Date(d.dueDate).toLocaleDateString() : "",
      course: d.courseId ? `${d.courseId.code} - ${d.courseId.name}` : "General",
      createdDate: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : ""
    }));

    const csv = convertToCSV(data, [
      { label: "Task Title", key: "title" },
      { label: "Description", key: "description" },
      { label: "Due Date", key: "dueDate" },
      { label: "Course Reference", key: "course" },
      { label: "Date Created", key: "createdDate" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="rep_deadlines_${semester}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export rep deadlines error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/rep/reports?semester=... (Representative only)
router.get("/rep/reports", auth, requireRole("rep"), async (req, res) => {
  try {
    const { semester } = req.query;
    if (!semester) return res.status(400).json({ error: "Semester parameter is required." });

    const reports = await Report.find({
      repId: req.user._id,
      semester: String(semester)
    }).populate("studentId", "name matric email").populate("courseId", "code name");

    const data = reports.map(r => ({
      studentName: r.studentId ? r.studentId.name : "Unknown Student",
      studentMatric: r.studentId ? r.studentId.matric : "N/A",
      studentEmail: r.studentId ? r.studentId.email : "N/A",
      course: r.courseId ? `${r.courseId.code} - ${r.courseId.name}` : "General",
      message: r.message,
      status: r.status,
      dateCreated: r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""
    }));

    const csv = convertToCSV(data, [
      { label: "Student Name", key: "studentName" },
      { label: "Matric Number", key: "studentMatric" },
      { label: "Email Address", key: "studentEmail" },
      { label: "Course Subject", key: "course" },
      { label: "Report Message", key: "message" },
      { label: "Resolution Status", key: "status" },
      { label: "Date Created", key: "dateCreated" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="rep_reports_${semester}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export rep reports error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/rep/announcements?semester=... (Representative only)
router.get("/rep/announcements", auth, requireRole("rep"), async (req, res) => {
  try {
    const { semester } = req.query;
    if (!semester) return res.status(400).json({ error: "Semester parameter is required." });

    const announcements = await Announcement.find({
      repId: req.user._id,
      semester: String(semester)
    }).populate("courseId", "code name");

    const data = announcements.map(a => ({
      title: a.title,
      message: a.message,
      course: a.courseId ? `${a.courseId.code} - ${a.courseId.name}` : "General",
      dateCreated: a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ""
    }));

    const csv = convertToCSV(data, [
      { label: "Title", key: "title" },
      { label: "Message", key: "message" },
      { label: "Course Reference", key: "course" },
      { label: "Date Created", key: "dateCreated" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="rep_announcements_${semester}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export rep announcements error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /export/rep/students (Representative only)
router.get("/rep/students", auth, requireRole("rep"), async (req, res) => {
  try {
    const students = await User.find({
      repId: req.user._id,
      role: "student"
    });

    const data = students.map(s => ({
      name: s.name,
      matric: s.matric || "N/A",
      email: s.email,
      isApproved: s.isApproved ? "Approved" : "Pending Approval",
      dateJoined: s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ""
    }));

    const csv = convertToCSV(data, [
      { label: "Student Name", key: "name" },
      { label: "Matric Number", key: "matric" },
      { label: "Email Address", key: "email" },
      { label: "Status", key: "isApproved" },
      { label: "Date Joined", key: "dateJoined" }
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="rep_students.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Export rep student list error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
