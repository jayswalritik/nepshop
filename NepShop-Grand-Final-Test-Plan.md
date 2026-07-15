# NepShop — Grand Final Test Plan
**Branch:** `fix/order-seller-split` · **Scope:** everything implemented this session · **Run before merge**

---

## How to use this document

- Run phases **in order** — later phases reuse state created by earlier ones (orders are labeled O1–O10).
- Tests marked **[MONEY]** require you to record the **exact numbers** you observe and paste them back verbatim. Everything else is PASS/FAIL with a note on failure.
- Tests marked **(optional)** are nice-to-have; skip freely if time is short.
- **If a [MONEY] test fails, STOP the phase** and report before continuing — later money tests build on earlier state.
- Check DB values in MongoDB Compass (db `nepshop`). If Compass hits DNS issues, use the non-SRV connection string commented in `backend\.env`.
- Backend must be running throughout (`npm run dev` from `backend\`) — the every-minute release cron lives in it.

### Known limitations — do NOT report these as bugs
1. Agent who closes the browser without logging out stays "Available" (by design, no heartbeats).
2. Chatbot return queries resolve to the first matching package per order (no disambiguation).
3. Chatbot may re-show a just-deactivated product if it was already shown earlier in the same conversation.
4. Seller EarningsPage does not display the `settlement.adjustment` ledger (payouts do net it).
5. Admin order-monitoring sends order-level status override; backend fans it to all non-terminal shipments.
6. Mid-payment mismatch surfaces as HTTP 500 (matches file convention).
7. Deactivated-seller login shows the generic "suspended" message.

---

## Phase 0 — Prerequisites & wipe

**T0.1 — Warn collaborator.** Shared live DB — the wipe empties the deployed site too.

**T0.2 — Wipe.** From `D:\NepShop\backend`: `node clearOrders.js` (dry run, review) then `node clearOrders.js --confirm`.
✅ Expected: counts to zero for orders/shipments/returns/reviews/carts; coupon usedCount **and usedBy** reset; stock restored; before/after summary prints.

**T0.3 — Test cast & catalog.** Ensure these exist (create/adjust now):
| What | Detail |
|---|---|
| Seller Ram | Products: **Headphone Rs 1,000** (stock 10), **Cable Rs 200** (stock 10) |
| Seller Sita | Product: **Book Rs 500** (stock 10). Plus at least 2 more products of hers (any price) for the soft-delete tests |
| Customer A | Main test customer |
| Customer B | Second customer (voucher per-user + scenario C) |
| Agents 1 & 2 | Delivery agent accounts |
| Admin | — |

**T0.4 — Vouchers.** As admin create:
- **VOUCH-A**: Rs 100 off, min spend ≤ 1,400, usageLimit 5, perUserLimit 1
- **VOUCH-B**: Rs 50 off, min spend ≤ 500, usageLimit **1**, perUserLimit 1
- **VOUCH-C**: Rs 100 off, min spend ≤ 1,500, usageLimit 5, perUserLimit 1

**T0.5 — Backend boots clean.** Restart backend; Mongo connects; no cron errors; admin dashboard/payouts/commission report render empty; seller EarningsPage loads empty.

---

## Phase 1 — Automated tests

**T1.1** — From `backend\`: `node tests\settlementMath.test.js`
✅ Expected: **11/11 passing**.

---

## Phase 2 — Single-seller regression (O1) — the gate

**T2.1 [MONEY] — Place O1.** Customer A, COD: Headphone ×1. Checkout shows Delivery **Rs 100**, Total **Rs 1,100**, one package.
✅ DB: 1 order (subtotal 1000, deliveryCharge 100, total 1100, commissionAmount 50) + **exactly 1 shipment** (sellerSubtotal 1000, deliveryCharge 100, commissionAmount 50, deliveryEarning 50).

**T2.2 — Full flow.** Ram: confirm → pack → dispatch (Agent 1). Agent 1: mark delivered.
✅ Shipment settlement: `sellerShare: 950`, `deliveryAgentPaid: true`, `status: 'partial'`, **`lockUntil` ≈ deliveredAt + 5 min**. Order status derived `delivered`.

**T2.3 — Auto-release.** Wait 5–6 min with backend running.
✅ `sellerReleased: true`, `commissionBooked: true` appear **without any button press**.

> If anything in Phase 2 deviates, STOP — the baseline is broken.

---

## Phase 3 — Multi-seller split (O2)

**T3.1 [MONEY] — Place O2.** Customer A, COD: Headphone ×1 + Book ×1.
✅ Checkout: **two packages**, two delivery lines (100 + 100), grand total **Rs 1,700**.
✅ DB: order (subtotal 1500, delivery 200, total 1700, commission 75); 2 shipments — Ram 1000/100/50, Sita 500/100/25.

**T3.2 — Dashboard isolation.** Log in as Ram: sees ONLY his item (list + detail). As Sita: mirror. Neither sees the other's product anywhere.

**T3.3 — Independent dispatch.** Ram: confirm→pack→dispatch (Agent 1). Check: Sita's shipment still `pending`, untouched pickupAddress; **order.status still `pending`** (least-advanced). Then Sita dispatches with **Agent 2**.

**T3.4 — Agent isolation + staggered delivery.** Agent 1 sees only Ram's job (Ram's pickup address); Agent 2 only Sita's. Agent 1 delivers → Ram's shipment `delivered`, Sita's `dispatched`, order NOT delivered. Agent 2 delivers → order flips `delivered`.

**T3.5 [MONEY] — Settlement.** Ram's settlement: sellerShare **950**; Sita's: **475**; each agent paid 50.

**T3.6 — Customer UI.** Customer A's OrdersPage for O2: two package sections, each with its own stepper fully filled to Delivered; header chips collapsed to one "Delivered"; footer one line: `Subtotal Rs 1,500 · Delivery (2 packages) Rs 200 · Total Rs 1,700`.

---

## Phase 4 — Release, payouts (the Sita test), commission report

**T4.1 — Auto-release O2.** ~5–6 min after each delivery: both shipments `sellerReleased: true` (may flip a minute apart — expected).

**T4.2 [MONEY] — Payout page.** Pending: **Ram Rs 1,900** (950 O1 + 950 O2), **Sita Rs 475**.
❌ Failure patterns: Ram 1,425/2,850 or Sita 1,425 = the old bug.

**T4.3 [MONEY] — THE SITA TEST.** Pay Ram. Immediately re-check: Ram cleared, **Sita still Rs 475**. DB: `sellerPaidOut: true` on Ram's two shipments only. Then pay Sita → clears. Payout history shows two separate correct records.

**T4.4 [MONEY] — Commission report checkpoint** (exactly O1+O2 delivered at this moment):
✅ Ram row: Rs 2,000 / Rs 100. Sita row: Rs 500 / Rs 25 (NOT 1,500/75).
✅ Platform: commission 125 · delivery margin 150 (collected 300 − paid 150) · NepShop total **Rs 275** · agents Rs 150 · delivered orders 2.

**T4.5 — Seller EarningsPage.** Ram's page loads, shows his orders with settled earnings consistent with 950+950. (Adjustment ledger absence = known limitation #4.)

---

## Phase 5 — Cart selective checkout (O7)

**T5.1 — Build the cart.** Customer A: Headphone ×1 (1,000) + Cable ×5 (1,000) + Book ×1 (500). All arrive **selected** by default.

**T5.2 [MONEY] — Free-delivery threshold via selection.** All selected: Ram's group = 2,000 → its delivery **FREE**; Sita's Rs 100; total **Rs 2,600**. Now **deselect the Cable line**: Ram's group drops to 1,000 → delivery **Rs 100**; total **Rs 1,600**.

**T5.3 — Toggles.** Ram's group checkbox unticks/ticks both his lines; Select All behaves tri-state; footer recomputes each time; a fully-deselected group shows no delivery line and doesn't count as a package.

**T5.4 — Zero-selected block.** Deselect everything → checkout button disabled + clear message; no request fires.

**T5.5 — Partial checkout.** Select Headphone + Book only (leave Cable deselected). Checkout COD.
✅ Order O7 = 2 shipments (Ram 1000, Sita 500), total 1,700. **Cable line remains in the cart afterward**, still deselected.

**T5.6 — Coupon vs selected subtotal (optional).** With only the Cable line (Rs 1,000-worth) selected, attempt VOUCH-C (min 1,500) → rejected against *selected* subtotal even though full cart exceeds it.

*(O7 can be left at `pending` — it feeds nothing later. Optionally cancel it to restore stock.)*

---

## Phase 6 — Vouchers (O3, O5)

**T6.1 [MONEY] — Place O3 with VOUCH-A.** Customer A, COD: Headphone ×1 + Cable ×2 + Book ×1, apply VOUCH-A.
✅ Checkout: subtotal 1,900, delivery 200, voucher −100, **paid Rs 2,000**.
✅ DB allocations (per line): headphone **52.63**, cable line **21.06**, book **26.31** (sum 100.00). Ram shipment couponAllocation sum **73.69**; Sita **26.31**. Ram share 1,330; Sita 475.

**T6.2 — Per-user limit.** Customer A attempts VOUCH-A on a new cart → **"You have already used this voucher."**

**T6.3 — Global exhaustion.** Customer A places **O5**: Book ×1 with VOUCH-B (paid 550, COD, leave `pending`). Customer B then attempts VOUCH-B → **"This voucher has been fully redeemed"** (distinct message).

**T6.4 — Full-order cancel restores voucher.** Customer A cancels O5 entirely.
✅ VOUCH-B usedCount back to 0 and A's usedBy cleared; book stock restored; **customer A can apply VOUCH-B again** (verify the apply succeeds; no need to complete that checkout).

**T6.5 — Deliver O3.** Both sellers dispatch (Ram→Agent 1, Sita→Agent 2), both agents deliver. Ram settlement share 1,330; Sita 475; lockUntil +5 min each. *(Do Phase 7 promptly — the return window is 5 minutes from Ram's delivery.)*

---

## Phase 7 — Returns part 1: scenarios A & B on O3 (act within the 5-min window)

**T7.1 [MONEY] — Scenario A: return 1 Cable, SELLER fault.** Customer A: O3 → Ram's package → Return → Cable, qty 1. Refund preview shows voucher-aware amounts. Submit. Admin approves → assign return agent → picked up → complete as **seller fault**.
✅ Refund to customer: **Rs 189.47**. Ram sellerShare 1,330 → **1,090**. Return doc: returnedValue 200, sellerReversal 190, commissionReversal 10, voucherReclaimed 10.53. Cable line returnedQuantity = 1. Settlement stays `'partial'`; returnHold cleared after completion; **Sita's 475 releases on schedule throughout** (targeted freeze proof).

**T7.2 [MONEY] — Scenario B: return the 2nd Cable, CUSTOMER fault.** Same flow, complete as **customer fault**.
✅ Refund: **Rs 139.47** (189.47 − 50 withheld). Ram 1,090 → **900** (no pickup fee borne). returnedQuantity = 2; the Cable line now shows nothing left to return.

**T7.3 — Rejection path.** Request a return on O3's Headphone → admin **rejects**.
✅ returnedQuantity decrements back; returnHold clears; Ram's remaining 900 releases normally; Headphone returnable again (until window closes).

**T7.4 (optional) — Race safety.** Two browser tabs, both request the same last-returnable unit → second gets a clean 400; no double reservation.

**T7.5 [MONEY] — Commission report after returns.** For O3's voucher: "Coupons Funded" now reflects 100 − 21.06 = **78.94**; commission reduced by the two Rs 10 reversals. (Delta check — absolute totals depend on your other orders.)

---

## Phase 8 — Returns part 2: scenario C + negative balance (O4)

**Setup:** in `backend\.env` add `ESCROW_LOCK_MINUTES=2` (env override; return window stays 5). **Restart backend.**

**T8.1 — Place O4.** **Customer B**, COD: Headphone ×1 + Cable ×2 + Book ×1, apply **VOUCH-A** (B hasn't used it → allowed — this is also the per-user-is-per-customer proof). Paid 2,000; same allocations as O3.

**T8.2 — Deliver Ram's package** (dispatch → Agent 1 → delivered). Wait ~2.5 min → Ram's 1,330 **releases** (2-min lock). Optionally pay Ram out now to test the paid variant.

**T8.3 [MONEY] — Scenario C: full-shipment return, SELLER fault.** At ~minute 3–4 (window still open): Customer B returns Headphone ×1 + Cable ×2 (everything). Admin approves → pickup → complete **seller fault**.
✅ Refund: **Rs 1,426.31** (1,400 − 73.69 voucher + 100 delivery). Commission back 70; voucherReclaimed 73.69. Because the share was already released: reversal lands in **`settlement.adjustment` = −1,480** (1,330 + 100 delivery + 50 pickup); settlement.status `'refunded'`.
✅ Payouts: Ram's pending shows **net −150** (released 1,330 + adjustment −1,480) — or, if you paid him in T8.2, the −1,480 nets against his next payout event.

**T8.4 — Cleanup.** Remove `ESCROW_LOCK_MINUTES=2` from `.env`; restart backend (back to 5).

---

## Phase 9 — Cancellations (O6)

**T9.1 [MONEY] — Place O6.** Customer A: Headphone + Book, **VOUCH-C**, pay via **eSewa/Khalti sandbox if available** (else COD — refund *amounts* only record for paid orders; voucher/stock checks still valid). Paid 1,600. Allocations: headphone 66.67, book 33.33.

**T9.2 [MONEY] — Customer cancels ONE package.** O6 → Ram's package (pending) → "Cancel package" → confirmation dialog states the refund. Confirm.
✅ Refund recorded: **Rs 1,033.33** (1000 + 100 − 66.67). Ram's stock +1. **Voucher NOT restored.** Sita's package untouched; header chips: one Cancelled badge + one live stepper; order not cancelled.

**T9.3 [MONEY] — Cancel the remaining package.** Same for Sita's.
✅ Refund **Rs 566.67**; zero non-cancelled shipments → **VOUCH-C restored** (usedCount/usedBy revert); order status `cancelled`; paymentStatus refunded if paid.

**T9.4 — Cancel-window enforcement.** On any packed/dispatched package (e.g., reuse a fresh order or O8 later): Cancel button absent; direct API call rejected with a clear message.

**T9.5 — Seller-side cancel regression.** New throwaway order (Book ×1, COD); **Sita** cancels her shipment from her dashboard → same shared-helper behavior (stock restored, refund fields recorded if paid), customer sees the cancelled badge.

---

## Phase 10 — Per-package actions & mixed-state UI (O8)

**T10.1 — Place O8.** Customer A, COD: Headphone + Book. Ram: confirm→pack→dispatch (Agent 1)→**deliver**. Sita: **leave at `pending`**.

**T10.2 — Mixed-state UI.** Header chips: "Delivered · Pending" (two chips, not one). Ram's stepper full; Sita's shows pending with the **first-step fill visible** (the half-segment fix). Order.status derived = `pending`.

**T10.3 — View details.** Expand Ram's package: items with prices, money line (subtotal · delivery · voucher n/a), **Agent 1's name + phone**, return countdown (if window still open). Sita's package: no agent shown (not dispatched).

**T10.4 — Review eligibility per shipment.** Ram's headphone shows a working Review button (submit one — rating appears on the product). Sita's book: **no review button** (its package undelivered).

**T10.5 — Cancel gating.** Ram's delivered package: no Cancel. Sita's pending package: Cancel visible (don't click — leave O8 as-is for Phase 11).

---

## Phase 11 — Seller soft-delete (O9, uses Sita)

**T11.1 — Setup.** Sita **manually deactivates one** of her extra products (self-deactivated, `deactivatedBySystem` stays false). Customer B adds one of Sita's active products to his cart. Place **O9**: Customer B, Book ×1, COD; Sita confirms→packs→**dispatches (Agent 2)** — leave undelivered.

**T11.2 — Warning flow.** Admin → Sita → Deactivate.
✅ Dialog shows in-flight counts matching reality (O8's pending + O9's dispatched = "2 shipments in progress (1 pending, 1 dispatched)"). Confirm anyway.

**T11.3 — Effects.** Sita's login blocked (generic suspended message — limitation #7). Her products: gone from browse, search, chatbot; **direct product URL → 404**; Customer B's cart item auto-deselected/stale (checkbox disabled, still removable). Her products' `deactivatedBySystem: true` (except the self-deactivated one).

**T11.4 [MONEY] — Money invariant.** Agent 2 **delivers O9** normally → settlement computes (share 475), releases after 5 min, **and is payable via paySeller** despite deactivation.

**T11.5 — Reactivate.** Admin reactivates Sita.
✅ Login works immediately; system-deactivated products back to `isActive: true`; the **self-deactivated product stays off**. UI shows "Deactivated"→normal; label is never "Delete" for sellers. (Optional closure: Sita fulfils O8's pending package.)

---

## Phase 12 — Agent availability

**T12.1 — Toggle + sorting.** Agent 1 toggles Available (dashboard switch, both desktop/mobile placements). Open the **seller dispatch picker** (any pending order) and the **admin return-pickup picker**: Agent 1 on top with 🟢/(Available); Agent 2 below, ⚪/(Offline)/muted. Toggle off → re-sorts.

**T12.2 — Offline still assignable.** With Agent 2 offline, dispatch an order to them → succeeds exactly as normal.

**T12.3 — Auto-offline on logout.** Agent 1 (Available) logs out → DB `isAvailable: false`.

**T12.4 — Default state.** Any never-toggled agent shows offline (new-agent registration optional).

**T12.5 — Browser-close limitation.** Toggle Available, close the tab without logout → stays Available (expected — limitation #1).

---

## Phase 13 — Cross-cutting

**T13.1 [MONEY] — Online payment end-to-end (O10).** Khalti or eSewa sandbox: multi-seller cart (Headphone + Book), optionally a voucher (customer B + VOUCH-C after its T9.3 restore).
✅ **Initiated amount = checkout total exactly** (e.g., 1,700, or 1,600 with voucher); after gateway success: order + 2 shipments created with the standard numbers; cart cleared of ordered items only. *(If sandbox is down: report it — we decide whether to merge with this flagged.)*

**T13.2 (optional, hard) — Mid-payment mismatch.** Initiate payment, deselect an item in another tab, complete payment → order creation fails loudly (500 per convention), no order/shipments created, coupon redemption rolled back.

**T13.3 — Emails.** From O2/O3 logs: each seller's email contains **only their items**; customer-cancel (T9.2) emailed the affected seller only; full-cancel emailed customer refund confirmation.

**T13.4 — Chatbot.** Ask about O2's status → coherent per-package answer, no crash. Ask about returning an item on a delivered multi-package order → per-package eligibility/window wording (first-match limitation #2 applies).

**T13.5 — Wipe-script sanity (optional).** Dry run `node clearOrders.js` → current counts print, nothing modified (do NOT --confirm — you'd erase your test evidence before merge review).

---

## Reporting back

Paste, per phase: PASS/FAIL per test + **verbatim numbers for every [MONEY] test** (T2.1, T3.1, T3.5, T4.2–T4.4, T5.2, T6.1, T7.1, T7.2, T7.5, T8.3, T9.1–T9.3, T11.4, T13.1). Screenshots welcome for UI tests. On any failure: exact behavior + backend console error, then stop that phase.

## After everything passes — pre-merge checklist
1. **Timing decision:** keep 5-min escrow/return + every-minute cron on the live site, or set production values via Render env vars (`ESCROW_LOCK_MINUTES`, `RETURN_WINDOW_MINUTES`, `RELEASE_CRON`)? Note: the frontend return-countdown constant is duplicated in code (limitation) — changing the window via env alone desyncs the customer countdown display.
2. Commit everything (if not already checkpointed), then your standard git flow: status → add → commit → checkout main → pull → checkout branch → merge main → push branch → checkout main → merge branch → push. **Push to main auto-deploys** (Render + Vercel) onto the shared DB — the live site gets all ten features at once.
3. Post-deploy smoke: live site loads, place one COD order end-to-end, check the admin payout page.
