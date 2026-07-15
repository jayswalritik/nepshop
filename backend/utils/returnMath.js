// Fault-based return reversal math — the ONE place that computes what an
// item-level return costs the seller, gives back to NepShop, and refunds the
// customer. Pure function, no DB access, so it can be unit-tested directly
// (see backend/tests/settlementMath.test.js) and reused by returnController.

const { round2 } = require('./orderPricing');

const RETURN_PICKUP_FEE = 50; // Rs, flat — same figure as Return.returnAgentEarning's default

// Inputs are all plain numbers/strings pulled from the shipment + the return's
// item subset — nothing here reaches into a DB document itself.
//
//   returnedValue          V — sticker value (price × qty) of the returned units
//   voucherSlice           this return's slice of the shipment's coupon allocation
//                          (sum of each returned unit's per-unit voucher share)
//   commissionRate         shipment.commissionRate (percent, e.g. 5)
//   fault                  'seller' | 'customer'
//   isFullShipmentReturn   true once every unit of every item in the shipment
//                          has been returned (this request included)
//   shipmentDeliveryCharge shipment.deliveryCharge — only used when
//                          isFullShipmentReturn && fault === 'seller'
//   pickupFee              Rs flat return-pickup agent fee (default 50)
//
// Money-model invariant: for returned sticker value V, the sale un-happens —
// the seller gives back V minus commission on V, NepShop gives back its
// commission on V; together exactly V. Vouchers only ever move the customer
// refund and NepShop's absorbed figure — they never touch seller/agent money.
const computeReturnReversal = ({
  returnedValue,
  voucherSlice = 0,
  commissionRate,
  fault,
  isFullShipmentReturn = false,
  shipmentDeliveryCharge = 0,
  pickupFee = RETURN_PICKUP_FEE,
}) => {
  if (!['seller', 'customer'].includes(fault)) {
    throw new Error('computeReturnReversal: fault must be "seller" or "customer"');
  }

  const V = round2(returnedValue);
  const commissionReversal = round2(V * commissionRate / 100);
  const sellerReversal     = round2(V - commissionReversal); // seller gives back V minus commission on V
  const voucherReclaimed   = round2(voucherSlice);

  const baseCustomerRefund = round2(V - voucherReclaimed);

  let refundToCustomer;
  let sellerBearsDelivery = 0;
  let sellerBearsPickup   = 0;

  if (fault === 'seller') {
    sellerBearsPickup = pickupFee;
    if (isFullShipmentReturn) {
      // Entire shipment returned, seller's fault — customer also gets the
      // package delivery charge back, borne by the seller.
      sellerBearsDelivery = shipmentDeliveryCharge;
      refundToCustomer = round2(baseCustomerRefund + shipmentDeliveryCharge);
    } else {
      refundToCustomer = baseCustomerRefund;
    }
  } else {
    // Customer's fault/choice — Rs 50 return-pickup fee withheld from their
    // refund (the agent's fee is funded out of that withheld amount, not the
    // seller). Seller never bears delivery on a customer-fault return, full
    // or partial.
    refundToCustomer = round2(Math.max(0, baseCustomerRefund - pickupFee));
  }

  // Net amount to subtract from the shipment's settlement.sellerShare —
  // already negative (a debit).
  const sellerShareDelta = round2(-(sellerReversal + sellerBearsPickup + sellerBearsDelivery));

  return {
    returnedValue:     V,
    commissionReversal,
    sellerReversal,
    voucherReclaimed,
    refundToCustomer,
    sellerBearsDelivery,
    sellerBearsPickup,
    sellerShareDelta,
  };
};

// Pure classification helper — a return is FULL-SHIPMENT if and only if,
// counting COMPLETED (refunded) returns on this shipment plus the return
// currently being processed/previewed, every item line reaches
// returnedUnits == quantity. Open/pending/reserved requests do NOT count.
//
// Deliberately does NOT read shipment.items[].returnedQuantity — that field
// also counts units reserved by OTHER still-open (pending/approved/
// picked_up) returns on the same shipment, which haven't reversed any money
// yet. Using it directly would let concurrent open returns prematurely
// classify each other as full. Single source of truth for this check —
// used by completeReturn and by both refund-preview endpoints so none of
// them can drift from what completion will actually do.
//
//   shipmentItems          shipment.items — [{ product, quantity }]
//   completedReturnsItems  flattened items[] from every OTHER Return on this
//                          shipment with status 'refunded'
//   currentReturnItems     items[] of the return being completed/previewed
const isShipmentFullyReturned = ({ shipmentItems, completedReturnsItems = [], currentReturnItems = [] }) => {
  const qtyByProduct = {};
  for (const it of [...completedReturnsItems, ...currentReturnItems]) {
    const key = it.product.toString();
    qtyByProduct[key] = (qtyByProduct[key] || 0) + it.quantity;
  }
  return shipmentItems.every(i => (qtyByProduct[i.product.toString()] || 0) >= i.quantity);
};

module.exports = { computeReturnReversal, isShipmentFullyReturned, RETURN_PICKUP_FEE };
