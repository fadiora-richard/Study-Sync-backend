import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import User from '../models/user.js';
import Department from '../models/department.js';

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
        department: "Computer Science",
        isApproved: true
      });
      await defaultHod.save();
      console.log("HOD seeded.");
    } else {
      // Proactively ensure existing HOD has a department assigned
      if (!existingHod.department) {
        existingHod.department = "Computer Science";
        await existingHod.save();
        console.log("Updated existing HOD with Computer Science department.");
      } else {
        console.log("HOD already exists and has department.");
      }
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
        department: "Computer Science",
        isApproved: true
      });
      await defaultLecturer.save();
      console.log("Lecturer seeded.");
    } else {
      // Proactively ensure existing Lecturer has a department assigned
      if (!existingLecturer.department) {
        existingLecturer.department = "Computer Science";
        await existingLecturer.save();
        console.log("Updated existing Lecturer with Computer Science department.");
      } else {
        console.log("Lecturer already exists and has department.");
      }
    }

    // Seed Representative if not exists
    const repEmail = "rep@studysync.com";
    const existingRep = await User.findOne({ email: repEmail });
    if (!existingRep) {
      console.log("Seeding default Representative...");
      const repPasswordHash = await bcrypt.hash("RepPassword2026", salt);
      const defaultRep = new User({
        name: "Richard Fadiora",
        email: repEmail,
        matric: "CSC-REP-01",
        passwordHash: repPasswordHash,
        role: "rep",
        department: "Computer Science",
        level: "200",
        groupDescription: "Computer Science Year 2",
        inviteCode: "SYNC-CS20",
        isApproved: true
      });
      await defaultRep.save();
      console.log("Representative seeded.");
    } else {
      console.log("Representative already exists.");
    }

    // Seed default departments with custom level lists
    console.log("Seeding default departments...");
    const defaultDepts = [
      { name: "Computer Science", code: "CSC", levels: ["100", "200", "300", "400"] },
      { name: "Software Engineering", code: "SEN", levels: ["100", "200", "300", "400"] },
      { name: "Nursing", code: "NUR", levels: ["100", "200", "300", "400", "500"] },
      { name: "Medicine", code: "MED", levels: ["100", "200", "300", "400", "500", "600"] }
    ];

    for (const d of defaultDepts) {
      const existingDept = await Department.findOne({ code: d.code });
      if (!existingDept) {
        const newDept = new Department(d);
        await newDept.save();
        console.log(`Seeded department: ${d.name} (${d.code})`);
      } else {
        // Ensure levels are updated to match in case of modifications
        existingDept.levels = d.levels;
        await existingDept.save();
        console.log(`Verified levels for department: ${d.name}`);
      }
    }

    console.log("-----------------------------------------");
    console.log("Default Accounts & Departments Seeding Completed!");
    console.log(`1. Admin: admin@studysync.com | password: AdminPassword2026`);
    console.log(`2. HOD: hod@studysync.com | password: HodPassword2026 (Computer Science)`);
    console.log(`3. Lecturer: lecturer@studysync.com | password: LecturerPassword2026 (Computer Science)`);
    console.log(`4. Representative: rep@studysync.com | password: RepPassword2026 (Computer Science Level 200, inviteCode: SYNC-CS20)`);
    console.log("-----------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("Failed to seed administrative accounts:", error);
    process.exit(1);
  }
};

seedAdmin();
