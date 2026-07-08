import { useState, useRef, useEffect, useCallback } from 'react';
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
import ChatWidget from '../../components/chatbot/ChatWidget';

const MAX_HISTORY = 8;

// ── Search box with session-history dropdown ─────────────────────────────────
// Reused for both desktop and mobile so behaviour is identical in both places.
// History is in-memory (session-only) — lifted to the parent so both boxes and
// the results page share the same list; it clears when the tab/browser closes.
const SearchBox = ({
  value, onChange, onClear, onCommit,
  history, onPickSuggestion, onClearHistory,
  placeholder, idPrefix,
}) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Close the dropdown when clicking outside this box.
  useEffect(() => {
    const onDocClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Which past searches to show. Empty box → all recent. Typing → contains-match
  // (case-insensitive), excluding an exact match of what's already typed.
  const q = value.trim().toLowerCase();
  const suggestions = history
    .filter(h => {
      const hl = h.toLowerCase();
      if (!q) return true;
      return hl.includes(q) && hl !== q;
    })
    .slice(0, MAX_HISTORY);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (value.trim()) onCommit(value.trim());
      setOpen(false);
      e.target.blur();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
      <input
        type="text"
        value={value}
        onChange={onChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 bg-gray-50 focus:bg-white transition-all"
      />
      {value && (
        <button
          onClick={() => { onClear(); setOpen(false); }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs leading-none"
          title="Clear search"
        >
          ✕
        </button>
      )}

      {/* History dropdown */}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Recent searches</span>
            <button
              onMouseDown={(e) => { e.preventDefault(); onClearHistory(); }}
              className="text-[10px] text-gray-400 hover:text-red-500"
            >
              Clear
            </button>
          </div>
          {suggestions.map((h, i) => (
            <button
              key={`${idPrefix}-${i}`}
              // onMouseDown (not onClick) so it fires before the input blur closes the list
              onMouseDown={(e) => { e.preventDefault(); onPickSuggestion(h); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 flex items-center gap-2"
            >
              <span className="text-gray-300 text-xs">🕘</span>
              <span className="truncate">{h}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const CustomerDashboard = () => {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const [activeTab, setActiveTab]     = useState('home');
  const [shopCategory, setShopCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Session-only search history (most recent first). Not persisted — clears on
  // tab/browser close (no localStorage), exactly as scoped.
  const [searchHistory, setSearchHistory] = useState([]);

  const rememberSearch = useCallback((raw) => {
    const q = (raw || '').trim();
    if (!q) return;
    setSearchHistory(prev => {
      const deduped = prev.filter(h => h.toLowerCase() !== q.toLowerCase());
      return [q, ...deduped].slice(0, MAX_HISTORY);
    });
  }, []);

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

  // Called on every keystroke in the search bar (live search — unchanged)
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (val.trim()) {
      setActiveTab('search');
    } else {
      setActiveTab('shop');
    }
  };

  // Clear search and return to shop
  const handleSearchClear = () => {
    setSearchQuery('');
    setActiveTab('shop');
  };

  // Commit (Enter) → remember in history. Live results already show.
  const handleSearchCommit = (q) => {
    setSearchQuery(q);
    setActiveTab('search');
    rememberSearch(q);
  };

  // Pick a past search from the dropdown → fill, search, remember.
  const handlePickSuggestion = (q) => {
    setSearchQuery(q);
    setActiveTab('search');
    rememberSearch(q); // moves it back to the top
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top navbar ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">N</div>
            <span className="font-bold text-gray-900 text-lg whitespace-nowrap">Nep<span className="text-orange-500">Shop</span></span>
          </div>

          {/* Nav — desktop */}
          <nav className="hidden md:flex items-center gap-0.5 flex-shrink-0">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => handleNav(item.key)}
                className={`flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium transition-all relative whitespace-nowrap
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

          {/* Search bar — grows to fill space (desktop), shrinks first when tight */}
          <div className="hidden md:block flex-1 min-w-[120px] max-w-[420px]">
            <SearchBox
              value={searchQuery}
              onChange={handleSearchChange}
              onClear={handleSearchClear}
              onCommit={handleSearchCommit}
              history={searchHistory}
              onPickSuggestion={handlePickSuggestion}
              onClearHistory={() => setSearchHistory([])}
              placeholder='Search products... try "laptop under 90000" or "black shoes"'
              idPrefix="d"
            />
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3 flex-shrink-0 whitespace-nowrap">
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
        <div className="md:hidden px-4 pb-3">
          <SearchBox
            value={searchQuery}
            onChange={handleSearchChange}
            onClear={handleSearchClear}
            onCommit={handleSearchCommit}
            history={searchHistory}
            onPickSuggestion={handlePickSuggestion}
            onClearHistory={() => setSearchHistory([])}
            placeholder="Search products..."
            idPrefix="m"
          />
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

      {/* ── Chatbot ── */}
      <ChatWidget onGoToOrders={() => setActiveTab('orders')} />
      
    </div>
  );
};

export default CustomerDashboard;