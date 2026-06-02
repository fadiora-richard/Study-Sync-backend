import cron from 'node-cron';
import { sendPushNotifications, getPushTokensForStudents } from './pushservice.js';
import Deadline from '../models/deadline.js';
import User from '../models/user.js';

const scheduledJobs = new Map();

export const scheduleDeadlineNotifications = async (deadline) => {
  const id = deadline._id.toString();

  if (scheduledJobs.has(id)) {
    const jobs = scheduledJobs.get(id);
    jobs.forEach(j => j.stop && j.stop());
  }

  const sendAt = (date) => {
    const d = new Date(date);
    return `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`;
  };

  const due = new Date(deadline.dueDate);
  const times = [
    new Date(due.getTime() - 24 * 60 * 60 * 1000),
    new Date(due.getTime() - 60 * 60 * 1000)
  ];

  const jobs = [];

  for (const t of times) {
    if (t.getTime() <= Date.now()) continue;

    const cronExpr = sendAt(t);

    const job = cron.schedule(cronExpr, async () => {
      try {
        // Fetch all students under the rep defensively (supporting both ObjectId and String values)
        const students = await User.find({
          role: "student",
          $or: [
            { repId: deadline.repId },
            { repId: deadline.repId.toString() }
          ]
        });
        const studentIds = students.map(s => s._id);

        const tokens = await getPushTokensForStudents(studentIds);
        if (!tokens || tokens.length === 0) return;

        const messages = tokens.map(token => ({
          to: token,
          title: `Upcoming deadline: ${deadline.title}`,
          body: `Due at ${due.toUTCString()}`,
          data: { deadlineId: id }
        }));

        await sendPushNotifications(messages);
      } catch (err) {
        console.error('Error sending scheduled push', err);
      }
    }, { scheduled: true, timezone: 'UTC' });

    jobs.push(job);
  }

  if (jobs.length > 0) scheduledJobs.set(id, jobs);

  return jobs;
};

export const scheduleAllUpcomingDeadlines = async () => {
  try {
    const upcoming = await Deadline.find({ dueDate: { $gt: new Date() } });
    for (const d of upcoming) {
      scheduleDeadlineNotifications(d);
    }
    console.log(`Scheduled notifications for ${upcoming.length} deadline(s)`);
  } catch (err) {
    console.error('Failed to schedule deadlines at startup', err);
  }
};
