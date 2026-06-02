import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import User from './models/user.js';

dotenv.config();

const run = async () => {
  await connectDB(process.env.MONGODB_URI);
  const users = await User.find({});
  console.log("Total users in database:", users.length);
  users.forEach(u => {
    console.log(`- Name: ${u.name}, Role: ${u.role}, Email: ${u.email}, Matric: ${u.matric}, inviteCode: ${u.inviteCode}, repId: ${u.repId}`);
  });
  process.exit(0);
};

run();
