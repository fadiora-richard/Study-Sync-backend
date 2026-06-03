import mongoose from "mongoose";

const deadlineSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  dueDate: { type: Date, required: true },

  repId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: false
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false
  },

  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.Deadline || mongoose.model("Deadline", deadlineSchema);
