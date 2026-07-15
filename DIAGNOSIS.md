# Order Splitting Diagnosis — Multi-Seller Orders

Read-only investigation. No source files were modified, created, or deleted.
The only file created is this one.

--- 

## 1. Verdict

This is a **structural** bug, not a display-only bug. A single `Order` document
is the sole unit of status, delivery-agent assignment, pickup address, and
settlement/payout math in this codebase — there is no concept of a per-seller
sub-order anywhere in the schema or in any controller. The "both sellers see
both items" symptom the user reported is real and confirmed at the API layer
(`getSellerOrders` returns the full, unfiltered `items` array to every
co-seller), but it is only the most visible symptom of a much deeper problem:
any co-seller can unilaterally advance the *entire* order's status (packing,
dispatching, cancelling) and overwrite the *entire* order's delivery-agent and
pickup-address fields even for line items they don't own, and — most
severely — the settlement/payout chain stores only ONE combined `sellerShare`
number per order with no per-seller attribution, which (traced concretely
below) causes the admin payout flow to pay one seller the *other* seller's
money and silently never pay the second seller at all. Fixing the dashboard
query alone would hide the symptom without touching the money-correctness
bug underneath it.

---

## 2. Order schema summary

`backend/models/Order.js`:

- `items: [orderItemSchema]` — embedded array. Each item snapshots
  `product, name, image, price, quantity, seller` (seller IS captured
  per-item — no populate needed to know ownership). This is the *only* part
  of the model that is already per-seller-aware.
- `status` — single String enum for the WHOLE order:
  `pending, confirmed, packed, dispatched, delivered, cancelled,
  return_assigned, return_in_transit, returned`.
- `deliveryAgent` — single ObjectId ref, whole-order.
- `pickupAddress` — single embedded object (shopName/street/city/district/phone),
  whole-order.
- `subtotal, deliveryCharge, discount, couponCode, couponDiscount, total,
  commissionRate, commissionAmount` — all single whole-order numbers.
- `deliveryEarning` — single Number, default `50`. One flat agent fee per
  *order*, not per seller-group.
- `settlement` — single embedded object: `status` (held/partial/
  return_pending/released/refunded), `deliveryAgentPaid(At)`,
  `sellerShare` (single combined Number, default 0), `sellerReleased(At)`,
  `commissionBooked`, `lockUntil`, `returnPickupAgent/Earning/Fault`,
  `refundToCustomer`, `sellerBearsDelivery`, `customerBearsDelivery`,
  `settledAt`, `sellerPaidOut(At)`, `agentPaidOut(At)`.
- Indexes: `{customer,createdAt}`, `{status}`, `{'items.seller'}` (already
  present — someone anticipated per-seller querying, but only a filter index,
  never used to actually shape the returned data), `{deliveryAgent}`.

**Nothing in the schema partitions status, agent, pickup address, or money
per seller.** Everything downstream inherits this.

---

## 3. Dashboard query findings

`backend/controllers/orderController.js`, `getSellerOrders`:

```js
const query = { 'items.seller': req.user._id };
...
const orders = await Order.find(query)...
```

The Mongo filter correctly selects any order containing at least one item
belonging to the requesting seller — but `Order.find(query)` has no
`.select()`/projection and no post-fetch filtering of the `items` array.
Every matching order is returned **whole**, including every other seller's
items, prices, images, and quantities. Confirmed this reaches the UI
unfiltered: `frontend/src/pages/seller/OrdersPage.jsx` renders
`order.items.map(...)` directly (both the thumbnail row and the detail
modal) with no client-side filtering by seller ID. This is the direct,
confirmed root of "both sellers saw both items."

`getOrderById` (same file) has the identical shape: authorization only
checks `isSellerInOrder = order.items.some(i => i.seller === req.user._id)`,
then returns the entire order including other sellers' items.

**Can a seller's status update affect items that aren't theirs?** Yes —
see section 4, this is the more serious half of the answer.

---

## 4. Status & agent assignment findings

`orderController.updateOrderStatus` (seller-only, PUT `/api/orders/:id/status`):

- Authorization: `isSellerInOrder` — true if the seller owns **any single
  item** in the order.
- Mutation: `order.status = status` — the WHOLE order's status, a single
  field. `validTransitions` is a flat state machine
  (`pending→confirmed/cancelled`, `confirmed→packed/cancelled`,
  `packed→dispatched`, `dispatched→delivered`) with no seller dimension.
- On `dispatched`: requires `deliveryAgentId`, sets `order.deliveryAgent`
  (single field) and **overwrites** `order.pickupAddress` with the
  *dispatching seller's own shop address* (`shopName/shopAddress` pulled
  from `req.user._id`).
- On `cancelled`: restores stock for **all** items (including the other
  seller's), and if paid, sets `order.settlement.refundToCustomer =
  order.total` — a full-order refund.
- Note: `await order.save()` appears twice in sequence in this function (an
  existing oddity, not touched).

**Concrete consequence:** in a 2-seller order, Seller A (who owns one item)
can call this endpoint and advance the *entire* order — including Seller B's
untouched, unpacked item — straight to `dispatched`, assign a delivery
agent, and stamp the order's pickup address as *Seller A's shop*, even
though the agent would physically also need to visit Seller B's shop to
collect Seller B's item. Seller B has no independent status, no independent
agent, and no way to represent "my item isn't ready yet" once Seller A has
moved the shared order forward. This is structural, not a display bug.

`adminController.adminUpdateOrderStatus` is a second, parallel whole-order
status mutator (admin override) with the same single-`status`-field
assumption.

`deliveryController.markDelivered` (delivery-agent-only) is a third status
mutator: requires `order.deliveryAgent === req.user._id`, requires
`order.status === 'dispatched'`, sets `order.status = 'delivered'` for the
whole order — again no per-seller distinction (if 2 sellers' items are in
one order, "delivered" fires once for both, whether or not both legs were
actually physically delivered by that one agent visit).

**Agent assignment is single, whole-order, and set once** (`deliveryAgent`
field, `deliveryEarning` field defaulting to a single flat Rs 50) — there is
no notion of "one delivery job per seller-group."

---

## 5. Settlement chain findings

**Where sellerShare is actually computed** (not found in orderController.js
— it's set at creation only via schema defaults of `status: 'held'`,
`sellerShare: 0`). The real computation is in
`backend/controllers/deliveryController.js`, `markDelivered`:

```js
const deliveryEarning = order.deliveryEarning || 50;
const sellerShare = +(order.subtotal - order.commissionAmount).toFixed(2);
...
order.settlement = { ...order.settlement, status: 'partial',
  deliveryAgentPaid: true, deliveryAgentPaidAt: new Date(),
  sellerShare: sellerShare > 0 ? sellerShare : 0,
  sellerReleased: false, commissionBooked: false, lockUntil };
```

This fires **once per order**, computing ONE combined `sellerShare` from the
WHOLE order's `subtotal` and `commissionAmount` — regardless of how many
distinct sellers contributed to that subtotal.

Release (both `server.js`'s daily cron and
`adminController.releaseSettlements`, the manual trigger) just flips
`settlement.sellerReleased = true` / `commissionBooked = true` for the whole
order, 7 days after `lockUntil`. Both code paths already dedupe
`sellerIds = [...new Set(order.items.map(i => i.seller.toString()))]` purely
to loop emails to every distinct seller — proving the original author *knew*
multiple sellers can share one order — yet never split the money itself.

**The critical bug — `adminController.js`, `getPayouts` / `paySeller`:**

`getPayouts` explicitly comments (line ~580): *"An order can have items from
one seller in your model (single-seller orders)"* — a declared assumption
that is demonstrably false (the same file's email-loop code, and the cron,
both dedupe multiple `sellerIds` per order). Under that false assumption:

```js
const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
for (const sid of sellerIds) {
  ...
  sellerMap[sid].amount += order.settlement.sellerShare || 0; // FULL combined share, per seller
}
```

For every distinct seller in a shared order, the **entire** combined
`sellerShare` is credited to that seller's pending-payout total — not their
partitioned portion. And in `paySeller`, the flag flipped on payout,
`settlement.sellerPaidOut`, is a **single whole-order boolean**:

```js
await Order.updateMany(
  { 'items.seller': req.params.sellerId, 'settlement.sellerReleased': true,
    'settlement.sellerPaidOut': false },
  { $set: { 'settlement.sellerPaidOut': true, 'settlement.sellerPaidOutAt': now } }
);
```

So whichever seller's payout an admin processes **first** absorbs the
*entire* combined `sellerShare` for the order (including the co-seller's
money), and flips the whole-order `sellerPaidOut` flag to `true` — which
means when the admin later tries to pay the *second* seller, this order no
longer matches the query (`sellerPaidOut: false`) and simply disappears
from that seller's payout list. The second seller is never paid, with no
error, no partial-payment record, and nothing indicating money is owed.

### Worked example — Seller X: Rs 1000 of items, Seller Y: Rs 500 of items, one order

**At creation** (`orderController.placeOrder` / `paymentController.createOrderFromCart`,
identical logic in both):
- `subtotal` = 1000 + 500 = **1500**
- `deliveryCharge` = subtotal < 2000 → **100** (flat, once per order)
- `commissionAmount` = 1500 × 5% = **75**
- `total` = 1500 + 100 = **1600**
- `deliveryEarning` = 50 (schema default, single field)

**At delivery** (`deliveryController.markDelivered`, fires once for the whole order):
- Agent paid immediately: **Rs 50** (one flat fee, one agent, despite two
  physically distinct seller shops to collect from)
- `sellerShare` = 1500 − 75 = **1425** (one combined number, no seller ID attached)

**At admin payout** (`getPayouts` / `paySeller`, today's actual behavior):
- Admin dashboard shows **both** Seller X and Seller Y owed Rs 1425 each
  (Rs 2850 total phantom liability against a real pool of Rs 1425).
- If admin pays Seller X first: X receives **Rs 1425** (should be Rs 950),
  `sellerPaidOut` flips true for the whole order, and Seller Y receives
  **Rs 0**, permanently, with the order silently vanishing from Y's payout
  view.

**Correct partitioned numbers** (per the reference money model, applied per seller-subtotal):
- Seller X (Rs 1000 subtotal): commission 50, seller share **950**
- Seller Y (Rs 500 subtotal): commission 25, seller share **475**
- Per Daraz-style per-seller-shipment target: 2 shipments → 2 delivery
  charges (Rs 100 + Rs 100 = Rs 200 to customer) → 2 agent fees (Rs 50 +
  Rs 50 = Rs 100) → customer total = 1500 + 200 = **Rs 1700** (today's
  Rs 1600 undercharges the customer by Rs 100 relative to this target,
  because only one delivery leg is billed for what should be two)
- NepShop's correct keep: commission 75 + delivery margin (2 × Rs 50) = **Rs 175**

### Contradiction: two different settlement formulas exist in the codebase

`deliveryController.js` (live, runs on every future delivery):
```js
sellerShare = order.subtotal - order.commissionAmount
```
`backend/migrateSettlement.js` (one-time backfill script for pre-existing orders):
```js
sellerShare = order.total - order.commissionAmount - (order.deliveryEarning || 50)
```
These are **not equivalent** and diverge in opposite directions depending on
whether delivery was free:
- With a flat Rs 100 delivery charge (the common case): migrate formula gives
  `subtotal + 100 − commission − 50 = subtotal + 50 − commission`, i.e.
  **Rs 50 more** than the live formula for the same order.
- With free delivery (subtotal ≥ 2000, `deliveryCharge = 0`): migrate formula
  gives `subtotal − commission − 50`, i.e. **Rs 50 less** than the live
  formula.

Per this task's instructions, this contradiction is recorded here, not
resolved. If the backfill script is ever re-run, or used as a reference for
a future per-seller fix, it will silently disagree with the numbers
`deliveryController.js` has been producing for every order marked delivered
since it was written.

---

## 6. Delivery charge computation/storage today

Computed identically in two places — `orderController.placeOrder` (COD
path) and `paymentController.createOrderFromCart` (Khalti/eSewa path,
called only after payment verification):

```js
const deliveryCharge = subtotal >= 2000 ? 0 : 100;
```

One flat Rs 100 (or free above Rs 2000 **combined** subtotal) for the
**whole order**, charged once regardless of how many distinct sellers are
represented. Stored in the single `order.deliveryCharge` field. This is
direct evidence against the "customer pays delivery charge once per
seller-group" target design — today it is computed and charged exactly once
per *order*.

---

## 7. Return-pickup job model (as possible fulfillment-unit template)

`backend/models/Return.js` + `backend/controllers/returnController.js` is
the closest existing precedent for a per-fulfillment-unit model:

- `Return` is its **own top-level document** (not embedded in Order), with
  a `ref: 'Order'` back-pointer.
- It has its **own** `status` enum (`pending → approved → picked_up →
  refunded / rejected`), independent of the order's own `status` field
  (though the two are kept loosely in sync — `order.status` is also
  overwritten to `return_assigned` / `return_in_transit` / `returned` as a
  side effect).
- It has its **own** `returnAgent` (independent of `order.deliveryAgent`)
  and its **own** `returnAgentEarning` (independent Rs 50 flat field).
- `completeReturn` does real fault-based reversal math scoped to the return
  record: refund amount, who bears the two delivery legs, etc.

This is exactly the shape (separate document, own status, own agent, own
earning field, ref back to parent Order) that a per-seller shipment/job
model should mirror. **Caveat:** even this template isn't fully seller-scoped
today — `requestReturn` copies **all** of the order's items into the return
record (`order.items.map(...)`, no seller filter), so a return request
today implicitly assumes a customer is returning the whole order, not one
seller's portion of it. The pattern is right; the current usage of it still
inherits the whole-order assumption.

**Other order-shaped code, one line each:**
- `backend/utils/emailService.js` — every order/return/delivery email
  notifier is invoked in a `sellerIds = [...new Set(...)]` dedup-loop
  (proving multi-seller orders are anticipated at the notification layer)
  but each email still attaches the *whole* order object.
- `backend/services/chatbot/orderActions.js` — customer-facing only,
  reads whole `Order` documents for chat cards; not a bug since a customer
  legitimately views one order as one thing, but any future per-seller
  split must keep this path working off `customer` orders, not seller ones.
- `backend/routes/orderRoutes.js` / `deliveryRoutes.js` / `returnRoutes.js`
  / `adminRoutes.js` — route wiring only, no additional logic; role-gated
  via `authorizeRoles`, confirms exactly which endpoints are seller-only vs
  admin-only vs delivery-only (relevant for blast radius below).
- `adminController.getAllOrders` / `getCommissionReport` — platform-wide
  admin views; `getCommissionReport`'s per-seller aggregate
  (`$unwind: '$items'` then `$sum: '$orderDocs.subtotal'`) has the *same*
  class of bug as the payout code: a seller sharing an order with another
  seller gets the **whole order's** subtotal/commission counted toward their
  reported revenue, not their own item total.
- `frontend/src/pages/admin/OrderMonitoring.jsx`, `ReturnsManagement.jsx`,
  `frontend/src/pages/delivery/Dashboard.jsx`, `ReturnPickups.jsx`,
  `frontend/src/pages/customer/OrdersPage.jsx` — all render `order.items`
  directly with no seller-side filtering (expected/correct for
  admin/customer/delivery views, which should see everything; only the
  seller-facing `seller/OrdersPage.jsx` should have been filtered and
  isn't).

---

## 8. Blast radius — every file likely needing to change for a per-seller-group fix

**Backend:**
- `backend/models/Order.js` — schema change (per-seller status/agent/
  settlement partition, or a new sub-document/collection)
- `backend/models/Return.js` — likely needs a seller-scoping field if
  returns should also split per seller
- `backend/controllers/orderController.js` — `placeOrder`, `getSellerOrders`,
  `getOrderById`, `updateOrderStatus`, `cancelOrder`
- `backend/controllers/paymentController.js` — `createOrderFromCart`
  (duplicate order-creation logic, second creation path)
- `backend/controllers/deliveryController.js` — `getDeliveryOrders`,
  `markDelivered` (settlement computation)
- `backend/controllers/returnController.js` — `requestReturn`,
  `processReturn`, `completeReturn` (fault-based reversal math)
- `backend/controllers/adminController.js` — `getAllOrders`,
  `adminUpdateOrderStatus`, `getCommissionReport`, `releaseSettlements`,
  `getPayouts`, `paySeller`, `payAgent`, `getPayoutHistory`
- `backend/server.js` — settlement-release cron
- `backend/migrateSettlement.js` — formula would need to match whatever the
  fixed live computation becomes; also a new migration would likely be
  needed to backfill per-seller-group data for existing orders
- `backend/utils/emailService.js` — templates that currently attach a whole
  order would need a seller-scoped view of it
- `backend/routes/orderRoutes.js`, `deliveryRoutes.js`, `returnRoutes.js`,
  `adminRoutes.js` — likely new endpoints (per-shipment status, per-shipment
  payout) alongside or replacing existing ones

**Frontend:**
- `frontend/src/pages/seller/OrdersPage.jsx` — must render only the
  seller's own items/shipment, not the whole order
- `frontend/src/pages/admin/OrderMonitoring.jsx`, `ReturnsManagement.jsx` —
  admin views would need a per-shipment breakdown to reflect the new model
- `frontend/src/pages/delivery/Dashboard.jsx`, `ReturnPickups.jsx` —
  delivery agent views, if agent assignment becomes per-shipment
- `frontend/src/pages/customer/OrdersPage.jsx` — customer view likely stays
  whole-order (a customer placed one order) but may need to show
  per-shipment tracking/status if shipments can now diverge

**Mobile:** no mobile app exists in this repository (confirmed — only
`backend/` and `frontend/` at the repo root; no separate mobile directory
or mobile-specific package.json).

---

## 9. Risks & open questions

- **Money-model mismatch (confirmed, prominent):** the admin payout flow
  (`getPayouts`/`paySeller`) pays the *entire* combined `sellerShare` to
  whichever seller is paid first in a shared order, and silently never pays
  the other seller — see the worked example in section 5. This is an active
  risk with real money today, not just a future-fix consideration, if any
  order sharing sellers has already reached the `delivered` + released +
  payout stage.
- **Formula contradiction (confirmed, recorded not resolved):**
  `deliveryController.markDelivered`'s live `sellerShare` formula
  (`subtotal − commissionAmount`) disagrees with `migrateSettlement.js`'s
  backfill formula (`total − commissionAmount − deliveryEarning`) by ±Rs 50
  depending on whether delivery was free. Both sides are recorded in section
  5; neither has been changed.
- **`getCommissionReport`'s per-seller aggregate** double-attributes whole-
  order subtotal/commission to every seller sharing an order — an analytics/
  reporting-accuracy risk distinct from (but same root cause as) the payout
  bug.
- **Stale comment, not a money bug:** `server.js`'s settlement cron is
  commented `// TESTING: every minute` but the actual cron expression is
  `'0 18 * * *'` (once daily at 18:00 Asia/Kathmandu) — misleading, worth a
  cleanup note, not itself a correctness issue.
- **Open question:** are there currently any real orders in the database
  that already share sellers and have already been paid out via
  `paySeller`? If so, the shortchanged-seller scenario in section 5 may
  already have occurred in production/data, not just be a theoretical risk.
  This diagnosis did not query the live database (out of scope for a
  read-only code investigation) and this should be checked before any fix
  ships.
- **Open question:** should a per-seller split be modeled as new fields
  embedded in `Order` (e.g., an array of per-seller sub-documents holding
  status/agent/settlement), or as a wholly separate collection
  (`OrderShipment`, mirroring the `Return` pattern)? Both are viable; this
  diagnosis does not recommend one over the other (see section 10 for the
  general shape only).
- **Open question:** does `Return`'s own whole-order-items assumption
  (section 7 caveat) need fixing in the same pass as Order, or can it be
  deferred? A per-seller Order fix without a matching Return fix would leave
  the return flow inconsistent with the new shipment model.

---

## 10. Recommended fix shape

The schema needs a per-seller-group fulfillment unit — most naturally
modeled after the existing `Return` pattern (section 7): a new document
type (e.g. `Shipment`) with a back-reference to the parent `Order`, one
document per distinct seller in that order, each carrying its own `status`,
`deliveryAgent`, `pickupAddress`, and settlement fields (`sellerShare`,
`sellerReleased`, `sellerPaidOut`, etc.) computed from that seller's own
item subtotal rather than the whole order's. The parent `Order` would keep
the customer-facing whole-order view (one `total`, one delivery address,
one payment record) since a customer places and pays for one order
regardless of how many sellers fulfill it — the split happens on the
fulfillment/settlement side, not the checkout side.

This lets `getSellerOrders` query shipments directly
(`Shipment.find({ seller: req.user._id })`) instead of filtering an
embedded array post-hoc, gives each seller their own status machine and
delivery-agent assignment without touching co-sellers' shipments, and gives
the payout code (section 5's critical bug) a `sellerShare` that is already
scoped to one seller by construction — eliminating the double-pay/never-pay
failure mode entirely rather than patching around it. The settlement cron,
`releaseSettlements`, `getPayouts`, and `paySeller` would all shift from
querying `Order` to querying `Shipment`, releasing and paying out per
shipment instead of per order.

This is a substantial migration (new collection, dual-write or backfill for
existing orders, every controller in the section 8 blast radius touched),
not a small patch — the dashboard-query leak alone could be fixed cheaply,
but doing only that would leave the section 5 money bug live. The
recommendation is to treat this as one coordinated change rather than
patching the display layer first and the settlement layer later, given how
directly the two share root cause.
