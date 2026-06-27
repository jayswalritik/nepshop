import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import ProductsPage from './ProductsPage';
import CartPage from './CartPage';
import OrdersPage from './OrdersPage';
import ProfilePage from './ProfilePage';
import RoleSwitcher from '../../components/common/RoleSwitcher';
import OffersPage from './OffersPage';


const CustomerDashboard = () => {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const [activeTab, setActiveTab] = useState('shop');

  const navItems = [
    { key: 'shop',    label: 'Shop',       icon: '🏪' },
    { key: 'cart',    label: 'Cart',       icon: '🛒' },
    { key: 'orders',  label: 'My Orders',  icon: '📦' },
    { key: 'offers',  label: 'Offers',     icon: '🎟️' },
    { key: 'wishlist',label: 'Wishlist',   icon: '❤️' },
    { key: 'profile', label: 'Profile',    icon: '👤' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top navbar ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">N</div>
            <span className="font-bold text-gray-900 text-lg">Nep<span className="text-orange-500">Shop</span></span>
          </div>

          {/* Nav — desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all relative
                  ${activeTab === item.key
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <span>{item.icon}</span>
                {item.label}
                {item.key === 'cart' && cart.itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                    {cart.itemCount}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <RoleSwitcher />
            <span className="hidden md:block text-sm text-gray-500">
              Hi, {user?.firstName}
            </span>
            <button
              onClick={logout}
              className="text-sm text-red-500 hover:text-red-700 font-medium"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex border-t border-gray-100 overflow-x-auto">
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
              {item.key === 'cart' && cart.itemCount > 0 && (
                <span className="absolute top-1 right-2 w-4 h-4 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center">
                  {cart.itemCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'shop'    && <ProductsPage onGoToCart={() => setActiveTab('cart')} />}
        {activeTab === 'cart'    && <CartPage onCheckoutSuccess={() => setActiveTab('orders')} />}
        {activeTab === 'orders'  && <OrdersPage />}
        {activeTab === 'offers'  && <OffersPage />}
        {activeTab === 'wishlist' && <ComingSoon title="Wishlist" desc="Save products for later — coming soon." />}
        {activeTab === 'profile' && <ProfilePage />}
      </div>
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

export default CustomerDashboard;