const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
// Some local networks/ISPs block SRV record queries to the default resolver,
// which breaks mongodb+srv:// lookups (querySrv ECONNREFUSED) even though
// the network itself is fine. Public DNS resolves them without issue.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// ── Load environment variables ────────────────────────────
// MUST run before any require() that reads process.env at module-load time
// (e.g. settlementConfig.js's ESCROW_LOCK_MINUTES/RETURN_WINDOW_MINUTES,
// computed once via top-level consts) — otherwise those modules see an
// empty process.env and silently fall back to their hardcoded defaults,
// no matter what .env actually says.
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorMiddleware');
const cron = require('node-cron');
const { RELEASE_CRON } = require('./config/settlementConfig');

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

// Settlement release — schedule + escrow/return timing are centralized in
// backend/config/settlementConfig.js. Currently RELEASE_CRON = '* * * * *'
// (every minute, testing) — production would use a once-daily schedule
// (e.g. '0 1 * * *') via the RELEASE_CRON env var, no code change needed.
cron.schedule(RELEASE_CRON, async () => {
  try {
    const Shipment = require('./models/Shipment');
    const { recomputeOrder, buildShipmentEmailView } = require('./utils/orderAggregate');
    const now = new Date();

    // Find delivered shipments whose lock has expired, seller not yet
    // released, and not held for an active return.
    const toRelease = await Shipment.find({
      status: 'delivered',
      returnHold: false,
      'settlement.status': 'partial',
      'settlement.sellerReleased': false,
      'settlement.lockUntil': { $lte: now },
    });

    let released = 0;
    const { sendSettlementReleasedEmail } = require('./utils/emailService');
    const UserModel = require('./models/User');
    const Order = require('./models/Order');
    for (const shipment of toRelease) {
      shipment.settlement.status           = 'released';
      shipment.settlement.sellerReleased   = true;
      shipment.settlement.sellerReleasedAt = now;
      shipment.settlement.commissionBooked = true;
      shipment.settlement.settledAt        = now;
      await shipment.save();

      // Email this shipment's seller only — their earnings, not the whole order
      const seller = await UserModel.findById(shipment.seller);
      if (seller) {
        const order = await Order.findById(shipment.order);
        if (order) {
          const shipmentView = buildShipmentEmailView(order, shipment);
          sendSettlementReleasedEmail(seller, shipmentView);
          // No req context in a cron callback — pass the bare seller id.
          const { notifyEarningsReleased } = require('./utils/notificationService');
          notifyEarningsReleased(shipment.seller, shipmentView);
        }
      }
      released++;
    }

    if (released > 0) {
      console.log(`💰 Settlement: released ${released} shipment(s) past their escrow lock window`);
    }
  } catch (err) {
    console.error('Settlement release failed:', err.message);
  }
}, { timezone: 'Asia/Kathmandu' });

const app = express();

// ── Core Middleware ───────────────────────────────────────

// CORS — allow requests from the frontend
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
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
app.use('/api/recommendations', require('./routes/recommendationRoutes'));
app.use('/api/search', require('./routes/searchRoutes')); 
app.use('/api/chatbot', require('./routes/chatbotRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));


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
