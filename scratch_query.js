import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import User from './models/user.js';

dotenv.config();

const run = async () => {
  try {
    await connectDB(process.env.MONGODB_URI);
    
    console.log("Dropping index email_1...");
    await User.collection.dropIndex('email_1');
    console.log("Dropped successfully.");

    // Re-sync indexes (optional, mongoose can recreate them on model compilation/connection)
    console.log("Rebuilding indexes...");
    await User.createIndexes();
    console.log("Indexes rebuilt.");

    const indexes = await User.collection.indexes();
    console.log("Updated indexes:", JSON.stringify(indexes, null, 2));

  } catch (error) {
    console.error("Error occurred:", error);
  } finally {
    process.exit(0);
  }
};

run();
