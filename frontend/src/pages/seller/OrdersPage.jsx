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

const nextStatus = {
  pending:   { label: '✓ Confirm Order',   value: 'confirmed' },
  confirmed: { label: '📦 Mark as Packed', value: 'packed' },
  packed:    { label: '🚚 Dispatch Order', value: 'dispatched' },
};

const SellerOrdersPage = () => {
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [selected, setSelected] = useState(null);
  const [agents, setAgents]     = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [stats, setStats] = useState({
    pending: 0, confirmed: 0, packed: 0,
    dispatched: 0, delivered: 0, cancelled: 0,
  });

  useEffect(() => {
    fetchOrders();
    fetchAgents();
  }, [filter]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 20 });
      if (filter) params.append('status', filter);
      const { data } = await API.get(`/orders/seller?${params}`);
      setOrders(data.orders);

      // Calculate stats from all orders (fetch without filter for stats)
      const allData = await API.get('/orders/seller?limit=100');
      const all = allData.data.orders;
      setStats({
        pending:    all.filter(o => o.status === 'pending').length,
        confirmed:  all.filter(o => o.status === 'confirmed').length,
        packed:     all.filter(o => o.status === 'packed').length,
        dispatched: all.filter(o => o.status === 'dispatched').length,
        delivered:  all.filter(o => o.status === 'delivered').length,
        cancelled:  all.filter(o => o.status === 'cancelled').length,
      });
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
        const { data } = await API.get('/admin/delivery-agents');
        setAgents(data.agents);
        
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  const handleUpdateStatus = async (orderId, status) => {
    setActionLoading(orderId);
    try {
      const body = { status };
      if (status === 'dispatched' && selectedAgent) {
        body.deliveryAgentId = selectedAgent;
      }
      await API.put(`/orders/${orderId}/status`, body);
      fetchOrders();
      setSelected(null);
      setSelectedAgent('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    setActionLoading(orderId);
    try {
      await API.put(`/orders/${orderId}/status`, { status: 'cancelled' });
      fetchOrders();
      setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel order');
    } finally {
      setActionLoading(null);
    }
  };

  const statCards = [
    { key: 'pending',    label: 'Pending',    icon: '⏳', color: 'bg-yellow-50 border-yellow-100 text-yellow-700' },
    { key: 'confirmed',  label: 'Confirmed',  icon: '✅', color: 'bg-blue-50 border-blue-100 text-blue-700' },
    { key: 'packed',     label: 'Packed',     icon: '📦', color: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
    { key: 'dispatched', label: 'Dispatched', icon: '🚚', color: 'bg-purple-50 border-purple-100 text-purple-700' },
    { key: 'delivered',  label: 'Delivered',  icon: '🎉', color: 'bg-green-50 border-green-100 text-green-700' },
    { key: 'cancelled',  label: 'Cancelled',  icon: '❌', color: 'bg-red-50 border-red-100 text-red-700' },
  ];

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {statCards.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(filter === s.key ? '' : s.key)}
            className={`border rounded-xl p-3 text-left transition-all
              ${s.color}
              ${filter === s.key ? 'ring-2 ring-indigo-400 ring-offset-1' : 'hover:shadow-sm'}`}
          >
            <div className="text-xl mb-1">{s.icon}</div>
            <div className="text-xl font-bold">{stats[s.key]}</div>
            <div className="text-xs mt-0.5 opacity-75">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filter
            ? `Showing ${filter} orders`
            : 'Showing all orders'}
          <span className="ml-2 font-medium text-gray-700">({orders.length})</span>
        </p>
        {filter && (
          <button
            onClick={() => setFilter('')}
            className="text-sm text-indigo-600 hover:underline font-medium"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Orders list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📋</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No orders yet</h3>
            <p className="text-gray-500 text-sm">Orders from customers will appear here</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Order ID', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order._id} className="hover:bg-gray-50 transition-colors">
                  {/* Order ID */}
                  <td className="px-4 py-4">
                    <span className="font-mono text-sm font-medium text-gray-700">
                      #{order._id.slice(-8).toUpperCase()}
                    </span>
                  </td>

                  {/* Customer */}
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {order.customer?.firstName} {order.customer?.lastName}
                    </p>
                    <p className="text-xs text-gray-400">{order.customer?.phone}</p>
                  </td>

                  {/* Items */}
                  <td className="px-4 py-4">
                    <div className="flex -space-x-2">
                      {order.items.slice(0, 3).map((item, i) => (
                        <img
                          key={i}
                          src={item.image}
                          alt={item.name}
                          className="w-8 h-8 rounded-full border-2 border-white object-cover"
                        />
                      ))}
                      {order.items.length > 3 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                          +{order.items.length - 3}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {order.items.length} item{order.items.length > 1 ? 's' : ''}
                    </p>
                  </td>

                  {/* Total */}
                  <td className="px-4 py-4">
                    <p className="text-sm font-semibold text-gray-900">
                      Rs {order.total.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">
                      Commission: Rs {order.commissionAmount}
                    </p>
                  </td>

                  {/* Payment */}
                  <td className="px-4 py-4">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                      {order.paymentMethod.replace(/_/g, ' ')}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                  </td>

                  {/* Date */}
                  <td className="px-4 py-4 text-xs text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString('en-NP', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4">
                    <button
                      onClick={() => { setSelected(order); setSelectedAgent(''); }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Order management modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-screen overflow-y-auto">

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-gray-900">
                  Order #{selected._id.slice(-8).toUpperCase()}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(selected.createdAt).toLocaleDateString('en-NP', {
                    day: 'numeric', month: 'long', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Customer info */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</p>
              <p className="text-sm font-medium text-gray-900">
                {selected.customer?.firstName} {selected.customer?.lastName}
              </p>
              <p className="text-sm text-gray-500">{selected.customer?.phone}</p>
            </div>

            {/* Delivery address */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Delivery Address</p>
              <p className="text-sm text-gray-700">{selected.deliveryAddress.fullName}</p>
              <p className="text-sm text-gray-500">{selected.deliveryAddress.phone}</p>
              <p className="text-sm text-gray-500">
                {selected.deliveryAddress.street}, {selected.deliveryAddress.city}, {selected.deliveryAddress.district}
              </p>
              {selected.deliveryAddress.landmark && (
                <p className="text-xs text-gray-400 mt-1">Near: {selected.deliveryAddress.landmark}</p>
              )}
            </div>

            {/* Order items */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Items</p>
              <div className="space-y-2">
                {selected.items.map((item, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <img src={item.image} alt={item.name}
                      className="w-12 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold">
                      Rs {(item.price * item.quantity).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-indigo-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Subtotal</span>
                <span>Rs {selected.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Delivery</span>
                <span>{selected.deliveryCharge === 0 ? 'FREE' : `Rs ${selected.deliveryCharge}`}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">Commission ({selected.commissionRate}%)</span>
                <span className="text-red-500">- Rs {selected.commissionAmount}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-indigo-100 pt-2">
                <span>Your earnings</span>
                <span className="text-green-600">
                  Rs {(selected.total - selected.commissionAmount).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Customer note */}
            {selected.customerNote && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-semibold text-yellow-700 mb-1">Customer Note</p>
                <p className="text-sm text-yellow-800 italic">{selected.customerNote}</p>
              </div>
            )}

            {/* Current status */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-gray-500">Current status:</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selected.status]}`}>
                {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
              </span>
            </div>

            {/* Delivery agent selector — only when dispatching */}
            {selected.status === 'packed' && agents.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assign Delivery Agent (optional)
                </label>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
                >
                  <option value="">Select agent</option>
                  {agents.map((agent) => (
                    <option key={agent._id} value={agent._id}>
                      {agent.firstName} {agent.lastName} — {agent.vehicleType}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {nextStatus[selected.status] && (
                <button
                  onClick={() => handleUpdateStatus(selected._id, nextStatus[selected.status].value)}
                  disabled={actionLoading === selected._id}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition-all"
                >
                  {actionLoading === selected._id ? 'Updating...' : nextStatus[selected.status].label}
                </button>
              )}
              {['pending', 'confirmed'].includes(selected.status) && (
                <button
                  onClick={() => handleReject(selected._id)}
                  disabled={actionLoading === selected._id}
                  className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-xl text-sm transition-all disabled:opacity-50"
                >
                  Cancel Order
                </button>
              )}
              {!nextStatus[selected.status] && selected.status !== 'pending' && selected.status !== 'confirmed' && (
                <p className="text-sm text-gray-400 text-center flex-1 py-2">
                  No further actions available
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerOrdersPage;