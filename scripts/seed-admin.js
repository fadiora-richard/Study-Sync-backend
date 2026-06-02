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

    const adminEmail = "admin@studysync.com";
    const existingAdmin = await User.findOne({ role: "admin" });

    if (existingAdmin) {
      console.log(`Admin user already exists in the system:`);
      console.log(`- Name: ${existingAdmin.name}`);
      console.log(`- Email: ${existingAdmin.email}`);
      console.log(`- Matric: ${existingAdmin.matric}`);
      console.log("No seeding required.");
      process.exit(0);
    }

    console.log("No administrative user found. Seeding default system administrator...");

    const password = "AdminPassword2026";
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const defaultAdmin = new User({
      name: "System Administrator",
      email: adminEmail,
      matric: "ADMIN001",
      passwordHash: passwordHash,
      role: "admin",
    });

    await defaultAdmin.save();

    console.log("-----------------------------------------");
    console.log("Default Administrator Seeded Successfully!");
    console.log(`- Email: ${adminEmail}`);
    console.log(`- Matric: ADMIN001`);
    console.log(`- Password: ${password}`);
    console.log("-----------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("Failed to seed administrative account:", error);
    process.exit(1);
  }
};

seedAdmin();
