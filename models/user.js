import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  matric: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['student', 'rep', 'lecturer', 'hod', 'admin'], default: 'student' },
  isApproved: { type: Boolean, default: function() { return this.role !== 'student'; } },
  isRejected: { type: Boolean, default: false },
  groupDescription: { type: String, required: false },
  department: { type: String, required: false },
  group: { type: String, required: false },
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