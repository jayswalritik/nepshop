/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Chatbot Return Actions  (backend/services/chatbot/returnActions.js)
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 2 grounding for return/refund assistance. Returns are now ITEM-LEVEL,
 * scoped to one Shipment (package) within an order — this reads real Shipment
 * + Return documents so eligibility/window/fault-math match returnController
 * exactly, one entry per PACKAGE rather than per whole order:
 *   • only delivered packages, with at least one unit still returnable
 *   • within RETURN_WINDOW_MINUTES of THAT package's own deliveredAt
 *   • an open (pending/approved/picked_up) return on the package doesn't
 *     block chat from mentioning it — it just isn't offered as newly eligible
 *   • refund depends on fault (admin decides) — both outcomes are surfaced,
 *     never a single promised number
 *
 * Each `annotated` entry exposes `.order` as a shipment-scoped "chat order"
 * view — `_id` is the REAL (customer-recognizable) order id, everything else
 * (items/status/total/deliveredAt) is this ONE package's data — so it's
 * consumable by orderActions.toChatOrder / templates.js exactly like the
 * whole-order views used elsewhere in the chatbot.
 *
 * Known simplification: if an order has multiple packages, `matched.find()`
 * (ordinal/keyword resolution in chatbotService.js) only ever resolves to the
 * FIRST matching package for that order id — there's no "which package do you
 * mean" disambiguation in chat. Fine for the common single-package order;
 * multi-package precision is left to the OrdersPage UI.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Order    = require('../../models/Order');
const Shipment = require('../../models/Shipment');
const Return   = require('../../models/Return');
const { round2 } = require('../../utils/orderPricing');
const { RETURN_WINDOW_MINUTES } = require('../../config/settlementConfig');
// Real return math — the SAME pure functions returnController uses, never a
// chatbot-local reimplementation. RETURN_PICKUP_FEE also comes from here
// (not settlementConfig, which is scoped to timing values only — see that
// file's own header comment); returnMath.js is the actual single source of
// truth for the fee amount.
const { computeReturnReversal, isShipmentFullyReturned, RETURN_PICKUP_FEE } = require('../../utils/returnMath');

// Words in a return message that are never product keywords
const RETURN_STOPWORDS = new Set([
  'i', 'want', 'to', 'return', 'refund', 'my', 'the', 'a', 'an', 'can',
  'how', 'do', 'get', 'money', 'back', 'exchange', 'please', 'order',
  'item', 'product', 'bought', 'purchased', 'this', 'that', 'it', 'for',
]);

// ─────────────────────────────────────────────────────────────────────────────
// getReturnFacts(userId, query)
// Returns everything the templates need — pure facts, no phrasing.
// ─────────────────────────────────────────────────────────────────────────────
const getReturnFacts = async (userId, query = '') => {
  const orders = await Order.find({ customer: userId }).select('_id createdAt').lean();
  if (!orders.length) {
    return { annotated: [], matched: [], eligible: [], inProgress: [], everDelivered: false };
  }
  const orderIds = orders.map((o) => o._id);
  const orderMap = new Map(orders.map((o) => [o._id.toString(), o]));

  // Only packages that have ever reached 'delivered' or gone on to 'returned'
  // are return-relevant — anything still in motion can't be returned yet.
  const shipments = await Shipment.find({ order: { $in: orderIds }, status: { $in: ['delivered', 'returned'] } })
    .select('order items status deliveredAt sellerSubtotal deliveryCharge commissionRate settlement')
    .sort({ deliveredAt: -1 })
    .lean();

  const shipmentIds = shipments.map((s) => s._id);
  const returns = await Return.find({ shipment: { $in: shipmentIds } })
    .select('shipment status items')
    .lean();

  const returnsByShipment = {};
  for (const r of returns) {
    const key = r.shipment.toString();
    (returnsByShipment[key] ||= []).push(r);
  }

  const now = Date.now();
  const annotated = shipments.map((s) => {
    const order       = orderMap.get(s.order.toString());
    const myReturns   = returnsByShipment[s._id.toString()] || [];
    const openReturns = myReturns.filter((r) => ['pending', 'approved', 'picked_up'].includes(r.status));
    const hasReturn   = openReturns.length > 0;

    // Units still returnable per line — the chat estimate always assumes
    // "if I return everything still outstanding in this package", since chat
    // never collects a specific item/quantity selection (that happens on the
    // OrdersPage return form, backed by the real /returns/preview endpoint).
    const remainingItems = (s.items || [])
      .map((it) => ({
        product:          it.product,
        quantity:         it.quantity - (it.returnedQuantity || 0),
        price:            it.price,
        couponAllocation: it.couponAllocation || 0,
        originalQty:      it.quantity,
      }))
      .filter((it) => it.quantity > 0);
    const anyReturnable = remainingItems.length > 0;

    const expiry   = s.deliveredAt ? new Date(s.deliveredAt).getTime() + RETURN_WINDOW_MINUTES * 60 * 1000 : 0;
    const expired  = !s.deliveredAt || now > expiry;
    const eligible = s.status === 'delivered' && anyReturnable && !expired && !hasReturn;

    const total = round2(s.sellerSubtotal + s.deliveryCharge);
    const chatView = {
      _id:            order._id, // real, customer-recognizable order id
      items:          s.items,
      status:         s.status,
      total,
      subtotal:       s.sellerSubtotal,
      deliveryCharge: s.deliveryCharge,
      createdAt:      order.createdAt,
      deliveredAt:    s.deliveredAt,
      settlement:     s.settlement,
    };

    // V — sticker value of everything still returnable. couponAllocation is
    // stored per LINE for that line's ORIGINAL quantity (see Shipment.js item
    // schema comment), so a line that's already been partially returned is
    // prorated to its remaining share rather than reusing the full line's
    // allocation (which would double-count the already-returned portion's
    // voucher). Untouched lines (the common case) need no proration at all.
    const returnedValue = round2(remainingItems.reduce((sum, it) => sum + it.price * it.quantity, 0));
    const voucherSlice  = round2(remainingItems.reduce((sum, it) => {
      if (!it.couponAllocation || !it.originalQty) return sum;
      return sum + (it.couponAllocation / it.originalQty) * it.quantity;
    }, 0));

    // "Returning everything still outstanding" is a full-shipment return IFF
    // no other OPEN (non-completed) return is also holding units back — the
    // real isShipmentFullyReturned already encodes that nuance (see its own
    // doc comment in returnMath.js), reused as-is, not reimplemented.
    const completedReturnItems = myReturns.filter((r) => r.status === 'refunded').flatMap((r) => r.items);
    const isFullShipmentReturn = isShipmentFullyReturned({
      shipmentItems:         s.items,
      completedReturnsItems: completedReturnItems,
      currentReturnItems:    remainingItems.map((it) => ({ product: it.product, quantity: it.quantity })),
    });

    // Real refund math (mirrors admin/customer previews): admin decides
    // fault later, so both outcomes are surfaced, never a single promise.
    const sellerFault = computeReturnReversal({
      returnedValue, voucherSlice, commissionRate: s.commissionRate, fault: 'seller',
      isFullShipmentReturn, shipmentDeliveryCharge: s.deliveryCharge,
    });
    const customerFault = computeReturnReversal({
      returnedValue, voucherSlice, commissionRate: s.commissionRate, fault: 'customer',
    });

    return {
      order:      chatView,
      hasReturn,
      expired,
      eligible,
      daysLeft:   Math.max(0, Math.ceil((expiry - now) / (24 * 60 * 60 * 1000))),
      expiredOn:  new Date(expiry),
      sellerFaultRefund:   sellerFault.refundToCustomer,
      customerFaultRefund: customerFault.refundToCustomer,
      pickupFee:           RETURN_PICKUP_FEE, // for templates to phrase honestly, never hardcode
    };
  });

  // Keyword match: "return my airpods" → packages containing "airpods"
  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w && !RETURN_STOPWORDS.has(w));

  const matched = keywords.length
    ? annotated.filter((a) => {
        const nameHit = a.order.items?.some((item) =>
          keywords.some((k) => item.name.toLowerCase().includes(k))
        );
        // OrdersPage shows the last 8 chars, chat shows the last 6 —
        // endsWith handles both. Min 4 chars so short words can't match an ID.
        const idStr = a.order._id.toString().toLowerCase();
        const idHit = keywords.some((k) => k.length >= 4 && idStr.endsWith(k));
        return nameHit || idHit;
      })
    : [];

  return {
    annotated,
    matched,
    eligible:      annotated.filter((a) => a.eligible),
    inProgress:    annotated.filter((a) => a.hasReturn),
    everDelivered: shipments.length > 0,
  };
};

module.exports = { getReturnFacts };
