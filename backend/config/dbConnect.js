// backend/config/dbConnect.js  (CommonJS)
//
// Atlas by default. Falls back to local MongoDB for a fully offline demo.
//   - normal            -> connects to Atlas (MONGO_URI)
//   - USE_LOCAL_DB=true  -> forces local (MONGO_URI_LOCAL)
//   - Atlas unreachable  -> auto-falls to local at startup
//
// The DB is chosen at server startup, so to switch modes: change the env var, restart.

const mongoose = require('mongoose');

async function connectDB() {
  const atlas = process.env.MONGO_URI;              // <-- match your existing var name
  const local = process.env.MONGO_URI_LOCAL;        // e.g. mongodb://127.0.0.1:27017/nepshop
  const forceLocal = process.env.USE_LOCAL_DB === 'true';

  if (forceLocal) {
    if (!local) throw new Error('USE_LOCAL_DB=true but MONGO_URI_LOCAL not set');
    await mongoose.connect(local, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB: LOCAL (forced offline mode)');
    return 'local';
  }

  try {
    await mongoose.connect(atlas, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB: Atlas (cloud)');
    return 'atlas';
  } catch (err) {
    console.warn('Atlas unreachable:', err.message);
    if (!local) throw err; // no local configured -> nothing to fall back to
    await mongoose.connect(local, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB: LOCAL (auto offline fallback)');
    return 'local';
  }
}

module.exports = { connectDB };