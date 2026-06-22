import { useState, useEffect } from 'react';
import API from '../../utils/api';

const statusColors = {
  pending:    'bg-yellow-100 text-yellow-700',
  confirmed:  'bg-blue-100 text-blue-700',
  packed:     'bg-indigo-100 text-indigo-700',
  dispatched: 'bg-purple-100 text-purple-700',
  delivered:  'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-700',
};

const OrderMonitoring = () => {
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('');
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]       = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [newStatus, setNewStatus]   = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [counts, setCounts] = useState({
  pending: 0, confirmed: 0, packed: 0,
  dispatched: 0, delivered: 0, cancelled: 0,
  }); 

  useEffect(() => {
    fetchOrders();
  }, [page, filter]);


  const fetchOrders = async () => {
  setLoading(true);
  try {
    const params = new URLSearchParams({ page, limit: 15 });
    if (filter) params.append('status', filter);
    const { data } = await API.get(`/admin/orders?${params}`);
    setOrders(data.orders);
    setTotalPages(data.totalPages);
    setTotal(data.total);

    // Always fetch all orders to get accurate counts
    const allData = await API.get('/admin/orders?limit=1000');
    const all = allData.data.orders;
    setAllTotal(allData.data.total);
    setCounts({
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

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    setActionLoading(true);
    try {
      await API.put(`/admin/orders/${selected._id}/status`, { status: newStatus });
      fetchOrders();
      setSelected(null);
      setNewStatus('');
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      {/* Summary stats */}
<div className="grid grid-cols-3 lg:grid-cols-7 gap-3 mb-5">
  {[
    { label: 'Total',      value: allTotal,              key: '',            color: 'bg-gray-50 border-gray-100' },
    { label: 'Pending',    value: counts.pending,     key: 'pending',     color: 'bg-yellow-50 border-yellow-100' },
    { label: 'Confirmed',  value: counts.confirmed,   key: 'confirmed',   color: 'bg-blue-50 border-blue-100' },
    { label: 'Packed',     value: counts.packed,      key: 'packed',      color: 'bg-indigo-50 border-indigo-100' },
    { label: 'Dispatched', value: counts.dispatched,  key: 'dispatched',  color: 'bg-purple-50 border-purple-100' },
    { label: 'Delivered',  value: counts.delivered,   key: 'delivered',   color: 'bg-green-50 border-green-100' },
    { label: 'Cancelled',  value: counts.cancelled,   key: 'cancelled',   color: 'bg-red-50 border-red-100' },
  ].map((s) => (
    <button
      key={s.label}
      onClick={() => { setFilter(filter === s.key ? '' : s.key); setPage(1); }}
      className={`border rounded-xl p-3 text-left transition-all ${s.color}
        ${filter === s.key ? 'ring-2 ring-indigo-400 ring-offset-1' : 'hover:shadow-sm'}`}
    >
      <div className="text-lg font-bold text-gray-900">{s.value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
    </button>
  ))}
</div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filter ? `Showing ${filter} orders` : 'Showing all orders'}
          <span className="ml-2 font-medium text-gray-700">({total})</span>
        </p>
        {filter && (
          <button
            onClick={() => { setFilter(''); setPage(1); }}
            className="text-sm text-indigo-600 hover:underline font-medium"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* Orders table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">🧾</div>
            <p className="font-medium">No orders found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Order ID', 'Customer', 'Seller', 'Items', 'Total', 'Payment', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4">
                      <span className="font-mono text-sm font-medium text-gray-700">
                        #{order._id.slice(-8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {order.customer?.firstName} {order.customer?.lastName}
                      </p>
                      <p className="text-xs text-gray-400">{order.customer?.phone}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-700">
                        {order.items[0]?.seller?.shopName || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex -space-x-2">
                        {order.items.slice(0, 3).map((item, i) => (
                          <img key={i} src={item.image} alt=""
                            className="w-7 h-7 rounded-full border-2 border-white object-cover" />
                        ))}
                        {order.items.length > 3 && (
                          <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                            +{order.items.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-gray-900">Rs {order.total.toLocaleString()}</p>
                      <p className="text-xs text-orange-500">Fee: Rs {order.commissionAmount}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                        {order.paymentMethod.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleDateString('en-NP', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => { setSelected(order); setNewStatus(order.status); }}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Order management modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-screen overflow-y-auto">

            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-bold text-gray-900">
                  Order #{selected._id.slice(-8).toUpperCase()}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(selected.createdAt).toLocaleDateString('en-NP', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Customer */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</p>
              <p className="text-sm font-medium text-gray-900">
                {selected.customer?.firstName} {selected.customer?.lastName}
              </p>
              <p className="text-sm text-gray-500">{selected.customer?.email}</p>
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
            </div>

            {/* Items */}
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

            {/* Financial summary */}
            <div className="bg-indigo-50 rounded-xl p-4 mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold">Rs {selected.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Commission ({selected.commissionRate}%)</span>
                <span className="text-orange-600">Rs {selected.commissionAmount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery charge</span>
                <span>{selected.deliveryCharge === 0 ? 'FREE' : `Rs ${selected.deliveryCharge}`}</span>
              </div>
            </div>

            {/* Admin status override */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Override Status (Admin)
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                <p className="text-xs text-yellow-700">
                  ⚠️ Admin override bypasses normal status flow. Customer will be notified by email.
                </p>
              </div>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white mb-3"
              >
                {['pending', 'confirmed', 'packed', 'dispatched', 'delivered', 'cancelled'].map(s => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                    {s === selected.status ? ' (current)' : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={handleStatusUpdate}
                disabled={actionLoading || newStatus === selected.status}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition-all"
              >
                {actionLoading ? 'Updating...' : '⚡ Override Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderMonitoring;