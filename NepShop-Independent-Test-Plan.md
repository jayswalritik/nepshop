# NepShop — Independent Test Plan (v2)

**Branch:** `fix/order-seller-split` · **Supersedes:** `NepShop-Grand-Final-Test-Plan.md`
**Design principle:** every test case (TC) below is **self-contained** — it assumes a **fresh wipe** (`node backend/clearOrders.js --confirm`) immediately before it runs, and never depends on state left behind by another TC. Run them in any order, any subset, any number of times.

This version exists because the original plan chained ~10 orders across 13 sequential phases. Running it for real surfaced a concrete failure mode: **TC dependencies silently rot**. Two live examples from the verification run that produced this document:
- A step said "O7 can be left at pending — optionally cancel it." Not cancelling it meant a *later*, unrelated phase's in-flight-shipment count was off by one, and the discrepancy was invisible until that later phase ran.
- A different phase touched only one seller's leg of a two-seller order; the untouched leg silently lingered as "pending" and inflated a count three phases later.

Neither was a code bug — both were test-plan fragility. Independent tests eliminate this class of problem entirely.

---

## How to use this document

- **Before every TC**: run `node backend/clearOrders.js` (dry run, confirm counts), then `node backend/clearOrders.js --confirm`.
- **Test cast** (create once, outside the wipe's reach — `clearOrders.js` never touches users/products): Seller **Ram** (Headphone Rs 1,000 stock 10, Cable Rs 200 stock 10), Seller **Sita** (Book Rs 500 stock 10, plus 2 extra products for soft-delete TCs), Customer **A**, Customer **B**, Delivery **Agent 1**, Delivery **Agent 2**, **Admin**. Vouchers: **VOUCH-A** (Rs 100 off, min 1,400, limit 5/1-per-user), **VOUCH-B** (Rs 50 off, min 500, limit **1**/1-per-user), **VOUCH-C** (Rs 100 off, min 1,500, limit 5/1-per-user).
- Every TC states, after each step, the **exact expected numbers per role** (Customer / Seller / Admin / Delivery Agent) and the **affected areas** (stock, settlement, voucher, commission report) with what to check there. Record actuals verbatim; a mismatch means STOP and report before continuing.
- **Timing**: production defaults are `ESCROW_LOCK_MINUTES=15`, `RETURN_WINDOW_MINUTES=15` (confirmed current `.env` values). For faster iteration, temporarily lower both in `backend/.env` and restart the backend — but restore them afterward; nodemon does **not** hot-reload `.env` changes, a full restart is required both ways.
- **Money model (inviolable, unchanged from the original doc):** delivery is Rs 100 per seller-package, free if that package's own subtotal ≥ Rs 2,000. Seller share = `sellerSubtotal − commissionAmount` (delivery charge is never seller earnings). Vouchers are platform-funded, allocated per line proportional to line value (per-unit rounding). Return refund: seller-fault = `V − voucherSlice` (+ deliveryCharge only if the entire shipment is returned); customer-fault = `V − voucherSlice − 50` (pickup fee, deducted once).

---

## TC1 — Single-seller order, full lifecycle to auto-release (the gate)

**Setup:** fresh wipe.

**Step 1 — Customer A places an order:** Headphone ×1, COD.
- **Customer sees:** checkout screen shows Delivery Rs 100, Total **Rs 1,100**.
- **DB:** 1 order (`subtotal:1000, deliveryCharge:100, total:1100, commissionAmount:50`), exactly 1 shipment (`sellerSubtotal:1000, deliveryCharge:100, commissionAmount:50, deliveryEarning:50`).
- **Affected area — stock:** Headphone stock **−1**.

**Step 2 — Ram confirms → packs → dispatches (Agent 1). Agent 1 marks delivered.**
- **Seller (Ram) sees:** shipment status `delivered`.
- **Delivery Agent 1 sees:** Rs 50 earning credited; job moves from Active to Completed.
- **DB — affected area, settlement:** `sellerShare: 950`, `deliveryAgentPaid: true`, `status: 'partial'`, `lockUntil ≈ deliveredAt + 15 min`.
- **Customer sees:** order status `delivered`, return-window countdown starts (15 min).

**Step 3 — Wait for auto-release (~15–16 min).**
- **DB:** `sellerReleased: true`, `commissionBooked: true` — no button pressed.
- **Admin — Payouts page:** Ram's pending payout shows **Rs 950**.
- **Admin — Commission report:** Ram row **Rs 1,000 / Rs 50**; platform commission **Rs 50**, delivery margin **Rs 0** (100 collected − 100 to agent... note: single delivery leg costs exactly what was collected, margin is 0 here specifically because only one Rs 50 agent fee applies — see TC2 for the multi-package margin math), NepShop income **Rs 50**.

✅ **Verified in a live run.** If Step 3's numbers don't match, stop — this is the baseline; nothing else in this document can be trusted until it's green.

---

## TC2 — Multi-seller split (Daraz-style per-package delivery)

**Setup:** fresh wipe.

**Step 1 — Customer A orders Headphone ×1 + Book ×1, COD.**
- **Customer sees:** checkout — **2 packages**, two Rs 100 delivery lines, grand total **Rs 1,700**.
- **DB:** order (`subtotal:1500, deliveryCharge:200, total:1700, commissionAmount:75`); 2 shipments — Ram (`1000/100/50`), Sita (`500/100/25`).
- **Affected area — dashboard isolation:** Ram's `/orders/seller` response contains **only** the Headphone line; Sita's contains **only** the Book line. Neither ever sees the other's item, price, or image.

**Step 2 — Ram dispatches (Agent 1) independently of Sita.**
- **Seller (Sita) sees:** her shipment still `pending`, her pickup address untouched.
- **Customer sees:** order status still `pending` (least-advanced-shipment rule) even though Ram's leg is moving.
- **Delivery Agent 1 sees:** only Ram's job, Ram's pickup address. **Delivery Agent 2 sees:** nothing yet.

**Step 3 — Sita dispatches (Agent 2). Agent 1 delivers Ram's leg, then Agent 2 delivers Sita's leg (staggered).**
- After Agent 1 only: Ram's shipment `delivered`, Sita's `dispatched`, **order NOT `delivered` yet**.
- After Agent 2 too: order flips to `delivered`.
- **DB — settlement:** Ram `sellerShare: 950`; Sita `sellerShare: 475`; both agents paid Rs 50 each.

**Step 4 — Wait for auto-release (both legs, may land a minute apart — expected, not a bug).**
- **Admin — Payouts:** Ram **Rs 950**, Sita **Rs 475** (two *separate* rows — confirms no cross-seller bleed; this is the money-model regression this whole redesign protects against).
- **Admin — Commission report:** Ram row **Rs 1,000 / Rs 50**; Sita row **Rs 500 / Rs 25** (each seller's OWN revenue only — the historical bug this guards against showed Sita's row as Rs 1,500/Rs 75, the whole order's total). Platform: commission **Rs 75**, delivery margin **Rs 100** (200 collected − 100 paid to 2 agent legs), NepShop income **Rs 175**.
- **Customer sees (OrdersPage footer):** `Subtotal Rs 1,500 · Delivery (2 packages) Rs 200 · Total Rs 1,700`.

---

## TC3 — THE SITA TEST (payout isolation)

**Setup:** fresh wipe. Run TC2's steps 1–4 first (same order), OR place two separate single-seller orders (one Ram, one Sita) and deliver+release both — either setup works as long as both sellers have a released, unpaid balance.

**Step 1 — Admin pays Ram only** (`POST /admin/payouts/seller/:ramId`).
- **Admin — Payouts page, immediately after:** Ram's row disappears/clears. **Sita's row is untouched** — same amount as before.
- **DB:** only Ram's shipment(s) get `sellerPaidOut: true`; Sita's shipment(s) still `sellerPaidOut: false`.
- ❌ **Known historical failure pattern to watch for:** Ram shows a doubled amount (e.g. 1,425 instead of 950), or Sita's row also clears/changes when only Ram was paid. Either means the payout-isolation fix has regressed.

**Step 2 — Admin pays Sita.**
- **Admin — Payout history:** two separate, correctly-attributed records (not one merged/wrong one).

---

## TC4 — Vouchers: per-line allocation, per-user limit, global exhaustion

**Setup:** fresh wipe.

**Step 1 — Customer A orders Headphone ×1 + Cable ×2 + Book ×1, applies VOUCH-A (Rs 100 off).**
- **Customer sees:** subtotal Rs 1,900, delivery Rs 200, voucher −Rs 100, **paid Rs 2,000**.
- **DB — per-line couponAllocation:** headphone **52.63**, cable line **21.06** (2 units, per-unit rounding — not the naive 21.05 a per-line calc would give), book **26.31** — sum exactly **100.00**.
- **DB — per-shipment sum:** Ram's shipment `couponAllocation: 73.69`; Sita's `couponAllocation: 26.31`.
- **Affected area — projected settlement (if delivered):** Ram share would be **1,330**; Sita **475** (voucher never touches seller share — it's platform-funded, only affects customer-paid total and the refund-on-return math).

**Step 2 — Customer A tries VOUCH-A again on a fresh cart.**
- **Customer sees:** rejected — *"You have already used this voucher."*

**Step 3 — (Same wipe, no need for a second one) Customer A places a second order — Book ×1, VOUCH-B (limit 1 total).** Leave `pending`.
- **Customer sees:** paid **Rs 550** (500 + 100 − 50).
- **Customer B then tries VOUCH-B:** rejected — *"This voucher has been fully redeemed"* (a distinct message from Step 2's — global exhaustion vs. per-user reuse).

**Step 4 — Customer A cancels the whole VOUCH-B order.**
- **DB — affected area, voucher:** `usedCount` back to **0**, Customer A's entry **removed** from `usedBy` (not left at count 0 — this was a real bug, now fixed and covered by `couponRestore.test.js`).
- **Affected area — stock:** Book stock restored **+1**.
- **Customer A can immediately re-apply VOUCH-B successfully** (don't need to complete the checkout — just confirm the apply call succeeds).

---

## TC5 — Returns: partial seller-fault, partial customer-fault, rejection (single shipment)

**Setup:** fresh wipe. Place Customer A: Headphone ×1 + Cable ×2 + Book ×1, VOUCH-A (same numbers as TC4 Step 1). Dispatch + deliver **both** legs (Ram → Agent 1, Sita → Agent 2). Act within the return window from Ram's delivery.

**Step 1 — Return 1 Cable, seller fault.**
- **Customer sees:** refund preview is voucher-aware before submitting; after admin approval + pickup + completion, refund confirmation.
- **DB:** refund **Rs 189.47** (200 sticker value − 10.53 voucher slice = 189.47, no delivery add-on since this is a *partial* return). Ram's `sellerShare`: 1,330 → **1,090**. Return doc: `sellerReversal:190, commissionReversal:10, voucherReclaimed:10.53`. Cable line `returnedQuantity:1`.
- **Affected area — settlement:** stays `'partial'` (not fully resolved yet). `returnHold` clears once this one return finishes (no other open return on the shipment).
- **Affected area — Sita's shipment:** completely untouched; her Rs 475 releases on its own schedule regardless of Ram's return activity (this is the "targeted freeze" proof — only the shipment being returned is affected).

**Step 2 — Return the 2nd Cable, customer fault.**
- **DB:** refund **Rs 139.47** (189.47 − Rs 50 pickup fee, withheld from customer, not billed to seller since seller isn't at fault). Ram's `sellerShare`: 1,090 → **900**. Cable line `returnedQuantity:2` — nothing left on that line.

**Step 3 — Request a return on the Headphone; admin rejects it.**
- **DB:** `returnedQuantity` decrements back to 0 for that reservation; `returnHold` clears; Ram's share stays **900** (rejection changes nothing financially). Headphone is returnable again until the window closes.

**Step 4 — Admin — Commission report, delta check.**
- Coupons Funded should reflect the voucher slice reclaimed from the returned cable units: **−21.06** relative to before Step 1 (100 originally funded, 21.06 reclaimed on this one line so far... note: exact absolute totals depend on what else exists in the DB at check time; since this is a fresh wipe with only this order, "Coupons Funded" should read **78.94** exactly: 100 − 21.06).
- Commission reduced by the two Rs 10 reversals from Steps 1–2 (Rs 20 total).

---

## TC6 — Returns: full-shipment return after settlement already released (negative-balance / adjustment ledger)

**Setup:** fresh wipe. Temporarily set `ESCROW_LOCK_MINUTES` lower than `RETURN_WINDOW_MINUTES` in `.env` (e.g. 2 and 15) so the seller share releases **before** the return window closes, and restart the backend. Restore both afterward.

**Step 1 — Customer B orders Headphone ×1 + Cable ×2 + Book ×1, VOUCH-A** (same numbers as TC4/TC5 — Customer B hasn't used VOUCH-A, this also proves per-user limits are genuinely per-customer). Deliver Ram's leg. Wait for it to **release**.
- **DB:** Ram's `sellerShare: 1330`, `sellerReleased: true`.

**Step 2 — While still inside the return window, Customer B returns the ENTIRE Ram shipment (Headphone ×1 + Cable ×2), seller fault.**
- **DB — refund:** **Rs 1,426.31** (1,400 sticker value − 73.69 voucher + 100 delivery add-on, since this is a *full-shipment* return). `commissionReversal: 70`, `voucherReclaimed: 73.69`, `fullShipmentReturn: true`.
- **Affected area — settlement, since the share was already released:** the reversal does **not** rewrite `sellerShare` directly — it lands in **`settlement.adjustment: −1,480`** (1,330 released share + 100 delivery + 50 pickup fee borne by the at-fault seller), `settlement.status: 'refunded'`.
- **Admin — Payouts page:** Ram's **net pending balance is exactly this shipment's adjustment** if nothing else is outstanding for Ram in this fresh-wipe DB: **−150** (1,330 released − 1,480 adjustment). ⚠️ In the original chained test plan, this exact number came out to +750 instead of −150 — not a bug, but because an *unrelated, still-unpaid* shipment from an earlier phase was also contributing to the same "pending" total. **This is exactly the failure mode this document exists to prevent** — with a true fresh wipe, Ram has no other shipment, so −150 is the only, and therefore correct, number.

**Step 3 — Cleanup:** restore `.env` timing values, restart backend.

---

## TC7 — Cancellation: per-package, voucher restore only on full-order cancel

**Setup:** fresh wipe.

**Step 1 — Customer A orders Headphone ×1 + Book ×1, VOUCH-C, COD** (or a real gateway if available — COD is the documented fallback; stock/voucher checks are identical either way, only the *stored refund field* differs, see the note below).
- **Customer sees:** paid **Rs 1,600**. Allocations: headphone **66.67**, book **33.33**.

**Step 2 — Cancel Ram's (still-pending) package only.**
- **Customer sees:** cancel-confirmation dialog states the money consequence **before** confirming — for COD: *"You will no longer owe Rs 1,033.33 for this package"* (1,000 + 100 − 66.67); for a paid order: *"Rs 1,033.33 will be refunded."*
- **Affected area — stock:** Headphone **+1**.
- **Affected area — voucher:** VOUCH-C `usedCount` **unchanged** (Sita's package is still active — voucher only restores once the *entire* order ends up cancelled).
- **DB note:** `shipment.settlement.refundToCustomer` is only populated **if the order was actually paid** (`paymentStatus:'paid'`) — for COD, this field correctly stays 0, since nothing was ever collected to refund. The dialog's number above is a live, correct, client-computed preview either way; don't confuse "the dialog shows Rs X" with "the DB refund field is populated" — they're only the same thing for a paid order.
- **Customer sees:** Sita's package untouched; header shows one Cancelled badge + one live stepper; whole order **not** cancelled.

**Step 3 — Cancel Sita's (remaining) package too.**
- **Affected area — voucher:** NOW VOUCH-C fully restores — `usedCount` back to 0, Customer A removed from `usedBy`.
- **Customer sees:** order status flips to `cancelled`. If it had been a paid order, `paymentStatus` flips to `refunded`; for COD it correctly stays as-is (nothing to mark refunded).

**Step 4 — Cancel-window enforcement (separate fresh wipe, or a second product line in the same wipe).** Dispatch a package, then attempt to cancel it.
- **Customer sees:** Cancel button absent from the UI; a direct API call is rejected with a clear 400 message (*"Cannot cancel this package — it is already dispatched"*).

**Step 5 — Seller-side cancel (separate throwaway order).** Sita cancels her own pending shipment from her dashboard.
- Same shared-helper behavior as customer cancel: stock restored, refund fields recorded if paid. Customer sees the cancelled badge on her side too.

---

## TC8 — Admin cancel (override) routes through the same shared helper

**Setup:** fresh wipe. Customer A orders Headphone ×1, COD, pending.

**Step 1 — Admin overrides order status to `cancelled`** (not seller/customer cancel — the admin dropdown action).
- **Affected area — stock:** Headphone **+1** (same as any other cancel path — this uses the shared `cancelShipment` helper, not a bare status write).
- **Affected area — voucher:** if a voucher had been applied and this is the last active shipment, it restores exactly as in TC7.
- **Admin dropdown must show only:** `Pending / Confirmed / Cancelled`. Attempting `dispatched`/`delivered`/`returned` via direct API call → **400**, `"Admin override only supports these statuses: pending, confirmed, cancelled..."`.

**Step 2 — Double-cancel idempotency.** Admin overrides to `cancelled` again on the same (already-cancelled) order.
- **Affected area — stock:** must **not** increment a second time.

**Step 3 — Late-state admin cancel (packed/dispatched).** Repeat Step 1 but cancel from `packed` or `dispatched` instead of `pending`.
- Same stock-restore/refund-recording guarantee applies — the shared helper doesn't care what state the shipment was in before cancelling.

---

## TC9 — Per-request suspension enforcement

**Setup:** fresh wipe not required (this TC is account-status only, no orders needed). Customer or seller account, logged in with a valid token in one browser session.

**Step 1 — Admin suspends the logged-in user's account** (while their session is still open).
- **Affected area — any subsequent request from that session** (not just a fresh login attempt): 403, *"Your account has been suspended. Please contact support."* — enforced by the auth middleware on every request, not only at login.
- **Customer/Seller UI:** the session is force-logged-out and redirected to the login page showing that exact message (reusing the login page's own suspended-message banner).

**Step 2 — Admin reactivates.**
- Login works again immediately.

---

## TC10 — Seller soft-delete (suspend/reactivate) — money invariant + product visibility

**Setup:** fresh wipe. Sita has her Book plus 2 extra products. Self-deactivate one extra product first (`isActive:false, deactivatedBySystem:false`). Place one order against Sita (dispatched, not yet delivered) so there's a genuine in-flight shipment.

**Step 1 — Admin checks the deactivation-preview before suspending.**
- **Admin sees:** in-flight count and per-status breakdown that matches **exactly** what's really in-flight for this seller **right now** — in a fresh-wipe DB with only the one order from this TC's setup, that's `{dispatched: 1}`, total 1. (The original plan's equivalent check showed a stale-feeling "4" instead of "2" in one run — not a bug, just leftover shipments from unrelated earlier phases; a fresh wipe makes this number trustworthy again.)

**Step 2 — Admin suspends Sita.**
- **Seller (Sita):** login blocked, generic suspended message.
- **Customer/public:** all of Sita's products vanish from browse/search/chatbot; direct product URL → 404.
- **DB:** every product that was `isActive:true` flips to `isActive:false, deactivatedBySystem:true` — **except** the one Sita had already self-deactivated (stays `deactivatedBySystem:false`, so reactivation later knows not to touch it).
- Any customer with one of Sita's products still sitting in their cart sees it flagged `stale:true` (disabled checkbox, still removable).

**Step 3 — Money invariant.** The in-flight shipment continues normally: agent delivers it, settlement computes (`sellerShare` per the normal formula), releases on schedule, and **is payable via `paySeller` despite the account being deactivated** — deactivation is a login/visibility gate, never a money gate.

**Step 4 — Admin reactivates Sita.**
- Login works immediately. System-deactivated products come back to `isActive:true`. The self-deactivated one **stays off** — reactivation must never override the seller's own choice.

---

## TC11 — Cart selective checkout: per-group free-delivery threshold

**Setup:** fresh wipe. Customer A adds Headphone ×1 (1,000) + Cable ×5 (1,000) + Book ×1 (500) to cart — all selected by default.

**Step 1 — All selected.**
- **Customer sees:** Ram's group subtotal = 2,000 → his delivery line shows **FREE**; Sita's stays Rs 100; grand total **Rs 2,600**.

**Step 2 — Deselect the Cable line only.**
- **Customer sees:** Ram's group drops to 1,000 → delivery **Rs 100** again; total **Rs 1,600**. (Threshold is evaluated per seller-group against the *selected* subset, not the full cart.)

**Step 3 — Deselect everything.**
- Checkout button disabled with a clear message; **and**, independently, a direct API call with zero selected items is rejected with 400 (belt-and-suspenders — don't rely on the frontend guard alone).

**Step 4 — Select Headphone + Book only (Cable stays deselected), checkout COD.**
- **DB:** order = 2 shipments (Ram 1,000, Sita 500), total **Rs 1,700**. Cable line remains in the cart afterward, still deselected — untouched by the checkout that just happened.

**Step 5 (optional) — Coupon vs. selected subtotal.** With only the Cable line (Rs 1,000-worth) selected, attempt VOUCH-C (min 1,500).
- Rejected — evaluated against the **selected** subtotal (1,000), even though the full cart total would clear the minimum.

---

## TC12 — Mixed-state UI, per-shipment review eligibility, per-shipment cancel gating

**Setup:** fresh wipe. Customer A orders Headphone + Book, COD. Ram: confirm → pack → dispatch → **deliver**. Sita: leave at `pending`.

- **Customer sees (header):** two chips — *"Pkg 1: Delivered"* / *"Pkg 2: Pending"* (never collapsed to a single misleading status). Order-level derived status: `pending` (least-advanced-shipment rule).
- **Customer sees (expanded Ram package):** items, money line, **Agent 1's name** shown (dispatched/delivered packages show their agent; Sita's undispatched package shows none), return countdown if the window is still open.
- **Review eligibility:** a Review button appears **only** on Ram's (delivered) items; attempting to review a Book item (Sita's package, undelivered) is rejected — *"You can only review products from a delivered package"*. This is **shipment-scoped**, not order-scoped, which is exactly the point of this check.
- **Cancel gating:** no Cancel option on Ram's delivered package; Cancel is available on Sita's still-pending one.
- **Footer money line (COD, no cancellations yet):** `Subtotal Rs 1,500 · Delivery (2 packages) Rs 200 · Paid Rs 1,100 · To pay on delivery Rs 600` — the "Paid" bucket (Ram, delivered) and "To pay on delivery" bucket (Sita, still pending) are two **separate, both-shown** figures, not a single stale "Total."

---

## TC13 — Agent availability

**Setup:** fresh wipe not required (account-state only).

- **Default state:** a never-toggled agent shows offline (`isAvailable:false`).
- **Toggle on:** agent appears "Available" in both the seller's dispatch picker and the admin's return-pickup picker, sorted above offline agents.
- **Offline is still assignable:** dispatching to an offline agent succeeds exactly like an available one — availability is a UI/sorting signal only, never a hard gate.
- **Logout while Available:** flips to offline automatically (fire-and-forget, doesn't block logout itself).
- **Known, accepted limitation (not a bug):** closing the browser tab without logging out leaves the agent stuck "Available" — no heartbeat mechanism exists. Don't report this.

---

## TC14 — Online payment end-to-end (Khalti or eSewa sandbox)

**Setup:** fresh wipe. Customer B, multi-seller cart (Headphone + Book), optionally a voucher.

- **Initiated amount must equal the checkout total exactly** (e.g. Rs 1,700, or Rs 1,600 with a voucher) — verify this by checking the actual amount Khalti/eSewa displays on their own hosted page, not just what NepShop's frontend claims to have sent.
- **After a successful gateway payment:** order + N shipments created with the standard numbers (same formulas as every COD case above); cart cleared of only the items that were ordered, everything else left as-is.
- **If the sandbox itself rejects valid-looking test credentials** (this happened during verification — Khalti's own hosted page returned "Mobile or pin invalid" for the documented test account), that's an **external gateway issue, not a NepShop bug**, *provided* you've independently confirmed the amount reaching the gateway is exactly correct (which is the actual thing this TC is testing). Report it and move on rather than debugging the sandbox indefinitely.

---

## TC15 — Chatbot & emails (spot checks, not exhaustive)

**Setup:** any state with at least one active order.

- Ask the chatbot *"where is my order?"* → coherent, per-package-aware answer, no crash.
- Ask about returning an item on a delivered multi-package order → per-package eligibility/window wording. **Known limitation:** resolves to the first matching package only, no disambiguation prompt — don't report this.
- **Emails (check logs, not inbox — sandbox mail providers may be rate-limited):** each seller's "new order" email contains **only their own items**, never a co-seller's; a per-package customer cancel emails only the affected seller; a full-order cancel additionally emails the customer a refund confirmation.

---

## Appendix — money-model quick reference (for filling in the tables above on any new TC)

| Quantity | Formula |
|---|---|
| Per-package delivery charge | Rs 100, or Rs 0 if that package's own subtotal ≥ Rs 2,000 |
| Seller share (on delivery) | `sellerSubtotal − commissionAmount` (5% default rate) — **never** includes delivery charge |
| Voucher per-line allocation | proportional to line value, **per-unit** rounding, remainder absorbed by the last unit so the sum is always exact |
| Seller-fault return refund | `V − voucherSlice` (+ `deliveryCharge` only if the ENTIRE shipment is returned) |
| Customer-fault return refund | `V − voucherSlice − 50` (pickup fee, deducted once, never from the seller) |
| Return commission reversal | `V × commissionRate` — fault-independent (both seller- and customer-fault reverse commission) |
| COD "collect" / cancel-dialog amount | `sellerSubtotal + deliveryCharge − couponAllocation`, computed per-shipment |
| Adjustment ledger (post-release reversal) | fires only when the shipment's share was already released/paid out before the return completed |
