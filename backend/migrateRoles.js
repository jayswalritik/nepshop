// One-time migration — backfills roles[] and activeRole for existing users
const path = require('path');
// Absolute path — must not depend on the directory this script is launched from.
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User     = require('./models/User');

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const users = await User.find({});
    console.log(`Found ${users.length} users to check.`);

    let updated = 0;
    let skipped = 0;

    for (const user of users) {
      // Skip if already migrated
      if (user.roles && user.roles.length > 0 && user.activeRole) {
        skipped++;
        continue;
      }

      user.roles      = [user.role];
      user.activeRole = user.role;
      await user.save();
      updated++;
      console.log(`  → ${user.email}: roles=[${user.role}], activeRole=${user.role}`);
    }

    console.log(`\n✅ Migration complete. Updated: ${updated}, Skipped (already done): ${skipped}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
};

migrate();