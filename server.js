import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import deadlineRoutes from './routes/deadlines.js';
import pushRoutes from './routes/push.js';
import adminRoutes from "./routes/admin.js";
import studentRoutes from "./routes/students.js";
import userRoutes from "./routes/users.js";
import timetableRoutes from "./routes/timetables.js";
import announcementRoutes from "./routes/announcements.js";
import reportRoutes from "./routes/reports.js";
import { scheduleAllUpcomingDeadlines } from './services/scheduler.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    // Establish DB connection first
    await connectDB(process.env.MONGODB_URI);

    // Register all routes
    app.use('/auth', authRoutes);
    app.use('/admin', adminRoutes);
    app.use('/students', studentRoutes);
    app.use('/deadlines', deadlineRoutes);
    app.use('/timetables', timetableRoutes);
    app.use('/announcements', announcementRoutes);
    app.use('/users', userRoutes);
    app.use('/reports', reportRoutes);
    app.use('/push', pushRoutes);

    app.get('/', (req, res) => res.json({ message: 'StudySync backend API is fully functional.' }));

    // schedule existing deadlines into cron jobs at startup
    scheduleAllUpcomingDeadlines();

    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
})();
