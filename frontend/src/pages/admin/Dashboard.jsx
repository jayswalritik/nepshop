import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import UserManagement from './UserManagement';
import OrderMonitoring from './OrderMonitoring';
import CommissionManagement from './CommissionManagement';
import ReturnsManagement from './ReturnsManagement';
import RoleRequests from './RoleRequests';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const navItems = [
    { key: 'overview',  label: 'Overview',        icon: '📊' },
    { key: 'users',     label: 'User Management', icon: '👥' },
    { key: 'requests',  label: 'Role Requests',   icon: '📋' },
    { key: 'orders',    label: 'Order Monitoring', icon: '🧾' },
    { key: 'commission',label: 'Commission',       icon: '💰' },
    { key: 'returns',   label: 'Returns',          icon: '🔄' },
  ];


  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/stats');
      setStats(data.stats);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">N</div>
            <span className="font-bold text-gray-900">Nep<span className="text-orange-500">Shop</span></span>
            <span className="text-xs text-gray-400 ml-1">Admin</span>
          </div>
        </div>

        {/* Admin info */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400">Super Admin</p>
            </div>
          </div>
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
              {item.key === 'users' && stats?.pendingApprovals > 0 && (
                <span className="ml-auto bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                  {stats.pendingApprovals}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64 flex-1 p-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            {navItems.find(n => n.key === activeTab)?.label}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeTab === 'overview'   && 'Platform overview and key metrics'}
            {activeTab === 'users'      && 'Manage all users, sellers and delivery agents'}
            {activeTab === 'orders'     && 'Monitor all orders across the platform'}
            {activeTab === 'commission' && 'Track and manage platform commission'}
            {activeTab === 'returns'    && 'Review and process customer return requests'}
            {activeTab === 'requests'  && 'Review customer applications to become sellers or delivery agents'}
          </p>
        </div>

        {/* Content */}
        {activeTab === 'overview'   && <OverviewTab stats={stats} loading={loading} onRefresh={fetchStats} />}
        {activeTab === 'users'      && <UserManagement />}
        {activeTab === 'orders'     && <OrderMonitoring />}
        {activeTab === 'commission' && <CommissionManagement />}
        {activeTab === 'returns' && <ReturnsManagement />}
        {activeTab === 'requests' && <RoleRequests />}
      </div>
    </div>
  );
};

// ── Overview Tab ──────────────────────────────────────────
const OverviewTab = ({ stats, loading, onRefresh }) => {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  const statCards = [
    { label: 'Total Users',       value: stats?.totalUsers,       icon: '👥', color: 'bg-blue-50 border-blue-100',    text: 'text-blue-700' },
    { label: 'Customers',         value: stats?.totalCustomers,   icon: '🛍️', color: 'bg-indigo-50 border-indigo-100', text: 'text-indigo-700' },
    { label: 'Sellers',           value: stats?.totalSellers,     icon: '🏪', color: 'bg-green-50 border-green-100',   text: 'text-green-700' },
    { label: 'Delivery Agents',   value: stats?.totalDelivery,    icon: '🚚', color: 'bg-orange-50 border-orange-100', text: 'text-orange-700' },
    { label: 'Pending Approvals', value: stats?.pendingApprovals, icon: '⏳', color: 'bg-yellow-50 border-yellow-100', text: 'text-yellow-700' },
    { label: 'Total Products',    value: stats?.totalProducts,    icon: '📦', color: 'bg-purple-50 border-purple-100', text: 'text-purple-700' },
    { label: 'Total Orders',      value: stats?.totalOrders,      icon: '🧾', color: 'bg-pink-50 border-pink-100',     text: 'text-pink-700' },
    { label: 'Delivered Orders',  value: stats?.deliveredOrders,  icon: '✅', color: 'bg-green-50 border-green-100',   text: 'text-green-700' },
  ];

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className={`border rounded-xl p-5 ${s.color}`}>
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className={`text-2xl font-bold ${s.text}`}>{s.value ?? 0}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Revenue cards */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
  <p className="text-sm text-gray-400 mb-1">Confirmed Revenue</p>
  <p className="text-3xl font-bold text-gray-900">
    Rs {stats?.totalRevenue?.toLocaleString() || 0}
  </p>
  <p className="text-xs text-green-500 mt-1">✅ From delivered orders only</p>
</div>
<div className="bg-white border border-gray-200 rounded-xl p-6">
  <p className="text-sm text-gray-400 mb-1">Commission Earned</p>
  <p className="text-3xl font-bold text-green-600">
    Rs {stats?.totalCommission?.toLocaleString() || 0}
  </p>
  <p className="text-xs text-green-500 mt-1">✅ From delivered orders only</p>
</div>

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
      >
        🔄 Refresh stats
      </button>
    </div>
  );
};

const ComingSoon = ({ title, desc }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
    <div className="text-4xl mb-3">🔨</div>
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title} — Coming Soon</h3>
    <p className="text-gray-500 text-sm">{desc}</p>
  </div>
);

export default AdminDashboard;