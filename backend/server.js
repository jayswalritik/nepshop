const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorMiddleware');

// ── Load environment variables ────────────────────────────
dotenv.config();

// ── Connect to MongoDB ────────────────────────────────────
connectDB();

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
