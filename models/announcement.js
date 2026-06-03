import mongoose from "mongoose";

const announcementSchema = new mongoose.Schema({
  repId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: false },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  title: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Announcement", announcementSchema);
