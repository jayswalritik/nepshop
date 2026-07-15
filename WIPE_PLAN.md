# Data Wipe Plan — Order/Earnings History Reset

Read-only investigation. No data was deleted or modified. The only files
touched this phase: this document, and `backend/inspectDb.js` (temporary,
read-only, deleted after its output was captured below).

Decision this plan supports: **delete all historical order/earnings data**
(orders, shipments, returns) so testing on the new per-seller-shipment model
starts from a clean slate, **instead of** running `backend/migrateToShipments.js`
against old orders. Products and users (all roles) are preserved.

---

## 1. Database connected to + full collection inventory

> ### ⚠️ CONFIRM BEFORE PROCEEDING
> `backend/inspectDb.js` connected using this repo's own `.env` (the same
> config `backend/config/db.js` uses) to:
>
> **DATABASE: `nepshop`**
> **Host: `ac-hjexilq-shard-00-01.dabdkpb.mongodb.net` (MongoDB Atlas, primary `MONGO_URI`)**
>
> Nothing in the codebase labels this cluster/database "dev" vs "prod" — the
> name is just `nepshop`. **You must independently confirm this is the
> development database before running any deletion**, since this is the only
> `MONGO_URI` configured and the script has no way to distinguish environments
> on its own. See section 7.

Full collection inventory (9 collections total — matches the 9 Mongoose
models in `backend/models` exactly; no unexpected/orphaned collections):

| Collection     | Doc count | Model         |
|-----------------|-----------|---------------|
| `carts`         | 5         | Cart          |
| `coupons`       | 1         | Coupon        |
| `orders`        | 13        | Order         |
| `products`      | 121       | Product       |
| `productviews`  | 109       | ProductView   |
| `returns`       | 0         | Return        |
| `reviews`       | 3         | Review        |
| `shipments`     | 0         | Shipment      |
| `users`         | 22        | User          |

Sample documents (key fields only — full inspection output, no PII dumped):

```
[orders] — 13 document(s), sample:
  _id=9FC27F2D status=delivered paymentStatus=pending total=550  settlement.status=held     settlement.sellerPaidOut=false
  _id=9FC28027 status=delivered paymentStatus=pending total=1100 settlement.status=released settlement.sellerPaidOut=false
  _id=4DA6A168 status=delivered paymentStatus=pending total=190  settlement.status=released settlement.sellerPaidOut=false

[shipments] — 0 document(s)  (empty — this branch's migration was never run against this DB)

[returns] — 0 document(s)  (empty)

[reviews] — 3 document(s), sample:
  _id=84C7C366 product=68334CAD customer=77D98C49 order=A8CB0598 rating=5
  _id=84C7C39A product=68334C43 customer=77D98C49 order=19C45FEA rating=5
  _id=29B407D6 product=68334CAD customer=77D98C49 order=29B4049B rating=5

[coupons] — 1 document(s), sample:
  _id=DABCEE6E code=PUBLIC100 usedCount=1 usageLimit=1 isActive=true
```

**Stock impact** (read-only aggregate over non-cancelled orders — see section 4):
14 distinct products affected, 18 total units decremented. Full per-product
list is in section 4.

`paymentStatus: "pending"` on `delivered` orders in the sample above is
expected, not an anomaly — these are Cash-on-Delivery orders, where
`paymentStatus` only flips to `paid` for the online-payment flows.

---

## 2. Collections to wipe

| Collection  | What it is | Live count | What references it |
|-------------|-----------|-----------|---------------------|
| `orders`    | The customer-facing whole order (one payment, one total, one delivery address) | 13 | `Shipment.order`, `Return.order`, `Review.order` (all ref, none cascade), chatbot `orderActions.js`/`returnActions.js` read paths, every dashboard that aggregates order history |
| `shipments` | Per-seller-group fulfillment/settlement unit (this branch's new model) | 0 | `Order` (parent, not enforced), seller/delivery/admin dashboards, payout endpoints |
| `returns`   | Return/refund lifecycle records | 0 | `Order.status` side-effects (return_assigned/in_transit/returned), delivery agent return-pickup queue |

These three are the entire "order lineage" — every document in them either
*is* a transaction record or exists solely to track one. Deleting them is a
clean, self-contained operation: no other collection stores its *primary*
data inside these three (see section 7 for the one partial exception —
Coupon's `usedCount`).

---

## 3. Collections to preserve

| Collection    | Reasoning |
|---------------|-----------|
| `users`       | Explicitly required — all roles (customer/seller/delivery/admin) preserved. Contains `payoutDetails` (bank/Khalti/eSewa account info) and `commissionRate` — both are static configuration, not running totals, so nothing goes stale. |
| `products`    | Explicitly required. Contains `rating`/`numReviews` — these are derived from `Review` (preserved, see below), **not** from `Order`, so they stay accurate. `stock`, however, was decremented by historical orders and will NOT be restored by deleting those orders — see section 4. |
| `carts`       | Not order-lineage — `Cart` items reference `Product` directly (with a live-populated `seller`, not a stored one), never `Order`. Nothing about a wipe makes existing carts stale or broken. Emptying them is a "fresh start" preference, not a technical requirement — flagged as an open question in section 7. |
| `coupons`     | The `Coupon` documents themselves (code, type, value, limits) are marketing config, not order history. **However** `usedCount` is a live counter driven by order create/cancel — see section 4 and the prominent flag in section 7. |
| `reviews`     | Independent documents; `order` is a required ref at *creation* time only — no code path re-validates or populates it afterward (traced through `reviewController.js`: `getProductReviews`, `getSellerReviews`, `deleteReview` never touch `.order`). Reviews render fine after the referenced order is gone. See section 4 for the full verdict. |
| `productviews`| Browsing/recommendation telemetry, TTL-expiring after 30 days on its own. No relationship to orders at all. |

---

## 4. Impact analysis

### Dashboards / aggregates on empty order data
Traced every consumer of `Order`/`Shipment` aggregates added or touched in
the Phase B `Shipment` split:

- `adminController.getPlatformStats`, `getCommissionReport`, `getPayouts`,
  `getPayoutHistory`, `releaseSettlements` — all use `Array.reduce`/
  `Object.values`/`aggregate` patterns that degrade to `0`/`[]`/`{}` on empty
  collections; frontend (`Payouts.jsx`, `CommissionManagement.jsx`,
  `admin/Dashboard.jsx`) already renders explicit empty states
  (`!data?.sellers?.length`, `stats?.totalRevenue || 0`, etc.). **Confirmed
  safe on empty data — no crash.**
- `server.js` settlement cron and `deliveryController` — `Shipment.find()`
  on an empty collection just yields `[]`; loops don't execute. **Safe.**
- Chatbot (`orderActions.js`, `chatbotService.js`) — every consumer of
  `getActiveOrders`/`getRecentOrders` guards with `.length` checks before
  use (`everOrdered` flag, `Array.isArray(...) && length > 0`). Empty result
  → "you haven't ordered anything yet" branch. **Confirmed safe, no crash.**

### 🐛 Pre-existing bug found (independent of the wipe — flagging, not fixing)
`frontend/src/pages/seller/EarningsPage.jsx` still calls
`API.get('/orders/seller?limit=100')` and reads **`data.orders`** and
per-order **`o.subtotal`**. The Phase B `Shipment` split changed that
endpoint's response to key **`data.shipments`**, with **`sellerSubtotal`**
instead of `subtotal`. `seller/OrdersPage.jsx` and `delivery/Dashboard.jsx`
were updated for this; `seller/EarningsPage.jsx` was missed. Right now
`data.orders` is `undefined`, so `all.filter(...)` throws — **this page is
currently broken regardless of any wipe.** Not touched in this phase per
your read-only instructions; flagging so it's fixed in a follow-up, not
lost in the noise of the wipe conversation.

### Stock impact — cannot be restored by deleting orders
Historical orders decremented `Product.stock` at creation and only restore
it on cancellation. Deleting the `Order` documents does **not** reverse
already-applied decrements — once gone, there is no record to recompute
from. Read-only aggregate taken *before* any deletion (non-cancelled orders,
grouped by product):

```
14 distinct product(s) affected, 18 total units decremented.

product=674A374F  totalQuantity=3  fromOrders=3
product=7AD65475  totalQuantity=2  fromOrders=2
product=7AD654D1  totalQuantity=2  fromOrders=2
product=5D96A0D2  totalQuantity=1  fromOrders=1
product=6A9DC57A  totalQuantity=1  fromOrders=1
product=5D96A0DA  totalQuantity=1  fromOrders=1
product=68334CAD  totalQuantity=1  fromOrders=1
product=5D96A0D6  totalQuantity=1  fromOrders=1
product=27F754C1  totalQuantity=1  fromOrders=1
product=5D96A0BC  totalQuantity=1  fromOrders=1
product=7ED5192E  totalQuantity=1  fromOrders=1
product=5D96A0CE  totalQuantity=1  fromOrders=1
product=5D96A154  totalQuantity=1  fromOrders=1
product=5D96A08C  totalQuantity=1  fromOrders=1
```
If you want stock numbers restored to "as if these orders never happened,"
this is the exact `$inc` list to apply to `products.stock` — 14 products,
18 units total, small enough to apply by hand or a tiny one-off script
**before** deleting the orders (the aggregate becomes impossible to
reproduce afterward). This is optional — flagged as an open question in
section 7, not something I've assumed you want.

### Reviews/orders linkage — verdict
`Review.order` is `required` at the schema level, but only checked for
existence at **creation** time in `reviewController.addReview` (must be
delivered, must belong to the customer, product must be in it). No read
path (`getProductReviews`, `getSellerReviews`, `canReview`, `deleteReview`)
ever populates or re-validates `.order`. **Verdict: deleting `orders` does
NOT break, crash, or hide existing reviews.** It does leave `Review.order`
pointing at a document that no longer exists (an orphaned foreign key) —
harmless for display, but means these 3 reviews can no longer be traced
back to "verified purchase" proof at the DB level. This is a data-integrity
nuance worth a conscious decision, not a silent side effect — see section 7.

### 🚨 Coupon usage counter — will go stale, live example found
`Coupon.usedCount` is a single global counter on the `Coupon` document
itself (not per-user, no usage log), incremented in `orderController.placeOrder`
/ `paymentController.createOrderFromCart` and decremented on cancellation.
**It is the one place order-derived state lives outside the
orders/shipments/returns collections.** Live example already in this
database: coupon `PUBLIC100` has `usedCount: 1`, `usageLimit: 1` — i.e. it
is currently fully exhausted, and that state is 100% attributable to one of
the 13 orders about to be deleted. If `orders` is wiped without also
resetting `Coupon.usedCount`, `PUBLIC100` remains permanently unusable even
though, post-wipe, zero real orders will have ever used it. **Flagged
prominently in section 7 — recommend resetting `usedCount` to 0 on all
coupons as part of the wipe.**

### Scheduled jobs against empty collections
`server.js`'s daily settlement-release cron (`0 18 * * *`) queries
`Shipment.find({ status: 'delivered', returnHold: false, 'settlement.status':
'partial', ... })` — empty result on an empty collection, loop body never
runs, `released` stays `0`, the `if (released > 0)` log line is skipped
entirely. **No error, no noisy log spam.** Same for
`adminController.releaseSettlements` (manual trigger). Confirmed safe.

---

## 5. Dead-code candidates (list only — nothing removed)

| File | Verdict | Keep argument | Remove argument |
|------|---------|---------------|------------------|
| `backend/migrateToShipments.js` | **Candidate for removal** | Idempotent and harmless if left; documents the exact schema-change methodology (grouping, per-group formulas, conservative flag-freezing, mispayment flagging) for the academic writeup — useful evidence of engineering process even if never run again. | Its entire reason to exist — backfilling shipments for pre-existing orders — disappears once those orders are deleted. Dead weight that could confuse a future reader into thinking a migration step is still needed. Also: the live `shipments` collection is currently empty anyway (0 docs), so it has never actually been run against this database — there is no "in-between" state it needs to reconcile. |
| `backend/clearOrders.js` | **Not dead — but STALE, found unexpectedly** | See the prominent flag in section 7. This script already does most of what this whole plan is about, and pre-dates the `Shipment` model. |
| `backend/migrateEmailVerified.js` | Unrelated one-time User-schema migration (backfills `isEmailVerified`). Out of scope for this order-data wipe — not order-lineage. Listed for completeness only. |
| `backend/migrateRoles.js` | Unrelated one-time User-schema migration (backfills `roles[]`/`activeRole`). Out of scope — not order-lineage. Listed for completeness only. |
| `backend/seedAdmin.js`, `seedProducts.js`, `seedSellers.js` | Active seed tooling (one is wired to `npm run seed:admin`). Confirmed via grep: none of them create `Order`/`Shipment`/`Review` documents. Not affected by, or relevant to, this wipe. |
| `backend/scripts/*.js` (embedding backfill/test scripts) | Confirmed unrelated to orders (semantic-search tooling). Not in scope. |
| `backend/tests/settlementMath.test.js` | **NOT dead code.** Pure-function tests against `orderPricing.js` — no DB dependency at all, exercises the same math regardless of what data exists. Must stay. |

---

## 6. Proposed wipe procedure

### 🔎 Important — an existing script already does most of this
`backend/clearOrders.js` already exists in this repo:

```js
// Wipes all orders and returns — leaves users, products, carts intact.
// Use to reset for clean revenue testing.
await Order.deleteMany({});
await Return.deleteMany({});
```

It predates the `Shipment` model, so **as written today it would miss the
`shipments` collection** (currently 0 docs, so no live impact yet — but by
the time this same procedure is reused in production, shipments will exist
and this script would leave them behind, orphaned from their now-deleted
parent orders). It also does not reset `Coupon.usedCount`, and doesn't
address `carts`/`reviews` (reasonably, since neither strictly needs it).

This is a decision point for you, not something I've resolved: either (a)
extend `clearOrders.js` to also clear `shipments` and reset coupon counters,
or (b) run the manual commands below instead. **I have not modified
`clearOrders.js`** — that's a source-code change outside this read-only
phase's scope.

### Recommended target collections and order
No document in these collections is dereferenced elsewhere after deletion in
a way that causes errors (traced in section 4), so strict ordering isn't
required for correctness — but deleting child-before-parent is good hygiene
and costs nothing:

1. `shipments`
2. `returns`
3. `orders`
4. Reset `coupons.usedCount` to `0` for all coupons (see section 4/7 —
   recommended, not optional in spirit, since post-wipe the true usage count
   of every coupon against real orders is provably zero)
5. *(your call)* `carts` — not required for correctness, optional "fresh
   demo" cleanliness (see section 7)
6. *(your call)* `reviews` — not required for correctness (verdict in
   section 4), but if these 3 reviews are themselves test artifacts tied to
   the test orders being wiped, you may want them gone too (see section 7)

### `deleteMany({})` vs `drop()`
**Recommend `deleteMany({})`.** Checked this codebase: `autoIndex` is never
explicitly configured anywhere (`grep -rn autoIndex` — no hits), so
Mongoose's default (`true`) applies today, meaning indexes would in fact be
recreated automatically on next connect even after a `drop()`. However,
since you stated **this same procedure will later run against production**,
and production Mongoose setups commonly disable `autoIndex` for performance
(a very plausible change between now and deploy), relying on that default
is fragile. `deleteMany({})` empties the collection without ever touching
index metadata, so it's correct regardless of `autoIndex` config, in this
environment or the next. The collections here are tiny (13 orders, 0
shipments/returns) — no performance reason to prefer `drop()`.

### Manual procedure (mongosh / Compass) — re-runnable at prod deploy
```js
// mongosh, connected to the target database
use nepshop   // confirm this is the intended DB — see section 7

db.shipments.deleteMany({})
db.returns.deleteMany({})
db.orders.deleteMany({})
db.coupons.updateMany({}, { $set: { usedCount: 0 } })

// Optional — only if you decide to include these (see section 7):
// db.carts.deleteMany({})
// db.reviews.deleteMany({})
```

### Script vs manual
Given this procedure needs to run again at production deploy, a small
one-time script (mirroring `clearOrders.js`'s style, updated for
`Shipment`) is more reliable than re-typing mongosh commands twice and
guarantees prod parity. **I have not written this script** — per your
instructions this is your decision to make, not mine to default to. If you
want it, say the word and I'll write it in a separate, explicitly-approved
step.

### Post-wipe verification checklist
- [ ] `orders`, `shipments`, `returns` all show count `0`
- [ ] `coupons.usedCount` is `0` for every coupon (spot-check `PUBLIC100`)
- [ ] `users` count unchanged (22) and `products` count unchanged (121)
- [ ] App boots cleanly (`npm run dev` in `backend/`) — no errors from the
      settlement cron on startup
- [ ] Admin dashboard, Commission report, Payouts (pending + history) all
      render their empty states without console errors
- [ ] Seller `OrdersPage` and `Dashboard` load with zero orders (note:
      `EarningsPage` will still throw — see the bug flagged in section 4,
      unrelated to the wipe)
- [ ] Customer can place a brand-new order end-to-end (COD) and it creates
      exactly one `Shipment` per seller, per the Phase B design
      (`DIAGNOSIS.md` worked example)
- [ ] Existing products still show their old `rating`/`numReviews` (from
      preserved `reviews`, if you choose to keep them) and their *current*
      `stock` (not restored — see section 4 if you want to reset it first)

---

## 7. Open questions for you

1. **🚨 Confirm database identity.** `inspectDb.js` connected to Atlas
   database `nepshop` at `ac-hjexilq-shard-00-01.dabdkpb.mongodb.net`.
   Nothing in the code labels this dev vs. prod — please confirm this is
   the development database before anyone runs a deletion against it.

2. **🚨 `backend/clearOrders.js` already exists and does ~80% of this.**
   I did not expect to find a working, already-committed wipe script sitting
   at the repo root — `git log` shows it was added 2026-06-27 in commit
   `04e7ff1` ("Return flow: 5-min window, escrow freeze on return request,
   customer countdown/expiry UI"), well before this branch's `Shipment`
   work. It is stale relative to the current schema (no `shipments`
   handling, no coupon reset). Decide: extend it, or write a new one, or go
   fully manual. I have not touched it.

3. **🚨 Coupon `usedCount` is order-derived but lives in a preserved
   collection.** `PUBLIC100` is already fully exhausted (`1/1`) purely
   because of an order that's about to be deleted. Do you want all
   coupons' `usedCount` reset to `0` as part of the wipe? (Recommended —
   see section 4/6 — but flagging rather than assuming.)

4. **Reviews (3 docs) reference orders that will be deleted.** They will
   NOT crash or disappear (verdict in section 4) — but their `order` FK
   becomes unrecoverable, and any future "verified purchase" trust signal
   tied to that FK is gone. Since these look like test reviews on test
   orders, do you want them wiped too, or kept as-is (orphaned but
   functional)?

5. **Carts (5 docs) — wipe or leave?** Not technically stale (no embedded
   order data), so no correctness reason to touch them. Purely a "how fresh
   do you want the demo" preference.

6. **Stock reset — do you want it?** 14 products, 18 units total (full list
   in section 4) were decremented by orders about to be deleted, and won't
   self-correct. Small enough to fix by hand if you want products to look
   "never sold," but entirely optional and easy to skip.

7. **🐛 Unrelated pre-existing bug found:** `seller/EarningsPage.jsx` reads
   `data.orders`/`o.subtotal` from an endpoint that now returns
   `data.shipments`/`o.sellerSubtotal` (Phase B `Shipment` split). Currently
   broken regardless of any wipe. Not fixed in this phase — flagging so it
   doesn't get lost.

---

*No data was deleted, no source file was modified or removed, in the
production of this plan.*
