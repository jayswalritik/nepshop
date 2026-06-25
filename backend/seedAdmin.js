const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  Admin already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log('   If you forgot the password, delete the admin from Atlas and run this again.');
      process.exit(0);
    }

    // Create admin
    const admin = await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'rockr8379@gmail.com',
      phone: '9800000000',
      password: 'Test1234',
      role: 'admin',
      status: 'active',
    });

    console.log('✅ Admin account created successfully!');
    console.log('─────────────────────────────────────');
    console.log('   Email    : rockr8379@gmail.com');
    console.log('   Password : Test1234');
    console.log('   Role     : admin');
    console.log('─────────────────────────────────────');
    console.log('⚠️  Change this password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
};

seedAdmin();