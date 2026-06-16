import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  repId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: false },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  title: { type: String, required: true },
  message: { type: String, required: true },
  semester: { type: String, required: true, default: "semester1" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);
