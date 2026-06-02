import mongoose from 'mongoose';

const pushTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  token: { type: String, required: true }, 
  platform: String,
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.models.PushToken || mongoose.model('PushToken', pushTokenSchema);