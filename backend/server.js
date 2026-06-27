const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorMiddleware');
const cron = require('node-cron');


// ── Load environment variables ────────────────────────────
dotenv.config();

// ── Connect to MongoDB ────────────────────────────────────
connectDB();


// Daily admin summary — runs every day at 8:00 PM Nepal time
cron.schedule('0 14 * * *', async () => {
  try {
    const User = require('./models/User');
    const { sendDailyAdminSummary } = require('./utils/emailService');
    const admin = await User.findOne({ role: 'admin' });
    if (admin) {
      console.log('📊 Sending daily admin summary...');
      await sendDailyAdminSummary(admin.email);
    }
  } catch (err) {
    console.error('Daily summary failed:', err.message);
  }
}, { timezone: 'Asia/Kathmandu' });

// Settlement release — runs every day, releases seller funds past their 7-day lock
//cron.schedule('0 1 * * *', async () => {       // uncomment for 7 day lock (1:00 AM Nepal time)

// Settlement release — TESTING: every minute. PRODUCTION: '0 1 * * *'
cron.schedule('0 18 * * *', async () => {
  try {
    const Order = require('./models/Order');
    const now = new Date();

    // Find delivered orders whose lock has expired but seller not yet released
    const toRelease = await Order.find({
      status: 'delivered',
      'settlement.status': 'partial',
      'settlement.sellerReleased': false,
      'settlement.lockUntil': { $lte: now },
    });

    let released = 0;
    const { sendSettlementReleasedEmail } = require('./utils/emailService');
    const UserModel = require('./models/User');
    for (const order of toRelease) {
      order.settlement.status           = 'released';
      order.settlement.sellerReleased   = true;
      order.settlement.sellerReleasedAt = now;
      order.settlement.commissionBooked = true;
      order.settlement.settledAt        = now;
      await order.save();
      // Email the seller(s) that their earnings cleared
      const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
      for (const sid of sellerIds) {
        const seller = await UserModel.findById(sid);
        if (seller) sendSettlementReleasedEmail(seller, order);
      }
      released++;
    }

    if (released > 0) {
      console.log(`💰 Settlement: released ${released} order(s) past their 7-day window`);
    }
  } catch (err) {
    console.error('Settlement release failed:', err.message);
  }
}, { timezone: 'Asia/Kathmandu' });

const app = express();

// ── Core Middleware ───────────────────────────────────────

// CORS — allow requests from the frontend
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));
// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'NepShop API is running',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/delivery', require('./routes/deliveryRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/returns', require('./routes/returnRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));

// Future routes (we'll add these in later steps):
// app.use('/api/products',  require('./routes/productRoutes'));
// app.use('/api/orders',    require('./routes/orderRoutes'));
// app.use('/api/admin',     require('./routes/adminRoutes'));
// app.use('/api/delivery',  require('./routes/deliveryRoutes'));

// ── 404 handler (unknown routes) ─────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// ── Global error handler (must be last) ──────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 NepShop server running on port ${PORT} [${process.env.NODE_ENV}]`);
});
