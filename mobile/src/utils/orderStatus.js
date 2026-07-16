import { COLORS } from '../constants/colors';

// Mirrors frontend/src/pages/customer/OrdersPage.jsx's statusColors/
// statusSteps/NON_FORWARD_STATUSES/formatStatusLabel/RETURN_WINDOW_MINUTES
// exactly — same statuses, same grouping, same constant value.

export const STATUS_COLORS = {
  pending:    { bg: COLORS.warningSoft, text: COLORS.warning },
  confirmed:  { bg: COLORS.infoSoft,    text: COLORS.info },
  packed:     { bg: COLORS.primarySoft, text: COLORS.primary },
  dispatched: { bg: COLORS.purpleSoft,  text: COLORS.purple },
  delivered:  { bg: COLORS.successSoft, text: COLORS.success },
  cancelled:  { bg: COLORS.dangerSoft,  text: COLORS.danger },
  returned:   { bg: COLORS.surface,     text: COLORS.textMuted },
};

export const statusColorFor = (status) => STATUS_COLORS[status] || STATUS_COLORS.returned;

export const STATUS_STEPS = ['pending', 'confirmed', 'packed', 'dispatched', 'delivered'];

// Statuses with no forward progress to show — rendered as a single badge
// instead of a stepper. 'returned' only ever appears on a shipment once its
// ENTIRE remaining value has been returned — a partial item-level return
// leaves shipment.status at 'delivered' (see the "N item(s) in return"
// badge instead).
export const NON_FORWARD_STATUSES = ['cancelled', 'returned'];

export const formatStatusLabel = (status) =>
  status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// Return window — duplicated from backend/config/settlementConfig.js's
// RETURN_WINDOW_MINUTES, same as web's OrdersPage.jsx does. No API currently
// exposes this value to clients, so this constant must be kept in sync by
// hand whenever the backend config value changes (known gap, flagged not
// fixed here — same known gap web already carries).
export const RETURN_WINDOW_MINUTES = 5;

// Remaining ms in the return window for a delivered PACKAGE (shipment) — the
// window runs from THAT shipment's own deliveredAt, not the order's.
export const returnTimeLeft = (shipment, now) => {
  if (!shipment || shipment.status !== 'delivered' || !shipment.deliveredAt) return 0;
  const expiry = new Date(shipment.deliveredAt).getTime() + RETURN_WINDOW_MINUTES * 60 * 1000;
  return Math.max(0, expiry - now);
};

export const formatTimeLeft = (ms) => {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};

// How many units of this item are still eligible to be returned.
export const remainingQty = (item) => item.quantity - (item.returnedQuantity || 0);
export const hasReturnableItems = (shipment) => (shipment.items || []).some((it) => remainingQty(it) > 0);
