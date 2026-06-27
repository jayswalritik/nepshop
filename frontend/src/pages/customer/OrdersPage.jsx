import { useState, useEffect } from 'react';
import API from '../../utils/api';

const statusColors = {
  pending:    'bg-yellow-100 text-yellow-700',
  confirmed:  'bg-blue-100 text-blue-700',
  packed:     'bg-indigo-100 text-indigo-700',
  dispatched: 'bg-purple-100 text-purple-700',
  delivered:  'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-700',
  returned:   'bg-gray-100 text-gray-700',
};

const statusSteps = ['pending', 'confirmed', 'packed', 'dispatched', 'delivered'];

// Return window — must match backend RETURN_WINDOW_MINUTES
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
  const [returnOrder, setReturnOrder] = useState(null);
  const [returnSuccess, setReturnSuccess] = useState('');
  const [now, setNow] = useState(Date.now()); // ticks every second for countdown

  useEffect(() => {
    fetchOrders();
  }, [filter]);

  // Live clock — updates every second so countdowns tick down
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Returns remaining ms in the return window for a delivered order
  const returnTimeLeft = (order) => {
    if (order.status !== 'delivered' || !order.deliveredAt) return 0;
    const expiry = new Date(order.deliveredAt).getTime() + RETURN_WINDOW_MINUTES * 60 * 1000;
    return Math.max(0, expiry - now);
  };

  const formatTimeLeft = (ms) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };
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
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
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


                {/* Progress bar */}
{!['cancelled', 'returned'].includes(order.status) && (
  <div className="mb-4">
    <div className="relative flex items-start justify-between">
      {/* Background line */}
      <div className="absolute top-3 left-0 right-0 h-0.5 bg-gray-200 z-0"></div>
      {/* Progress line */}
      <div
        className="absolute top-3 left-0 h-0.5 bg-indigo-600 z-0 transition-all duration-500"
        style={{
          width: `${(statusSteps.indexOf(order.status) / (statusSteps.length - 1)) * 100}%`
        }}
      ></div>

      {statusSteps.map((step, i) => {
        const currentIndex = statusSteps.indexOf(order.status);
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
  </div>
)}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div>
                    <span className="text-xs text-gray-400">Total: </span>
                    <span className="text-base font-bold text-gray-900">Rs {order.total.toLocaleString()}</span>
                    <span className="text-xs text-gray-400 ml-2">({order.paymentMethod.replace('_', ' ')})</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => setSelected(order)}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                    >
                        View Details
                    </button>
                    {['pending', 'confirmed', 'packed'].includes(order.status) && (
                        <button
                            onClick={() => handleCancel(order._id)}
                            disabled={cancelling === order._id}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 border border-red-200 rounded-lg hover:border-red-300 transition-all disabled:opacity-50"
                        >
                            {cancelling === order._id ? 'Cancelling...' : 'Cancel'}
                        </button>
                    )}
                    {order.status === 'delivered' && (
                        <button
                            onClick={() => {
                                setReviewItem(order.items[0]);
                                setReviewOrderId(order._id);
                            }}
                            className="text-xs text-yellow-600 hover:text-yellow-700 font-medium px-3 py-1.5 border border-yellow-200 rounded-lg hover:border-yellow-300 transition-all"
                        >
                            ⭐ Review
                        </button>
                    )}
                    {order.status === 'delivered' && returnTimeLeft(order) > 0 && (
                        <button
                          onClick={() => setReturnOrder(order)}
                          className="text-xs text-orange-500 hover:text-orange-700 font-medium px-3 py-1.5 border border-orange-200 rounded-lg hover:border-orange-300 transition-all"
                        >
                          🔄 Return
                        </button>
                      )}
                </div>
                </div>

                {/* Return window countdown / expiry message */}
                {order.status === 'delivered' && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {returnTimeLeft(order) > 0 ? (
                      <p className="text-xs text-orange-600 flex items-center gap-1.5">
                        <span>⏱</span>
                        You can return this product within{' '}
                        <span className="font-semibold">{formatTimeLeft(returnTimeLeft(order))}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <span>⛔</span>
                        Return window has expired for this order
                      </p>
                    )}
                  </div>
                )}
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
      {returnOrder && (
        <ReturnModal
          order={returnOrder}
          onClose={() => setReturnOrder(null)}
          onSuccess={(msg) => {
            setReturnOrder(null);
            setReturnSuccess(msg);
            fetchOrders();
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

// ── Return Modal ──────────────────────────────────────────
const ReturnModal = ({ order, onClose, onSuccess }) => {
  const [reason, setReason]           = useState('');
  const [description, setDescription] = useState('');
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

  const handleSubmit = async () => {
    if (!reason) { setError('Please select a reason'); return; }
    setLoading(true);
    setError('');
    try {
      await API.post('/returns', {
        orderId: order._id,
        reason,
        description,
      });
      onSuccess('Return request submitted successfully! Admin will review and process your refund within 3-5 business days.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit return request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900">Request Return</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {/* Order info */}
        <div className="bg-gray-50 rounded-xl p-3 mb-4">
          <p className="text-xs text-gray-500">Order</p>
          <p className="text-sm font-medium text-gray-900">
            #{order._id.slice(-8).toUpperCase()}
          </p>
          <p className="text-sm font-bold text-indigo-600">
            Rs {order.total.toLocaleString()}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

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
        <div className="mb-5">
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

        {/* Info */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-5">
          <p className="text-xs text-orange-700">
            ⏰ Returns must be requested within the return window shown on your order.
            Once approved, a delivery agent will collect the item and your refund will be processed.
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

