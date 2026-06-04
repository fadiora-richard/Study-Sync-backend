import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  levels: [{ type: String, required: true }] // e.g. ["100", "200", "300", "400"]
});

export default mongoose.models.Department || mongoose.model('Department', departmentSchema);
