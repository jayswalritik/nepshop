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

const OrdersPage = () => {
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [selected, setSelected] = useState(null);
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, [filter]);

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
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
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
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelected(order)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                    >
                      View Details
                    </button>
                    {['pending', 'confirmed'].includes(order.status) && (
                      <button
                        onClick={() => handleCancel(order._id)}
                        disabled={cancelling === order._id}
                        className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 border border-red-200 rounded-lg hover:border-red-300 transition-all disabled:opacity-50"
                      >
                        {cancelling === order._id ? 'Cancelling...' : 'Cancel'}
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
    </div>
  );
};

export default OrdersPage;