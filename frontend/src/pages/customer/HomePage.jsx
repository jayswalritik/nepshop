/**
 * HomePage.jsx
 * (frontend/src/pages/customer/HomePage.jsx)
 *
 * The "Home" tab in the customer dashboard. Standard marketplace landing order:
 *   Hero → Shop by Category → 🏷️ Deals → ✨ For You → 🕘 Recently Viewed
 *        → 🔥 Trending → 🆕 New Arrivals
 *
 * Clicking any product opens the SAME ProductDetailModal used on the Shop tab.
 *
 * Props from CustomerDashboard:
 *   onGoToProducts fn(category?) — switch to Shop; optional category pre-filter
 *   onGoToCart     fn()          — switch to the Cart tab
 */

import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';
import RecommendationRow from '../../components/recommendations/RecommendationRow';
import { ProductDetailModal } from './ProductsPage';

// Fixed category taxonomy (matches ProductsPage). Tiles deep-link into Shop.
const CATEGORIES = [
  { name: 'Electronics',         icon: '📱' },
  { name: 'Clothing',            icon: '👕' },
  { name: 'Food & Grocery',      icon: '🛒' },
  { name: 'Home & Kitchen',      icon: '🏠' },
  { name: 'Beauty & Health',     icon: '💄' },
  { name: 'Sports & Outdoors',   icon: '⚽' },
  { name: 'Books & Stationery',  icon: '📚' },
  { name: 'Toys & Games',        icon: '🧸' },
  { name: 'Automotive',          icon: '🚗' },
  { name: 'Other',               icon: '📦' },
];

const HomePage = ({ onGoToProducts, onGoToCart }) => {
  const { addToCart } = useCart();

  const [feed, setFeed]                 = useState([]);
  const [trending, setTrending]         = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [deals, setDeals]               = useState([]);
  const [newArrivals, setNewArrivals]   = useState([]);

  const [feedLoading, setFeedLoading]     = useState(true);
  const [trendLoading, setTrendLoading]   = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);
  const [dealsLoading, setDealsLoading]   = useState(true);
  const [arrivalsLoading, setArrivalsLoading] = useState(true);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [toast, setToast]                       = useState(null);

  useEffect(() => {
    fetchFeed();
    fetchTrending();
    fetchRecentlyViewed();
    fetchDeals();
    fetchNewArrivals();
  }, []);

  const fetchFeed = async () => {
    setFeedLoading(true);
    try {
      const { data } = await API.get('/recommendations/feed?limit=16');
      setFeed(data.products || []);
    } catch (err) {
      console.error('Failed to fetch home feed:', err);
    } finally {
      setFeedLoading(false);
    }
  };

  const fetchTrending = async () => {
    setTrendLoading(true);
    try {
      const { data } = await API.get('/recommendations/trending?limit=10');
      setTrending(data.products || []);
    } catch (err) {
      console.error('Failed to fetch trending:', err);
    } finally {
      setTrendLoading(false);
    }
  };

  const fetchRecentlyViewed = async () => {
    setRecentLoading(true);
    try {
      const { data } = await API.get('/recommendations/recently-viewed?limit=10');
      setRecentlyViewed(data.products || []);
    } catch (err) {
      console.error('Failed to fetch recently viewed:', err);
    } finally {
      setRecentLoading(false);
    }
  };

  const fetchDeals = async () => {
    setDealsLoading(true);
    try {
      const { data } = await API.get('/recommendations/deals?limit=12');
      setDeals(data.products || []);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    } finally {
      setDealsLoading(false);
    }
  };

  const fetchNewArrivals = async () => {
    setArrivalsLoading(true);
    try {
      const { data } = await API.get('/recommendations/new-arrivals?limit=12');
      setNewArrivals(data.products || []);
    } catch (err) {
      console.error('Failed to fetch new arrivals:', err);
    } finally {
      setArrivalsLoading(false);
    }
  };

  const handleAddToCart = async (product) => {
    const result = await addToCart(product._id, 1);
    if (result.success) {
      setToast({ type: 'success', message: `"${product.name}" added to cart!` });
    } else {
      setToast({ type: 'error', message: result.message });
    }
    setTimeout(() => setToast(null), 3000);
  };

  // True only when EVERY data source is done and all came back empty
  const everythingEmpty =
    !feedLoading && !trendLoading && !recentLoading && !dealsLoading && !arrivalsLoading &&
    !feed.length && !trending.length && !recentlyViewed.length && !deals.length && !newArrivals.length;

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? '✅' : '⚠️'} {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 1 · Hero banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-6 mb-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-48 h-full opacity-10">
          <div className="text-9xl absolute -right-4 -top-4">🛍️</div>
        </div>
        <p className="text-indigo-200 text-xs font-medium uppercase tracking-wider mb-1">Welcome to</p>
        <h1 className="text-2xl font-bold mb-1">
          Nep<span className="text-orange-400">Shop</span>
        </h1>
        <p className="text-indigo-200 text-sm mb-4">Nepal's favourite marketplace — discover products just for you</p>
        <button
          onClick={() => onGoToProducts()}
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-5 py-2 rounded-lg transition-all shadow-md"
        >
          Browse All Products →
        </button>
      </div>

      {/* 2 · Shop by Category */}
      <div className="mb-8">
        <h2 className="text-base font-bold text-gray-900 mb-3">Shop by Category</h2>
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.name}
              onClick={() => onGoToProducts(c.name)}
              className="flex flex-col items-center justify-center gap-1.5 bg-white border border-gray-100 rounded-xl py-3 px-1 hover:border-indigo-300 hover:shadow-sm transition-all group"
            >
              <span className="text-2xl group-hover:scale-110 transition-transform">{c.icon}</span>
              <span className="text-[10px] text-gray-600 text-center leading-tight font-medium">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3 · Deals */}
      {(dealsLoading || deals.length > 0) && (
        <RecommendationRow
          title="🏷️ Deals & Offers"
          subtitle="Biggest discounts on NepShop right now"
          products={deals}
          loading={dealsLoading}
          onProduct={(p) => setSelectedProduct(p)}
          onAddToCart={handleAddToCart}
          showReason={false}
          emptyText={null}
        />
      )}

      {/* 4 · For You */}
      <RecommendationRow
        title="✨ For You"
        subtitle="Based on your shopping history"
        products={feed}
        loading={feedLoading}
        onProduct={(p) => setSelectedProduct(p)}
        onAddToCart={handleAddToCart}
        showReason={true}
        emptyText={null}
      />

      {/* 5 · Recently Viewed */}
      {(recentLoading || recentlyViewed.length > 0) && (
        <RecommendationRow
          title="🕘 Recently Viewed"
          subtitle="Pick up where you left off"
          products={recentlyViewed}
          loading={recentLoading}
          onProduct={(p) => setSelectedProduct(p)}
          onAddToCart={handleAddToCart}
          showReason={true}
          emptyText={null}
        />
      )}

      {/* 6 · Trending */}
      <RecommendationRow
        title="🔥 Trending Now"
        subtitle="Most popular on NepShop this month"
        products={trending}
        loading={trendLoading}
        onProduct={(p) => setSelectedProduct(p)}
        onAddToCart={handleAddToCart}
        showReason={false}
        emptyText="Check back soon — trending products will appear here as orders come in."
      />

      {/* 7 · New Arrivals */}
      {(arrivalsLoading || newArrivals.length > 0) && (
        <RecommendationRow
          title="🆕 New Arrivals"
          subtitle="Freshly added to the marketplace"
          products={newArrivals}
          loading={arrivalsLoading}
          onProduct={(p) => setSelectedProduct(p)}
          onAddToCart={handleAddToCart}
          showReason={false}
          emptyText={null}
        />
      )}

      {/* Absolute empty state — only when literally nothing exists */}
      {everythingEmpty && (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-12 text-center">
          <div className="text-5xl mb-4">🛒</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No products yet</h3>
          <p className="text-sm text-gray-500 mb-4">
            Browse all products or check back later as the marketplace grows.
          </p>
          <button
            onClick={() => onGoToProducts()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-all"
          >
            Browse Products
          </button>
        </div>
      )}

      {/* Product detail modal (same one used on the Shop tab) */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => { setSelectedProduct(null); fetchRecentlyViewed(); }}
          onAddToCart={(p) => { handleAddToCart(p); setSelectedProduct(null); fetchRecentlyViewed(); }}
          onGoToCart={() => { setSelectedProduct(null); onGoToCart && onGoToCart(); }}
          onOpenSimilar={(p) => setSelectedProduct(p)}
        />
      )}
    </div>
  );
};

export default HomePage;

// Modified in feature/recommendations branch