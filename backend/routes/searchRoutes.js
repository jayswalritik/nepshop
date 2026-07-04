/**
 * Search Routes  (backend/routes/searchRoutes.js)
 * Registered in server.js as: app.use('/api/search', require('./routes/searchRoutes'));
 */

const express        = require('express');
const { search }     = require('../controllers/searchController');

const router = express.Router();

// GET /api/search?q=...&limit=...
router.get('/', search);

module.exports = router;