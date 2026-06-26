// One-time migration — backfills settlement object for existing orders
require('dotenv').config();
const mongoose = require('mongoose');
const Order    = require('./models/Order');

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const orders = await Order.find({});
    console.log(`Found ${orders.length} orders to check.`);

    let updated = 0, skipped = 0;

    for (const order of orders) {
      if (order.settlement && order.settlement.status) {
        skipped++;
        continue;
      }

      const sellerShare = +(order.total - order.commissionAmount - (order.deliveryEarning || 50)).toFixed(2);

      // Infer a sensible settlement status from current order status
      let settlementStatus = 'held';
      if (order.status === 'delivered')  settlementStatus = 'released'; // old delivered orders treated as settled
      if (order.status === 'returned')   settlementStatus = 'refunded';
      if (order.status === 'cancelled')  settlementStatus = 'refunded';

      order.settlement = {
        status:             settlementStatus,
        deliveryAgentPaid:  order.status === 'delivered' || order.status === 'returned',
        deliveryAgentPaidAt: order.deliveredAt || null,
        sellerShare:        sellerShare > 0 ? sellerShare : 0,
        sellerReleased:     settlementStatus === 'released',
        sellerReleasedAt:   settlementStatus === 'released' ? (order.deliveredAt || new Date()) : null,
        commissionBooked:   settlementStatus === 'released',
        lockUntil:          null,
        returnPickupAgent:  null,
        returnPickupEarning: 0,
        returnFault:        null,
        refundToCustomer:   0,
        sellerBearsDelivery: 0,
        customerBearsDelivery: 0,
        settledAt:          settlementStatus === 'released' ? (order.deliveredAt || new Date()) : null,
      };

      await order.save();
      updated++;
    }

    console.log(`\n✅ Settlement migration complete. Updated: ${updated}, Skipped: ${skipped}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
};

migrate();