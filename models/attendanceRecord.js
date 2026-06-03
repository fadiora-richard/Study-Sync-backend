import mongoose from 'mongoose';

const attendanceRecordSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  timestamp: { type: Date, default: Date.now }
});

// A student can only sign in once per attendance session
attendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

export default mongoose.models.AttendanceRecord || mongoose.model('AttendanceRecord', attendanceRecordSchema);
