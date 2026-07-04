import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import HomePage from './HomePage';
import SearchPage from './SearchPage';
import ProductsPage from './ProductsPage';
import CartPage from './CartPage';
import OrdersPage from './OrdersPage';
import ProfilePage from './ProfilePage';
import RoleSwitcher from '../../components/common/RoleSwitcher';
import OffersPage from './OffersPage';
import WishlistPage from './WishlistPage';

const CustomerDashboard = () => {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const [activeTab, setActiveTab]     = useState('home');
  const [shopCategory, setShopCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Navigate to Shop, optionally pre-filtered to a category
  const goToShop = (category = '') => {
    setShopCategory(category);
    setSearchQuery('');
    setActiveTab('shop');
  };

  const navItems = [
    { key: 'home',     label: 'Home',      icon: '🏠' },
    { key: 'shop',     label: 'Shop',      icon: '🏪' },
    { key: 'cart',     label: 'Cart',      icon: '🛒' },
    { key: 'orders',   label: 'My Orders', icon: '📦' },
    { key: 'offers',   label: 'Offers',    icon: '🎟️' },
    { key: 'wishlist', label: 'Wishlist',  icon: '❤️' },
    { key: 'profile',  label: 'Profile',   icon: '👤' },
  ];

  const handleNav = (key) => {
    if (key === 'shop') setShopCategory('');
    if (key !== 'search') setSearchQuery('');
    setActiveTab(key);
  };

  // Called on every keystroke in the search bar
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim()) {
      setActiveTab('search');
    } else {
      // Cleared completely → back to shop
      setActiveTab('shop');
    }
  };

  // Clear search and return to shop
  const handleSearchClear = () => {
    setSearchQuery('');
    setActiveTab('shop');
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top navbar ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">N</div>
            <span className="font-bold text-gray-900 text-lg hidden sm:block">Nep<span className="text-orange-500">Shop</span></span>
          </div>

          {/* Nav — desktop */}
          <nav className="hidden md:flex items-center gap-1 flex-shrink-0">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleNav(item.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all relative
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

          {/* Search bar — grows to fill space */}
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder='Search products... try "laptop under 90000" or "black shoes"'
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-gray-50 focus:bg-white transition-all"
            />
            {/* Clear button — only when there's text */}
            {searchQuery && (
              <button
                onClick={handleSearchClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs leading-none"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <RoleSwitcher />
            <span className="hidden lg:block text-sm text-gray-500">
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
              onClick={() => handleNav(item.key)}
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

        {/* Mobile search bar — below nav on mobile */}
        <div className="md:hidden px-4 pb-3 relative">
          <span className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search products..."
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-gray-50"
          />
          {searchQuery && (
            <button
              onClick={handleSearchClear}
              className="absolute right-7 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'home'     && <HomePage onGoToProducts={goToShop} onGoToCart={() => setActiveTab('cart')} />}
        {activeTab === 'shop'     && <ProductsPage initialCategory={shopCategory} onGoToCart={() => setActiveTab('cart')} />}
        {activeTab === 'search'   && <SearchPage initialQuery={searchQuery} onGoToCart={() => setActiveTab('cart')} />}
        {activeTab === 'cart'     && <CartPage onCheckoutSuccess={() => setActiveTab('orders')} />}
        {activeTab === 'orders'   && <OrdersPage />}
        {activeTab === 'offers'   && <OffersPage />}
        {activeTab === 'wishlist' && <WishlistPage onGoToShop={() => goToShop()} />}
        {activeTab === 'profile'  && <ProfilePage />}
      </div>
    </div>
  );
};

export default CustomerDashboard;

// Modified in feature/search branch