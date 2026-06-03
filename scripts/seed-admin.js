import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import User from '../models/user.js';

dotenv.config();

const seedAdmin = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("Error: MONGODB_URI is not set in environment variables.");
      process.exit(1);
    }

    console.log("Connecting to database for seeding...");
    await connectDB(mongoUri);

    const salt = await bcrypt.genSalt(10);
    
    // Seed Admin if not exists
    const adminEmail = "admin@studysync.com";
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      console.log("Seeding default Admin...");
      const adminPasswordHash = await bcrypt.hash("AdminPassword2026", salt);
      const defaultAdmin = new User({
        name: "System Administrator",
        email: adminEmail,
        matric: "ADMIN001",
        passwordHash: adminPasswordHash,
        role: "admin",
        isApproved: true
      });
      await defaultAdmin.save();
      console.log("Admin seeded.");
    } else {
      console.log("Admin already exists.");
    }

    // Seed HOD if not exists
    const hodEmail = "hod@studysync.com";
    const existingHod = await User.findOne({ email: hodEmail });
    if (!existingHod) {
      console.log("Seeding default HOD...");
      const hodPasswordHash = await bcrypt.hash("HodPassword2026", salt);
      const defaultHod = new User({
        name: "HOD Computer Science",
        email: hodEmail,
        matric: "HOD001",
        passwordHash: hodPasswordHash,
        role: "hod",
        isApproved: true
      });
      await defaultHod.save();
      console.log("HOD seeded.");
    } else {
      console.log("HOD already exists.");
    }

    // Seed Lecturer if not exists
    const lecturerEmail = "lecturer@studysync.com";
    const existingLecturer = await User.findOne({ email: lecturerEmail });
    if (!existingLecturer) {
      console.log("Seeding default Lecturer...");
      const lecPasswordHash = await bcrypt.hash("LecturerPassword2026", salt);
      const defaultLecturer = new User({
        name: "Dr. Jane Smith",
        email: lecturerEmail,
        matric: "LEC001",
        passwordHash: lecPasswordHash,
        role: "lecturer",
        isApproved: true
      });
      await defaultLecturer.save();
      console.log("Lecturer seeded.");
    } else {
      console.log("Lecturer already exists.");
    }

    console.log("-----------------------------------------");
    console.log("Default Accounts Check/Seeding Completed!");
    console.log(`1. Admin: admin@studysync.com | password: AdminPassword2026`);
    console.log(`2. HOD: hod@studysync.com | password: HodPassword2026`);
    console.log(`3. Lecturer: lecturer@studysync.com | password: LecturerPassword2026`);
    console.log("-----------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("Failed to seed administrative accounts:", error);
    process.exit(1);
  }
};

seedAdmin();
