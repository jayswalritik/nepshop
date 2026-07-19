import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProductList from './ProductList';
import AddProduct from './AddProduct';
import SellerOrdersPage from './OrdersPage';
import SettingsPage from './SettingsPage';
import EarningsPage from './EarningsPage';
import ReviewsPage from './ReviewsPage';
import RoleSwitcher from '../../components/common/RoleSwitcher';
import NotificationsPage from '../../components/NotificationsPage';
import NotificationBell from '../../components/NotificationBell';
import UnreadBadge from '../../components/UnreadBadge';
import { useNotifications } from '../../hooks/useNotifications';

const SellerDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('products');
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Single poller for this whole dashboard instance — the nav-tab badge,
  // the mobile-header bell badge, and NotificationsPage all read from this
  // one useNotifications() call. Do not call the hook again anywhere else
  // in this component tree, or the 45s poll duplicates.
  const notif = useNotifications();

  // Orders/returns/earnings-released/payout notifications all carry an
  // orderId and belong on the Orders tab (returns show inline there too, no
  // separate seller returns view); a new-review notification carries only a
  // productId and belongs on Reviews. Payout-only notifications (no ids) are
  // a no-op — nothing to jump to.
  const handleNotificationNavigate = ({ type, data }) => {
    // Checked first: PAYOUT_PROCESSED/EARNINGS_RELEASED carry no orderId/
    // returnId/productId, so the data-field rules below would never match
    // them — this type rule is what actually routes them anywhere.
    if (type === 'PAYOUT_PROCESSED' || type === 'EARNINGS_RELEASED') { setActiveTab('earnings'); return; }
    if (data?.orderId || data?.returnId) { setActiveTab('orders'); return; }
    if (data?.productId) { setActiveTab('reviews'); return; }
  };

  const navItems = [
    { key: 'products',      label: 'My Products',   icon: '📦' },
    { key: 'orders',        label: 'Orders',         icon: '🧾' },
    { key: 'earnings',      label: 'Earnings',       icon: '💰' },
    { key: 'reviews',       label: 'Reviews',        icon: '⭐' },
    { key: 'notifications', label: 'Notifications',  icon: '🔔' },
    { key: 'settings',      label: 'Settings',       icon: '⚙️' },
  ];

  // The mobile bottom tab strip is this dashboard's primary mobile nav
  // today (every existing tab is on it) — Notifications is deliberately
  // left off it per this task's scope (mobile keeps only the header bell,
  // which jumps to the tab). See summary for why.
  const mobileStripItems = navItems.filter((i) => i.key !== 'notifications');

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Sidebar (desktop) ── */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col fixed h-full">

        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">N</div>
            <span className="font-bold text-gray-900">Nep<span className="text-orange-500">Shop</span></span>
            <span className="text-xs text-gray-400 ml-1">Seller</span>
          </div>
        </div>

        {/* Seller info */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400 truncate">{user?.shopName}</p>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => { setActiveTab(item.key); setShowAddProduct(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 transition-all
                ${activeTab === item.key
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.key === 'orders' && (
                <span className="ml-auto bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">New</span>
              )}
              {item.key === 'notifications' && (
                <UnreadBadge count={notif.unreadCount} className="ml-auto min-w-[20px] h-5 px-1.5 text-xs" />
              )}
            </button>
          ))}
        </nav>

        {/* Role switcher + Logout */}
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

      {/* ── Mobile header (logo + notifications bell + role switcher + logout) ── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-gray-200 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0">N</div>
          <span className="font-bold text-gray-900 text-sm truncate">Nep<span className="text-orange-500">Shop</span></span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <NotificationBell notif={notif} onNavigate={handleNotificationNavigate} />
          <RoleSwitcher openDirection="down" />
          <button onClick={logout} className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0">
            Logout
          </button>
        </div>
      </div>

      {/* ── Mobile bottom tab strip ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-100 flex overflow-x-auto">
        {mobileStripItems.map((item) => (
          <button
            key={item.key}
            onClick={() => { setActiveTab(item.key); setShowAddProduct(false); }}
            className={`flex-1 min-w-fit flex flex-col items-center gap-0.5 py-2 px-3 text-xs font-medium transition-all relative
              ${activeTab === item.key
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500'}`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
            {item.key === 'orders' && (
              <span className="absolute top-1 right-2 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">New</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Main content ── */}
      <div className="ml-0 md:ml-64 flex-1 p-6 pt-16 pb-20 md:pt-6 md:pb-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {showAddProduct ? 'Add New Product' : navItems.find(n => n.key === activeTab)?.label}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {showAddProduct ? 'Fill in the details below to list a new product'
                : activeTab === 'products' ? 'Manage your product listings'
                : activeTab === 'orders' ? 'View and process customer orders'
                : activeTab === 'earnings' ? 'Track your sales and earnings'
                : activeTab === 'reviews' ? 'See what customers are saying'
                : activeTab === 'notifications' ? 'Updates on your orders, returns, and reviews'
                : 'Manage your shop settings'}
            </p>
          </div>
          {activeTab === 'products' && !showAddProduct && (
            <button
              onClick={() => setShowAddProduct(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all flex items-center gap-2"
            >
              <span>+</span> Add Product
            </button>
          )}
          {showAddProduct && (
            <button
              onClick={() => setShowAddProduct(false)}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all"
            >
              ← Back to Products
            </button>
          )}
        </div>

        {/* Content */}
        {activeTab === 'products' && !showAddProduct && (
          <ProductList onAddProduct={() => setShowAddProduct(true)} />
        )}
        {activeTab === 'products' && showAddProduct && (
          <AddProduct onSuccess={() => setShowAddProduct(false)} />
        )}
        {activeTab === 'orders' && <SellerOrdersPage />}
        {activeTab === 'earnings' && <EarningsPage />}
        {activeTab === 'reviews' && <ReviewsPage />}
        {activeTab === 'notifications' && <NotificationsPage {...notif} onNavigate={handleNotificationNavigate} />}
        {activeTab === 'settings' && <SettingsPage />}
      </div>
    </div>
  );
};

// Placeholder for tabs not yet built
const ComingSoon = ({ title, desc }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
    <div className="text-4xl mb-3">🔨</div>
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title} — Coming Soon</h3>
    <p className="text-gray-500 text-sm">{desc}</p>
  </div>
);

export default SellerDashboard;