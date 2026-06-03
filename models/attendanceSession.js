import mongoose from 'mongoose';

const attendanceSessionSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  targetRepId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional cohort target group
  qrToken: { type: String, required: true, unique: true }, // The dynamic token encoded in QR code
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  radius: { type: Number, default: 100 }, // Geofence radius in meters
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.AttendanceSession || mongoose.model('AttendanceSession', attendanceSessionSchema);
