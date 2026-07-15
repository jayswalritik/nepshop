import { useState, useEffect } from 'react';
import API from '../../utils/api';

const statusColors = {
  pending:            'bg-yellow-100 text-yellow-700',
  confirmed:          'bg-blue-100 text-blue-700',
  packed:             'bg-indigo-100 text-indigo-700',
  dispatched:         'bg-purple-100 text-purple-700',
  delivered:          'bg-green-100 text-green-700',
  cancelled:          'bg-red-100 text-red-700',
  returned:           'bg-gray-100 text-gray-700',
};

const statusSteps = ['pending', 'confirmed', 'packed', 'dispatched', 'delivered'];

// Statuses with no forward progress to show — rendered as a badge instead of
// a stepper. 'returned' only ever appears on a shipment once its ENTIRE
// remaining value has been returned (see returnController.completeReturn) —
// a partial item-level return leaves shipment.status at 'delivered' and is
// instead communicated via the "N item(s) in return" badge below.
const NON_FORWARD_STATUSES = ['cancelled', 'returned'];

const formatStatusLabel = (status) =>
  status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// One horizontal stepper, driven entirely by the `status` prop — used once
// per shipment (or once for the whole order, for single-shipment/legacy
// orders with no shipments array). Same fill math as before; the fix isn't
// in this math, it's in never calling it for a status outside `statusSteps`
// (see NON_FORWARD_STATUSES above and the diagnosis in the task summary).
const StatusStepper = ({ status }) => {
  const currentIndex = statusSteps.indexOf(status);
  // The line's width represents "distance traveled since step 1" — at
  // currentIndex 0 (pending) that's mathematically 0, so the fill line was
  // fully invisible even though step one had in fact been reached (its dot
  // already renders filled below via isDone = i <= currentIndex, which is
  // correct at i=0). Give step one a half-segment stub instead of true zero
  // so "reached" is visible on the line too; every later step is untouched
  // (Math.max only changes the value when currentIndex is 0).
  const lineFillIndex = Math.max(currentIndex, 0.5);
  return (
    <div className="relative flex items-start justify-between">
      <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-200 z-0"></div>
      <div
        className="absolute top-3 left-0 h-0.5 bg-indigo-600 z-0 transition-all duration-500"
        style={{ width: `${(lineFillIndex / (statusSteps.length - 1)) * 100}%` }}
      ></div>
      {statusSteps.map((step, i) => {
        const isDone   = i <= currentIndex;
        const isActive = i === currentIndex;
        return (
          <div key={step} className="relative z-10 flex flex-col items-center flex-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mb-1 border-2
              ${isDone
                ? 'bg-indigo-600 border-indigo-600 text-white'
                : 'bg-white border-gray-300 text-gray-400'}`}>
              {isDone ? '✓' : i + 1}
            </div>
            <span className={`text-xs capitalize text-center leading-tight
              ${isActive ? 'text-indigo-600 font-medium' : isDone ? 'text-gray-600' : 'text-gray-400'}`}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Header status: a fully-returned order (every shipment returned in full)
// always shows as a single chip. Otherwise, single-shipment orders keep
// today's single order.status chip; multi-shipment orders show one chip per
// package (collapsed to one if every package currently shares a status), so
// the header never implies the whole order is only as far along as its
// slowest package.
const HeaderStatus = ({ order }) => {
  const chip = (status, key, label) => (
    <span key={key} className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
      {label ?? formatStatusLabel(status)}
    </span>
  );

  if (order.status === 'returned') {
    return chip(order.status, 'order');
  }

  const shipments = order.shipments || [];
  if (shipments.length <= 1) {
    return chip(order.status, 'order');
  }

  const uniqueStatuses = [...new Set(shipments.map(s => s.status))];
  if (uniqueStatuses.length === 1) {
    return chip(uniqueStatuses[0], 'collapsed');
  }

  return shipments.map((s, i) => chip(s.status, s._id, `Pkg ${i + 1}: ${formatStatusLabel(s.status)}`));
};

// Return window — duplicated from backend/config/settlementConfig.js's
// RETURN_WINDOW_MINUTES. No API currently exposes this value to the
// frontend, so this constant must be kept in sync by hand whenever the
// backend config value changes (known gap — flagged, not fixed here).
const RETURN_WINDOW_MINUTES = 5;

const OrdersPage = () => {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [selected, setSelected] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [reviewItem, setReviewItem]   = useState(null);
  const [reviewOrderId, setReviewOrderId] = useState(null);
  const [reviewSuccess, setReviewSuccess] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null); // { order, shipment }
  const [returnSuccess, setReturnSuccess] = useState('');
  const [myReturns, setMyReturns] = useState([]); // flat list from /returns/my, all statuses
  const [now, setNow] = useState(Date.now()); // ticks every second for countdown
  const [expandedShipments, setExpandedShipments] = useState(new Set()); // shipment._id -> details expanded
  const [cancelTarget, setCancelTarget] = useState(null); // { order, shipment } — per-package cancel confirmation
  const [cancellingShipmentId, setCancellingShipmentId] = useState(null);
  const [cancelSuccess, setCancelSuccess] = useState('');

  useEffect(() => {
    fetchOrders();
    fetchMyReturns();
  }, [filter]);

  // Live clock — updates every second so countdowns tick down
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Returns remaining ms in the return window for a delivered PACKAGE
  // (shipment) — the window runs from THAT shipment's own deliveredAt, not
  // the order's, so two packages in the same order can have different
  // countdowns.
  const returnTimeLeft = (shipment) => {
    if (!shipment || shipment.status !== 'delivered' || !shipment.deliveredAt) return 0;
    const expiry = new Date(shipment.deliveredAt).getTime() + RETURN_WINDOW_MINUTES * 60 * 1000;
    return Math.max(0, expiry - now);
  };

  const formatTimeLeft = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  // How many units of this item are still eligible to be returned.
  const remainingQty = (item) => item.quantity - (item.returnedQuantity || 0);
  const hasReturnableItems = (shipment) => (shipment.items || []).some((it) => remainingQty(it) > 0);

  // Open (pending/approved/picked_up) returns for one shipment — drives the
  // "N item(s) in return" badge shown ALONGSIDE the stepper.
  const openReturnsForShipment = (shipmentId) =>
    myReturns.filter((r) => r.shipment?._id === shipmentId && ['pending', 'approved', 'picked_up'].includes(r.status));

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 20 });
      if (filter) params.append('status', filter);
      const { data } = await API.get(`/orders/my?${params}`);
      setOrders(data.orders);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyReturns = async () => {
    try {
      const { data } = await API.get('/returns/my');
      setMyReturns(data.returns);
    } catch (err) {
      console.error('Failed to fetch returns:', err);
    }
  };

  const handleCancel = async (orderId) => {
    setCancelling(orderId);
    try {
      await API.put(`/orders/${orderId}/cancel`);
      fetchOrders();
      setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order');
    } finally {
      setCancelling(null);
    }
  };

  const toggleExpand = (shipmentId) => {
    setExpandedShipments((prev) => {
      const next = new Set(prev);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  };

  const handleCancelShipment = async () => {
    if (!cancelTarget) return;
    const shipmentId = cancelTarget.shipment._id;
    setCancellingShipmentId(shipmentId);
    try {
      const { data } = await API.put(`/orders/shipments/${shipmentId}/cancel`);
      setCancelTarget(null);
      setCancelSuccess(data.message || 'Package cancelled successfully.');
      fetchOrders();
      setTimeout(() => setCancelSuccess(''), 6000);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel package');
    } finally {
      setCancellingShipmentId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900">My Orders</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
        >
          <option value="">All Orders</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="packed">Packed</option>
          <option value="dispatched">On the Way</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">📦</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-500 text-sm">Your orders will appear here once you place them</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order._id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Order header */}
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <div>
                  <p className="text-xs text-gray-400">Order ID</p>
                  <p className="text-sm font-mono font-medium text-gray-700">#{order._id.slice(-8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Placed on</p>
                  <p className="text-sm text-gray-700">
                    {new Date(order.createdAt).toLocaleDateString('en-NP', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[50%]">
                  <HeaderStatus order={order} />
                  {order.paymentStatus === 'refunded' && (
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      💸 Refunded
                    </span>
                  )}
                </div>
              </div>

              {/* Order items */}
              <div className="p-5">
                <div className="space-y-3 mb-4">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex gap-3">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-14 h-14 object-cover rounded-lg border border-gray-100 flex-shrink-0"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-400">Qty: {item.quantity} × Rs {item.price.toLocaleString()}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900">
                        Rs {(item.price * item.quantity).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Per-package status — one stepper (or terminal-state badge)
                    per shipment, plus its own return countdown/action/badge.
                    Single-shipment/legacy orders (no shipments array) fall
                    back to a synthetic one-shipment list driven by the
                    order's own status, so this renders exactly one section
                    and looks like the old single-order stepper. */}
                {(() => {
                  const shipments = order.shipments?.length
                    ? order.shipments
                    : [{ _id: order._id, status: order.status, items: order.items, seller: null, deliveryAgent: order.deliveryAgent, deliveredAt: order.deliveredAt }];
                  const isMulti = shipments.length > 1;

                  return (
                    <div className="mb-4 space-y-4">
                      {isMulti && (
                        <p className="text-xs font-semibold text-gray-500 uppercase">
                          Arrives in {shipments.length} packages
                        </p>
                      )}
                      {shipments.map((shipment, i) => {
                        const openReturns = openReturnsForShipment(shipment._id);
                        const openQty = openReturns.reduce(
                          (s, r) => s + r.items.reduce((s2, it) => s2 + it.quantity, 0), 0
                        );
                        const timeLeft  = returnTimeLeft(shipment);
                        const canReturn = shipment.status === 'delivered' && timeLeft > 0 && hasReturnableItems(shipment);

                        return (
                          <div key={shipment._id}>
                            {isMulti && (
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-gray-700">
                                  Package {i + 1}
                                  {shipment.seller && (
                                    <span className="font-normal text-gray-400">
                                      {' '}— {shipment.seller.shopName || `${shipment.seller.firstName || ''} ${shipment.seller.lastName || ''}`.trim()}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {shipment.items.length} item{shipment.items.length > 1 ? 's' : ''}
                                  {shipment.deliveryAgent && ` · Agent: ${shipment.deliveryAgent.firstName} ${shipment.deliveryAgent.lastName}`}
                                </p>
                              </div>
                            )}

                            {/* Package badge — ALONGSIDE the stepper, never replacing it */}
                            {openQty > 0 && (
                              <span className="inline-block mb-2 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                {shipment.status === 'delivered' ? 'Delivered · ' : ''}
                                {openQty} item{openQty > 1 ? 's' : ''} in return
                              </span>
                            )}

                            {NON_FORWARD_STATUSES.includes(shipment.status) ? (
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusColors[shipment.status] || 'bg-gray-100 text-gray-700'}`}>
                                {formatStatusLabel(shipment.status)}
                              </span>
                            ) : (
                              <StatusStepper status={shipment.status} />
                            )}

                            {/* Per-package return window + action */}
                            {shipment.status === 'delivered' && hasReturnableItems(shipment) && (
                              <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                                {timeLeft > 0 ? (
                                  <p className="text-xs text-orange-600 flex items-center gap-1.5">
                                    <span>⏱</span>
                                    Return window: <span className="font-semibold">{formatTimeLeft(timeLeft)}</span> left
                                  </p>
                                ) : (
                                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                                    <span>⛔</span>
                                    Return window expired for this package
                                  </p>
                                )}
                                {canReturn && (
                                  <button
                                    onClick={() => setReturnTarget({ order, shipment })}
                                    className="text-xs text-orange-500 hover:text-orange-700 font-medium px-3 py-1.5 border border-orange-200 rounded-lg hover:border-orange-300 transition-all"
                                  >
                                    🔄 Return item(s)
                                  </button>
                                )}
                              </div>
                            )}

                            {/* Per-package actions — View details / Cancel package */}
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => toggleExpand(shipment._id)}
                                className="text-xs text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 border border-gray-200 rounded-lg hover:border-gray-300 transition-all"
                              >
                                {expandedShipments.has(shipment._id) ? 'Hide details' : 'View details'}
                              </button>
                              {['pending', 'confirmed'].includes(shipment.status) && (
                                <button
                                  onClick={() => setCancelTarget({ order, shipment })}
                                  disabled={cancellingShipmentId === shipment._id}
                                  className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 border border-red-200 rounded-lg hover:border-red-300 transition-all disabled:opacity-50"
                                >
                                  {cancellingShipmentId === shipment._id ? 'Cancelling...' : 'Cancel package'}
                                </button>
                              )}
                            </div>

                            {/* Expanded details — items, money line, delivery agent, per-item review */}
                            {expandedShipments.has(shipment._id) && (
                              <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                                <div className="space-y-2">
                                  {shipment.items.map((item, ii) => (
                                    <div key={ii} className="flex gap-3 items-center">
                                      <img
                                        src={item.image}
                                        alt={item.name}
                                        className="w-12 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                                        <p className="text-xs text-gray-400">
                                          Qty: {item.quantity} × Rs {item.price.toLocaleString()}
                                        </p>
                                        {item.couponAllocation > 0 && (
                                          <p className="text-xs text-green-600">voucher −Rs {item.couponAllocation.toLocaleString()}</p>
                                        )}
                                      </div>
                                      {shipment.status === 'delivered' && (
                                        <button
                                          onClick={() => { setReviewItem(item); setReviewOrderId(order._id); }}
                                          className="text-xs text-yellow-600 hover:text-yellow-700 font-medium px-3 py-1.5 border border-yellow-200 rounded-lg hover:border-yellow-300 transition-all flex-shrink-0"
                                        >
                                          ⭐ Review
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 pt-2 border-t border-gray-100">
                                  <span>Items Rs {(shipment.sellerSubtotal || 0).toLocaleString()}</span>
                                  <span className="text-gray-300">·</span>
                                  <span>
                                    Delivery {shipment.deliveryCharge === 0
                                      ? <span className="text-green-600 font-medium">FREE</span>
                                      : `Rs ${shipment.deliveryCharge.toLocaleString()}`}
                                  </span>
                                  {shipment.couponAllocation > 0 && (
                                    <>
                                      <span className="text-gray-300">·</span>
                                      <span className="text-green-600">voucher −Rs {shipment.couponAllocation.toLocaleString()}</span>
                                    </>
                                  )}
                                </div>

                                {shipment.deliveryAgent && (
                                  <div className="text-xs text-gray-600 pt-2 border-t border-gray-100">
                                    🚚 Delivery agent: <span className="font-medium">
                                      {shipment.deliveryAgent.firstName} {shipment.deliveryAgent.lastName}
                                    </span>
                                    {shipment.deliveryAgent.phone && ` · ${shipment.deliveryAgent.phone}`}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="text-sm text-gray-600 flex items-center flex-wrap gap-x-1.5">
                    <span>Subtotal Rs {order.subtotal.toLocaleString()}</span>
                    <span className="text-gray-300">·</span>
                    <span>
                      Delivery{order.shipments?.length > 1 ? ` (${order.shipments.length} packages)` : ''} Rs {order.deliveryCharge.toLocaleString()}
                    </span>
                    {order.couponDiscount > 0 && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-green-600">Coupon −Rs {order.couponDiscount.toLocaleString()}</span>
                      </>
                    )}
                    <span className="text-gray-300">·</span>
                    {(() => {
                      const shipments = order.shipments || [];
                      const round2 = (n) => +Number(n).toFixed(2);
                      const payable = (s) => round2((s.sellerSubtotal || 0) + (s.deliveryCharge || 0) - (s.couponAllocation || 0));

                      // Real, reachable statuses only (backend/models/Shipment.js's enum
                      // also lists legacy 'return_assigned'/'return_in_transit', but
                      // those are never actually set anymore — see adminController.js's
                      // and orderActions.js's own comments confirming they no longer
                      // apply — so they're deliberately absent from ACTIVE_STATUSES and
                      // fall through to "excluded" below, same as if they never occur).
                      const ACTIVE_STATUSES = ['pending', 'confirmed', 'packed', 'dispatched'];
                      // 'cancelled' AND 'returned' are both excluded from every bucket:
                      // a returned COD shipment was collected then refunded via the
                      // return flow, so it must not reappear as payable here — that
                      // story belongs to the return UI, not this summary line.
                      const isRemoved = (s) => s.status === 'cancelled' || s.status === 'returned';
                      const hasRemovedShipment =
                        shipments.some(isRemoved) && shipments.some((s) => !isRemoved(s));

                      if (order.paymentMethod === 'cash_on_delivery') {
                        const paid  = round2(shipments.filter((s) => s.status === 'delivered').reduce((sum, s) => sum + payable(s), 0));
                        const toPay = round2(shipments.filter((s) => ACTIVE_STATUSES.includes(s.status)).reduce((sum, s) => sum + payable(s), 0));
                        return (
                          <>
                            {hasRemovedShipment && (
                              <>
                                <span className="text-gray-400 line-through">Original total Rs {order.total.toLocaleString()}</span>
                                <span className="text-gray-300">·</span>
                              </>
                            )}
                            {paid === 0 && toPay === 0 && (
                              <span className="font-bold text-gray-900">Total Rs {order.total.toLocaleString()}</span>
                            )}
                            {paid > 0 && (
                              <span className="font-bold text-green-600">Paid Rs {paid.toLocaleString()}</span>
                            )}
                            {paid > 0 && toPay > 0 && <span className="text-gray-300">·</span>}
                            {toPay > 0 && (
                              <span className="font-bold text-gray-900">To pay on delivery Rs {toPay.toLocaleString()}</span>
                            )}
                          </>
                        );
                      }

                      // Prepaid orders — unchanged.
                      if (!hasRemovedShipment) {
                        return <span className="font-bold text-gray-900">Total Rs {order.total.toLocaleString()}</span>;
                      }
                      const refunded = round2(
                        shipments
                          .filter((s) => s.status === 'cancelled')
                          .reduce((sum, s) => sum + (s.settlement?.refundToCustomer || 0), 0)
                      );
                      return (
                        <>
                          <span className="text-gray-400 line-through">Original total Rs {order.total.toLocaleString()}</span>
                          <span className="text-gray-300">·</span>
                          <span className="font-bold text-green-600">Refunded Rs {refunded.toLocaleString()}</span>
                        </>
                      );
                    })()}
                    <span className="text-xs text-gray-400">({order.paymentMethod.replace(/_/g, ' ')})</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setSelected(order)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                    >
                        Order details
                    </button>
                    {['pending', 'confirmed', 'packed'].includes(order.status) && (
                        <button
                            onClick={() => handleCancel(order._id)}
                            disabled={cancelling === order._id}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 border border-red-200 rounded-lg hover:border-red-300 transition-all disabled:opacity-50"
                        >
                            {cancelling === order._id ? 'Cancelling...' : 'Cancel whole order'}
                        </button>
                    )}
                </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Order detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Order Details</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Order ID</span>
                <span className="font-mono font-medium">#{selected._id.slice(-8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selected.status]}`}>
                  {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Payment</span>
                <span>{selected.paymentMethod.replace(/_/g, ' ')}</span>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <p className="font-medium text-gray-700 mb-2">Delivery Address</p>
                <p className="text-gray-600">{selected.deliveryAddress.fullName}</p>
                <p className="text-gray-500">{selected.deliveryAddress.phone}</p>
                <p className="text-gray-500">
                  {selected.deliveryAddress.street}, {selected.deliveryAddress.city}, {selected.deliveryAddress.district}
                </p>
                {selected.deliveryAddress.landmark && (
                  <p className="text-gray-400 text-xs">Near: {selected.deliveryAddress.landmark}</p>
                )}
              </div>
              {selected.customerNote && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="font-medium text-gray-700 mb-1">Note</p>
                  <p className="text-gray-500 italic">{selected.customerNote}</p>
                </div>
              )}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>Rs {selected.total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelected(null)}
              className="w-full mt-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Return modal */}
      {returnTarget && (
        <ReturnModal
          order={returnTarget.order}
          shipment={returnTarget.shipment}
          onClose={() => setReturnTarget(null)}
          onSuccess={(msg) => {
            setReturnTarget(null);
            setReturnSuccess(msg);
            fetchOrders();
            fetchMyReturns();
            setTimeout(() => setReturnSuccess(''), 6000);
          }}
        />
      )}

      {/* Return success toast */}
      {returnSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-orange-500 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 max-w-sm">
          <span>🔄</span>
          <span>{returnSuccess}</span>
          <button onClick={() => setReturnSuccess('')} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Cancel package confirmation modal */}
      {cancelTarget && (
        <CancelPackageModal
          order={cancelTarget.order}
          shipment={cancelTarget.shipment}
          loading={cancellingShipmentId === cancelTarget.shipment._id}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelShipment}
        />
      )}

      {/* Cancel package success toast */}
      {cancelSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 max-w-sm">
          <span>✅</span>
          <span>{cancelSuccess}</span>
          <button onClick={() => setCancelSuccess('')} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Review modal */}
      {reviewItem && (
        <ReviewModal
          item={reviewItem}
          orderId={reviewOrderId}
          onClose={() => {
            setReviewItem(null);
            setReviewOrderId(null);
          }}
          onSuccess={() => {
            setReviewItem(null);
            setReviewOrderId(null);

            setReviewSuccess('Review submitted successfully! Thank you.');

            setTimeout(() => {
              setReviewSuccess(null);
            }, 4000);
          }}
        />
      )}

      {/* Review success toast */}
      {reviewSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <span>⭐</span>
          {reviewSuccess}
        </div>
      )}
    </div>
  );
};

// ── Review Modal ──────────────────────────────────────────
const ReviewModal = ({ item, orderId, onClose, onSuccess }) => {
  const [rating,  setRating]  = useState(0);
  const [hover,   setHover]   = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async () => {
    if (!rating) { setError('Please select a rating'); return; }
    if (!comment.trim()) { setError('Please write a comment'); return; }

    setLoading(true);
    setError('');
    try {
      await API.post('/reviews', {
        productId: item.product,
        orderId,
        rating,
        comment,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">

        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900">Write a Review</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {/* Product info */}
        <div className="flex gap-3 mb-5 bg-gray-50 rounded-xl p-3">
          <img
            src={item.image}
            alt={item.name}
            className="w-14 h-14 object-cover rounded-lg border border-gray-100"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">{item.name}</p>
            <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {/* Star rating */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Rating <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(star)}
                className="text-3xl transition-all"
              >
                <span className={star <= (hover || rating) ? 'text-yellow-400' : 'text-gray-200'}>
                  ★
                </span>
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
            </p>
          )}
        </div>

        {/* Comment */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your Review <span className="text-red-500">*</span>
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience with this product..."
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none"
          />
          <p className="text-xs text-gray-400 text-right mt-1">{comment.length}/500</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
          >
            {loading ? 'Submitting...' : '⭐ Submit Review'}
          </button>
        </div>
      </div>

    </div>
  );
};

// ── Cancel Package Modal — confirms per-shipment cancel with the
// allocation-aware refund amount (mirrors the backend's exact formula:
// sellerSubtotal + deliveryCharge - couponAllocation) ─────────────────────
const CancelPackageModal = ({ order, shipment, loading, onClose, onConfirm }) => {
  const round2 = (n) => +Number(n).toFixed(2);
  const willRefund = order.paymentStatus === 'paid';
  const refund = round2((shipment.sellerSubtotal || 0) + (shipment.deliveryCharge || 0) - (shipment.couponAllocation || 0));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel this package?</h3>
        <p className="text-sm text-gray-500 mb-4">
          {shipment.items.length} item{shipment.items.length > 1 ? 's' : ''} in this package will be cancelled and the stock restored.
        </p>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4">
          <p className="text-sm font-semibold text-indigo-900">
            {willRefund
              ? `Rs ${refund.toLocaleString()} will be refunded to your original payment method.`
              : `You will no longer owe Rs ${refund.toLocaleString()} for this package.`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
          >
            Keep package
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
          >
            {loading ? 'Cancelling...' : 'Cancel package'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Return Modal — pick item(s) + quantity from ONE package (shipment) ────
const ReturnModal = ({ order, shipment, onClose, onSuccess }) => {
  const [reason, setReason]           = useState('');
  const [description, setDescription] = useState('');
  const [qtyByProduct, setQtyByProduct] = useState({}); // productId -> selected qty
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const reasons = [
    'Damaged product',
    'Wrong product delivered',
    'Product not as described',
    'Changed my mind',
    'Better price available',
    'Other',
  ];

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const returnableItems = shipment.items
    .map((it) => ({ ...it, remaining: it.quantity - (it.returnedQuantity || 0) }))
    .filter((it) => it.remaining > 0);

  const setQty = (productId, qty, max) => {
    const clamped = Math.max(0, Math.min(qty, max));
    setQtyByProduct((prev) => ({ ...prev, [productId]: clamped }));
  };

  const selected = returnableItems
    .map((it) => ({ ...it, selectedQty: qtyByProduct[it.product] || 0 }))
    .filter((it) => it.selectedQty > 0);

  // Refund preview comes from the backend — same classification/reversal
  // math completeReturn will actually apply, so this can never show a
  // number (or a full-vs-partial verdict) the system can't honor. Debounced
  // on the selected item/quantity set so rapid +/- clicks don't spam
  // requests.
  useEffect(() => {
    if (selected.length === 0) {
      queueMicrotask(() => setPreview(null));
      return;
    }
    const items = selected.map((i) => ({ product: i.product, quantity: i.selectedQty }));
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      API.post('/returns/preview', { shipmentId: shipment._id, items })
        .then(({ data }) => setPreview(data.preview))
        .catch(() => setPreview(null))
        .finally(() => setPreviewLoading(false));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(qtyByProduct)]);

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason'); return; }
    if (selected.length === 0) { setError('Select at least one item and quantity to return'); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await API.post('/returns', {
        shipmentId: shipment._id,
        items: selected.map((i) => ({ product: i.product, quantity: i.selectedQty })),
        reason,
        description,
      });
      onSuccess(data.message || 'Return request submitted successfully! Admin will review and process your refund.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit return request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900">Return Item(s)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Order/package info */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4">
          <p className="text-xs text-gray-500">Order</p>
          <p className="text-sm font-medium text-gray-900">
            #{order._id.slice(-8).toUpperCase()}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {/* Item + quantity picker */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select item(s) and quantity <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {returnableItems.map((item) => (
              <div key={item.product} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl">
                <img src={item.image} alt={item.name} className="w-12 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400">Rs {item.price.toLocaleString()} · {item.remaining} returnable</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty(item.product, (qtyByProduct[item.product] || 0) - 1, item.remaining)}
                    className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300"
                  >−</button>
                  <span className="w-6 text-center text-sm font-medium">{qtyByProduct[item.product] || 0}</span>
                  <button
                    type="button"
                    onClick={() => setQty(item.product, (qtyByProduct[item.product] || 0) + 1, item.remaining)}
                    className="w-7 h-7 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300"
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason for return <span className="text-red-500">*</span>
          </label>
          <div className="space-y-2">
            {reasons.map((r) => (
              <label key={r} className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all
                ${reason === r ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="text-indigo-600"
                />
                <span className="text-sm text-gray-700">{r}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Additional details (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in more detail..."
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none"
          />
        </div>

        {/* Refund preview — voucher-aware, both possible fault outcomes since
            the admin decides fault at approval */}
        {selected.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4">
            <p className="text-xs font-semibold text-indigo-900 mb-1">Estimated refund (final amount set on review)</p>
            {previewLoading && !preview ? (
              <p className="text-xs text-indigo-700">Calculating…</p>
            ) : preview ? (
              <>
                <p className="text-xs text-indigo-700">
                  If it's a seller issue: <strong>Rs {preview.seller.refundToCustomer.toLocaleString()}</strong>
                  {preview.voucherSlice > 0 && ` (Rs ${preview.voucherSlice.toLocaleString()} of your voucher discount stays with those units)`}
                </p>
                <p className="text-xs text-indigo-700">
                  If it's a change of mind: <strong>Rs {preview.customer.refundToCustomer.toLocaleString()}</strong> (minus Rs {preview.pickupFee} return pickup fee)
                </p>
                {preview.isFullShipmentReturn && (
                  <p className="text-xs font-medium text-indigo-900 mt-1">📦 This returns the entire package — seller-issue refund includes the Rs {preview.deliveryCharge} delivery charge.</p>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Info */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-5">
          <p className="text-xs text-orange-700">
            ⏰ Once approved, a delivery agent will collect the item(s) and your refund will be processed.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
          >
            {loading ? 'Submitting...' : '🔄 Submit Return'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;

