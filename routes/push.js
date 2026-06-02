import express from 'express';
import PushToken from '../models/pushtoken.js';
import { auth } from '../middleware/auth.js';
const router = express.Router();


router.post('/register', auth, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ message: 'token required' });

    
    await PushToken.findOneAndUpdate(
      { user: req.user._id, token },
      { user: req.user._id, token, platform },
      { upsert: true }
    );
    return res.json({ message: 'Token registered' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/unregister', auth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'token required' });
    await PushToken.deleteOne({ user: req.user._id, token });
    return res.json({ message: 'Token removed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;