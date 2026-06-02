import mongoose from "mongoose";

const timetableSchema = new mongoose.Schema({
  repId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  semester: { type: String, required: true },
  entries: [
    {
      day: { type: String, required: true }, // e.g., Monday
      startTime: { type: String, required: true }, // "08:00"
      endTime: { type: String, required: true }, // "09:30"
      subject: { type: String, required: true },
      location: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Timetable", timetableSchema);
