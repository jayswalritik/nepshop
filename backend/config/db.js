const mongoose = require('mongoose');

// Connects to MongoDB.
//   • Normal            -> Atlas (MONGO_URI)
//   • USE_LOCAL_DB=true  -> forces local MongoDB (MONGO_URI_LOCAL)
//   • Atlas unreachable  -> auto-falls back to local if MONGO_URI_LOCAL is set
// The DB is chosen at startup, so to switch modes: change the env var, restart.

const connectDB = async () => {
  const local     = process.env.MONGO_URI_LOCAL;
  const forceLocal = process.env.USE_LOCAL_DB === 'true';

  // 1) Forced offline mode.
  if (forceLocal) {
    if (!local) {
      console.error('❌ USE_LOCAL_DB=true but MONGO_URI_LOCAL is not set');
      process.exit(1);
    }
    try {
      const conn = await mongoose.connect(local, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`✅ MongoDB Connected (LOCAL, forced offline): ${conn.connection.host}`);
      return;
    } catch (error) {
      console.error(`❌ Local MongoDB connection error: ${error.message}`);
      process.exit(1);
    }
  }

  // 2) Normal: try Atlas first.
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return;
  } catch (error) {
    console.error(`❌ Atlas connection error: ${error.message}`);

    // 3) Auto-fallback to local, if configured.
    if (!local) {
      process.exit(1); // no local fallback available — same as before
    }
    try {
      const conn = await mongoose.connect(local, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`✅ MongoDB Connected (LOCAL, auto offline fallback): ${conn.connection.host}`);
    } catch (localError) {
      console.error(`❌ Local MongoDB connection error: ${localError.message}`);
      process.exit(1);
    }
  }
};

module.exports = connectDB;