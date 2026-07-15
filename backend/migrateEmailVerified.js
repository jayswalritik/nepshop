// Marks all EXISTING users as email-verified, so the new verification
// requirement only applies to NEW registrations. Run once.
const path = require('path');
// Absolute path — must not depend on the directory this script is launched from.
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./models/User');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const result = await User.updateMany(
      { isEmailVerified: { $ne: true } },
      { $set: { isEmailVerified: true } }
    );
    console.log(`✅ Marked ${result.modifiedCount} existing users as email-verified.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
};

run();