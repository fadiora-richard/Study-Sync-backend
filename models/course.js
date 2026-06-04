import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  code: { type: String, required: true }, // e.g., CSC201
  name: { type: String, required: true }, // e.g., Object Oriented Programming
  lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Legacy single representative group
  repIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Representative groups (cohorts)
  excludedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Excluded students due to > 4 missed classes
  reinstatedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Overridden exclusion students
  department: { type: String, required: false },
  level: { type: String, required: false },
  createdAt: { type: Date, default: Date.now }
});

// Set a compound index for query performance (non-unique to allow parallel classes)
courseSchema.index({ code: 1, lecturerId: 1 });

export default mongoose.models.Course || mongoose.model('Course', courseSchema);
