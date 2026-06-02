import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  matric: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['student', 'rep', 'admin'], default: 'student' },
  createdAt: { type: Date, default: Date.now },
  repId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  inviteCode: { type: String, unique: true, sparse: true },

  completedDeadlines: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deadline"
    }
  ],

  reports: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      message: String,
      createdAt: Date
    }
  ],
});

export default mongoose.models.User || mongoose.model('User', userSchema);