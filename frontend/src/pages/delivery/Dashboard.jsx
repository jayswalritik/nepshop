import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import DeliveryProfilePage from './ProfilePage';
import RoleSwitcher from '../../components/common/RoleSwitcher';
import ReturnPickups from './ReturnPickups';

const statusColors = {
  pending:    'bg-yellow-100 text-yellow-700',
  confirmed:  'bg-blue-100 text-blue-700',
  packed:     'bg-indigo-100 text-indigo-700',
  dispatched: 'bg-purple-100 text-purple-700',
  delivered:  'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-700',
};

const round2 = (n) => +Number(n).toFixed(2);

// What the customer actually owes for THIS package — voucher-aware. Mirrors
// backend/utils/shipmentCancellation.js's exact formula (sellerSubtotal +
// deliveryCharge - couponAllocation); see backend/utils/orderAggregate.js's
// buildShipmentEmailView.customerPayable for the email-side twin of this.
const collectAmount = (shipment) =>
  round2((shipment.sellerSubtotal || 0) + (shipment.deliveryCharge || 0) - (shipment.couponAllocation || 0));

const DeliveryDashboard = () => {
  const { user, logout, updateUser } = useAuth();
  const [activeTab, setActiveTab]   = useState('active');
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [stats, setStats] = useState({
    active: 0, delivered: 0, earnings: 0, deliveryEarnings: 0, returnEarnings: 0, returnPickupCount: 0,
  });

  // Availability toggle — UI/sorting signal only (backend/models/User.js —
  // never gates assignment, deliveries, or settlements). Optimistic, with
  // reconcile-on-failure (revert + alert), same pattern used elsewhere
  // (e.g. cart selection).
  const toggleAvailability = async () => {
    const next = !user?.isAvailable;
    updateUser({ isAvailable: next });
    setAvailLoading(true);
    try {
      const { data } = await API.put('/delivery/availability', { isAvailable: next });
      updateUser({ isAvailable: data.isAvailable });
    } catch (err) {
      updateUser({ isAvailable: !next }); // revert
      alert(err.response?.data?.message || 'Failed to update availability');
    } finally {
      setAvailLoading(false);
    }
  };

  const navItems = [
    { key: 'active',    label: 'Active Deliveries', icon: '🚚' },
    { key: 'returns',   label: 'Return Pickups',    icon: '🔄' },
    { key: 'delivered', label: 'Completed',          icon: '✅' },
    { key: 'earnings',  label: 'Earnings',           icon: '💰' },
    { key: 'profile',   label: 'Profile & Payout',   icon: '👤' },
  ];

  useEffect(() => {
    fetchOrders();
  }, [activeTab]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/delivery/orders');
      const all = data.shipments;

      const active    = all.filter(o => o.status === 'dispatched');
      const delivered = all.filter(o => o.status === 'delivered');
      const deliveryEarnings = delivered.reduce((sum, o) => sum + o.deliveryEarning, 0);
      const returnEarnings   = data.returnEarnings || 0;

      setStats({
        active:    active.length,
        delivered: delivered.length,
        earnings:  deliveryEarnings + returnEarnings,
        deliveryEarnings,
        returnEarnings,
        returnPickupCount: data.returnPickupCount || 0,
      });

      if (activeTab === 'active')    setOrders(active);
      if (activeTab === 'delivered') setOrders(delivered);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async (orderId) => {
    setActionLoading(orderId);
    try {
      await API.put(`/delivery/orders/${orderId}/delivered`);
      fetchOrders();
      setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* Sidebar (desktop) */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col fixed h-full">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">N</div>
            <span className="font-bold text-gray-900">Nep<span className="text-orange-500">Shop</span></span>
            <span className="text-xs text-gray-400 ml-1">Delivery</span>
          </div>
        </div>

        {/* Agent info */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400">{user?.vehicleType}</p>
            </div>
          </div>
          <button
            onClick={toggleAvailability}
            disabled={availLoading}
            className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-60
              ${user?.isAvailable
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${user?.isAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            {availLoading ? 'Updating...' : user?.isAvailable ? 'Available' : 'Offline'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-all
                ${activeTab === item.key
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.key === 'active' && stats.active > 0 && (
                <span className="ml-auto bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {stats.active}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100 space-y-2">
          <div className="px-1">
            <RoleSwitcher openDirection="up" />
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </div>

      {/* ── Mobile header (logo + role switcher + logout) ── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-gray-200 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0">N</div>
          <span className="font-bold text-gray-900 text-sm">Nep<span className="text-orange-500">Shop</span></span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={toggleAvailability}
            disabled={availLoading}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all disabled:opacity-60 flex-shrink-0
              ${user?.isAvailable
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-500 border-gray-200'}`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${user?.isAvailable ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            {user?.isAvailable ? 'Available' : 'Offline'}
          </button>
          <RoleSwitcher openDirection="down" />
          <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0">
            Logout
          </button>
        </div>
      </div>

      {/* ── Mobile bottom tab strip ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100 flex overflow-x-auto">
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={`flex-1 min-w-fit flex flex-col items-center gap-0.5 py-2 px-3 text-xs font-medium transition-all relative
              ${activeTab === item.key
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500'}`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
            {item.key === 'active' && stats.active > 0 && (
              <span className="absolute top-1 right-2 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {stats.active}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="ml-0 md:ml-64 flex-1 p-6 pt-16 pb-20 md:pt-6 md:pb-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            {navItems.find(n => n.key === activeTab)?.label}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, {user?.firstName}
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-2xl mb-1">🚚</div>
            <div className="text-2xl font-bold text-gray-900">{stats.active}</div>
            <div className="text-sm text-gray-500">Active Deliveries</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-2xl font-bold text-green-600">{stats.delivered}</div>
            <div className="text-sm text-gray-500">Completed</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-2xl mb-1">💰</div>
            <div className="text-2xl font-bold text-indigo-600">Rs {stats.earnings}</div>
            <div className="text-sm text-gray-500">Total Earnings</div>
          </div>
        </div>

        {/* Orders */}
        {activeTab === 'profile' ? (
          <DeliveryProfilePage />
        ) : activeTab === 'returns' ? (
          <ReturnPickups />
        ) : activeTab === 'earnings' ? (
          <EarningsTab orders={orders} stats={stats} />
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">
                  {activeTab === 'active' ? '🚚' : '✅'}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {activeTab === 'active' ? 'No active deliveries' : 'No completed deliveries yet'}
                </h3>
                <p className="text-gray-500 text-sm">
                  {activeTab === 'active'
                    ? 'Orders assigned to you will appear here'
                    : 'Your completed deliveries will appear here'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <div key={order._id} className="p-5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">

                      {/* Order info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="font-mono text-sm font-bold text-gray-700">
                            #{order._id.slice(-8).toUpperCase()}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </span>
                        </div>

                        {/* Items preview */}
                        <div className="flex gap-2 mb-3">
                          {order.items.slice(0, 2).map((item, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <img src={item.image} alt={item.name}
                                className="w-8 h-8 rounded-lg object-cover border border-gray-100" />
                              <span className="text-xs text-gray-600 max-w-24 truncate">{item.name}</span>
                            </div>
                          ))}
                          {order.items.length > 2 && (
                            <span className="text-xs text-gray-400">+{order.items.length - 2} more</span>
                          )}
                        </div>

                        {/* Addresses */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-blue-50 rounded-lg p-3">
                            <p className="text-xs font-semibold text-blue-700 mb-1">📦 Pickup from</p>
                            {order.pickupAddress?.street ? (
                              <>
                                <p className="text-xs font-medium text-blue-800">{order.pickupAddress.shopName}</p>
                                <p className="text-xs text-blue-600">{order.pickupAddress.street}, {order.pickupAddress.city}</p>
                                <p className="text-xs text-blue-600">{order.pickupAddress.district}</p>
                                {order.pickupAddress.phone && (
                                  <p className="text-xs font-medium text-blue-700 mt-1">📞 {order.pickupAddress.phone}</p>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-blue-600">Contact seller for address</p>
                           )}
                          </div>
                          <div className="bg-green-50 rounded-lg p-3">
                            <p className="text-xs font-semibold text-green-700 mb-1">📍 Deliver to</p>
                            <p className="text-xs text-green-600">
                              {order.order?.deliveryAddress?.street}, {order.order?.deliveryAddress?.city}
                            </p>
                            <p className="text-xs text-green-600">{order.order?.deliveryAddress?.phone}</p>
                          </div>
                        </div>
                      </div>

                      {/* Right side */}
                      <div className="flex flex-col items-end gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          order.order?.paymentMethod === 'cash_on_delivery'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'}`}>
                          {order.order?.paymentMethod === 'cash_on_delivery' ? '💵 COD' : '✅ Prepaid'}
                        </span>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Package value</p>
                          <p className="text-sm font-bold text-gray-900">Rs {(order.sellerSubtotal + order.deliveryCharge).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Collect</p>
                          <p className={`text-sm font-bold ${order.order?.paymentMethod === 'cash_on_delivery' ? 'text-red-600' : 'text-gray-400'}`}>
                            {order.order?.paymentMethod === 'cash_on_delivery'
                              ? `Rs ${collectAmount(order).toLocaleString()}`
                              : 'Paid online'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Your earning</p>
                          <p className="text-sm font-bold text-green-600">Rs {order.deliveryEarning || 50}</p>
                        </div>
                        {order.status === 'dispatched' && (
                          <button
                            onClick={() => setSelected(order)}
                            className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-all"
                          >
                            Mark Delivered
                          </button>
                        )}
                        {order.status === 'delivered' && (
                          <span className="text-xs text-green-600 font-medium">✓ Delivered</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm delivery modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="text-4xl text-center mb-3">📦</div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
              Confirm Delivery
            </h3>
            <p className="text-sm text-gray-500 text-center mb-2">
              Order #{selected._id.slice(-8).toUpperCase()}
            </p>
            <div className="flex justify-center mb-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                selected.order?.paymentMethod === 'cash_on_delivery'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'}`}>
                {selected.order?.paymentMethod === 'cash_on_delivery' ? '💵 COD' : '✅ Prepaid'}
              </span>
            </div>
            {selected.order?.paymentMethod === 'cash_on_delivery' ? (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-center">
                <p className="text-xs text-red-600 mb-0.5">Collect from customer</p>
                <p className="text-lg font-bold text-red-700">Rs {collectAmount(selected).toLocaleString()}</p>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-center">
                <p className="text-sm font-medium text-green-700">✅ Paid online — no cash collection needed</p>
              </div>
            )}
            <div className="bg-gray-50 rounded-xl p-3 mb-5">
              <p className="text-xs font-medium text-gray-700 mb-1">Delivering to:</p>
              <p className="text-sm text-gray-900">{selected.order?.deliveryAddress?.fullName}</p>
              <p className="text-sm text-gray-500">{selected.order?.deliveryAddress?.phone}</p>
              <p className="text-sm text-gray-500">
                {selected.order?.deliveryAddress?.street}, {selected.order?.deliveryAddress?.city}
              </p>
            </div>
            <p className="text-xs text-gray-400 text-center mb-4">
              By confirming, you verify that the order has been successfully delivered to the customer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setSelected(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMarkDelivered(selected._id)}
                disabled={actionLoading === selected._id}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
              >
                {actionLoading === selected._id ? 'Confirming...' : '✓ Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Earnings tab
const EarningsTab = ({ stats }) => (
  <div className="space-y-4">
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Earnings Summary</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-green-600 mb-1">Total Earned</p>
          <p className="text-2xl font-bold text-green-700">Rs {stats.earnings}</p>
          <p className="text-xs text-green-600 mt-1">Deliveries + return pickups</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-xs text-indigo-600 mb-1">Deliveries Done</p>
          <p className="text-2xl font-bold text-indigo-700">{stats.delivered}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">🚚 From Deliveries</p>
          <p className="text-lg font-bold text-gray-800">Rs {stats.deliveryEarnings}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">🔄 From Return Pickups</p>
          <p className="text-lg font-bold text-gray-800">Rs {stats.returnEarnings}</p>
          <p className="text-xs text-gray-400 mt-1">{stats.returnPickupCount} completed pickup{stats.returnPickupCount === 1 ? '' : 's'}</p>
        </div>
      </div>
      <div className="mt-4 bg-orange-50 border border-orange-200 rounded-xl p-4">
        <p className="text-sm text-orange-700 font-medium">💡 Rs 50 per delivery, Rs 50 per return pickup</p>
        <p className="text-xs text-orange-600 mt-1">Payout requests coming in the next update</p>
      </div>
    </div>
  </div>
);

export default DeliveryDashboard;