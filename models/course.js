import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  code: { type: String, required: true }, // e.g., CSC201
  name: { type: String, required: true }, // e.g., Object Oriented Programming
  lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Representative group
  excludedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Excluded students due to > 4 missed classes
  reinstatedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Overridden exclusion students
  createdAt: { type: Date, default: Date.now }
});

// Set a compound index so a course code is unique per student group (repId)
courseSchema.index({ code: 1, repId: 1 }, { unique: true });

export default mongoose.models.Course || mongoose.model('Course', courseSchema);
