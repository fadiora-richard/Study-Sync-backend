import mongoose from "mongoose";

const classScheduleSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  day: { type: String, required: true }, // e.g., 'Monday'
  startTime: { type: String, required: true }, // e.g., '09:00'
  endTime: { type: String, required: true }, // e.g., '10:30'
  location: { type: String, required: true },
  repIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Target cohorts
  department: { type: String, required: false },
  level: { type: String, required: false },
  semester: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.ClassSchedule || mongoose.model("ClassSchedule", classScheduleSchema);
