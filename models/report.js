import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: false },
  message: { type: String, required: true },
  status: { type: String, enum: ['pending', 'escalated', 'resolved'], default: 'pending' },
  semester: { type: String, required: true, default: "semester1" },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Report || mongoose.model('Report', reportSchema);
