import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProductList from './ProductList';
import AddProduct from './AddProduct';
import SellerOrdersPage from './OrdersPage';
import SettingsPage from './SettingsPage';
import EarningsPage from './EarningsPage';
import ReviewsPage from './ReviewsPage';

const SellerDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('products');
  const [showAddProduct, setShowAddProduct] = useState(false);

  const navItems = [
    { key: 'products',  label: 'My Products',  icon: '📦' },
    { key: 'orders',    label: 'Orders',        icon: '🧾' },
    { key: 'earnings',  label: 'Earnings',      icon: '💰' },
    { key: 'reviews',   label: 'Reviews',       icon: '⭐' },
    { key: 'settings',  label: 'Settings',      icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── Sidebar ── */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">

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
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-sm">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400">{user?.shopName}</p>
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
            </button>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="ml-64 flex-1 p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
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