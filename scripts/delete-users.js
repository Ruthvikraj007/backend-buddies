// Script to delete all users from database
import '../src/config/env.js';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

async function deleteAllUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const result = await mongoose.connection.db.collection('users').deleteMany({});
    console.log(`🗑️  Deleted ${result.deletedCount} users`);
    console.log('✅ Done! Database connection remains open.');
    
    // Keep connection open - don't close or exit
    console.log('💡 Press Ctrl+C to exit when ready.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteAllUsers();
