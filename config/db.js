import mongoose from 'mongoose';

export const connectDB = async (uri) => {
  try {
    await mongoose.connect(uri, {
      
    });
    console.log('MongoDB connected');
  } catch (err) {
    console.error('Connection error:', err);
    throw err;
  }
};
