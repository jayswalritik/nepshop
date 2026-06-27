// Wipes all orders and returns — leaves users, products, carts intact.
// Use to reset for clean revenue testing.
require('dotenv').config();
const mongoose = require('mongoose');
const Order    = require('./models/Order');
const Return   = require('./models/Return');

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const orderCount  = await Order.countDocuments();
    const returnCount = await Return.countDocuments();

    await Order.deleteMany({});
    await Return.deleteMany({});

    console.log(`🗑️  Deleted ${orderCount} orders and ${returnCount} returns.`);
    console.log('✅ Orders cleared. Users, products, and carts are untouched.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
};

run();