/**
 * SearchPage.jsx
 * frontend/src/pages/customer/SearchPage.jsx
 *
 * Smart search results page. The search query comes from the navbar search bar
 * in CustomerDashboard — this page just displays results for whatever query
 * is passed via the `initialQuery` prop. It reacts live as the prop changes
 * (each keystroke in the navbar triggers a new search after debounce).
 *
 * STABILITY FIX: debounced searches could return OUT OF ORDER — a response for
 * "gaming" arriving after "gaming laptop" would overwrite the correct results
 * with partial-word ones. Each request is now tagged with the query it was for,
 * and stale responses (not matching the latest query) are ignored.
 *
 * Props:
 *   initialQuery  string  — current search string from the navbar
 *   onGoToCart    fn      — navigate to cart tab
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';

// ── Understanding Card ────────────────────────────────────────────────────────
const UnderstandingCard = ({ understanding, removedChips, onRemoveChip }) => {
  if (!understanding || !understanding.points?.length) return null;

  const isRemoved = (chip) =>
    removedChips.some(c => c.type === chip.type && c.value === chip.value);

  return (
    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🧠</span>
        <span className="text-sm font-semibold text-indigo-800">We understood your search</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {understanding.points.map((pt, i) => (
          <span key={i} className="flex items-center gap-1 text-xs text-indigo-700 bg-white border border-indigo-100 px-2.5 py-1 rounded-full">
            <span>{pt.icon}</span>
            <span>{pt.text}</span>
          </span>
        ))}
      </div>

      {understanding.chips?.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs text-indigo-400 self-center">Refine:</span>
          {understanding.chips.map((chip, i) => {
            const removed = isRemoved(chip);
            return (
              <button
                key={i}
                onClick={() => onRemoveChip && onRemoveChip(chip)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-all group
                  ${removed
                    ? 'text-gray-400 bg-gray-100 line-through'
                    : 'text-indigo-700 bg-indigo-100 hover:bg-indigo-200'}`}
                title={removed ? 'Click to re-apply this filter' : 'Click to relax this filter'}
              >
                <span>{chip.label}</span>
                <span className="opacity-50 group-hover:opacity-100 ml-0.5">{removed ? '↻' : '✕'}</span>
              </button>
            );
          })}
        </div>
      )}

      {understanding.wasSpellFixed && (
        <p className="text-xs text-indigo-400 mt-2">
          Showing results for{' '}
          <span className="font-medium text-indigo-600">"{understanding.query}"</span>
          {' '}(corrected from "{understanding.originalQuery}")
        </p>
      )}
    </div>
  );
};

// ── Product Card ──────────────────────────────────────────────────────────────
const SearchProductCard = ({ product, rank, onAddToCart, onOpenModal }) => {
  const { isWished, toggleWish } = useWishlist();
  const [adding, setAdding] = useState(false);

  const displayPrice = product.discount > 0
    ? Math.round(product.price * (1 - product.discount / 100))
    : product.price;

  const handleAdd = async (e) => {
    e.stopPropagation();
    setAdding(true);
    await onAddToCart(product);
    setAdding(false);
  };

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-all group cursor-pointer"
      onClick={() => onOpenModal && onOpenModal(product)}
    >
      <div className="relative overflow-hidden">
        <img
          src={product.images?.[0]?.url}
          alt={product.name}
          className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {product.discount > 0 && (
          <span className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {product.discount}% OFF
          </span>
        )}
        {product.stock <= 5 && product.stock > 0 && (
          <span className="absolute bottom-2 left-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
            Only {product.stock} left
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); toggleWish(product._id); }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-sm transition-all"
        >
          <span className={`text-base leading-none ${isWished(product._id) ? 'text-red-500' : 'text-gray-300'}`}>
            {isWished(product._id) ? '♥' : '♡'}
          </span>
        </button>
      </div>

      <div className="p-3">
        {/* Explain-why — top 4 only */}
        {product._reason && rank <= 4 && (
          <span className="text-[10px] text-indigo-500 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-full block mb-1.5 truncate">
            {product._reason}
          </span>
        )}

        <p className="text-xs font-semibold text-gray-800 leading-tight mb-1 line-clamp-2">
          {product.name}
        </p>

        <p className="text-[10px] text-gray-400 mb-1">{product.category}</p>

        <div className="flex items-center gap-1 mb-1.5 h-3">
          {product.rating > 0 ? (
            <>
              <span className="text-yellow-400 text-[10px]">★</span>
              <span className="text-[10px] text-gray-500">{product.rating.toFixed(1)}</span>
            </>
          ) : (
            <span className="text-[10px] text-gray-300">No reviews</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm font-bold text-gray-900">Rs {displayPrice.toLocaleString()}</span>
          {product.discount > 0 && (
            <span className="text-[10px] text-gray-400 line-through">Rs {product.price.toLocaleString()}</span>
          )}
        </div>

        <button
          onClick={handleAdd}
          disabled={adding || product.stock === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded-lg transition-all"
        >
          {adding ? '...' : product.stock === 0 ? 'Out of stock' : '+ Cart'}
        </button>
      </div>
    </div>
  );
};

// ── Main SearchPage ───────────────────────────────────────────────────────────
const SearchPage = ({ initialQuery = '', onGoToCart }) => {
  const { addToCart } = useCart();

  const [results, setResults]           = useState([]);
  const [rescue, setRescue]             = useState([]);
  const [understanding, setUnderstanding] = useState(null);
  const [intent, setIntent]             = useState(null);
  const [loading, setLoading]           = useState(false);
  const [totalFound, setTotalFound]     = useState(0);
  const [toast, setToast]               = useState(null);
  const [removedChips, setRemovedChips] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Tracks the most recent query we care about. Any response whose query does
  // not match this ref is stale (a slower earlier request) and is discarded.
  const latestQueryRef = useRef('');

  const runSearch = useCallback(async (q) => {
    latestQueryRef.current = q;      // this is now the query we care about
    setLoading(true);
    setRemovedChips([]);
    try {
      const { data } = await API.get(`/search?q=${encodeURIComponent(q)}&limit=20`);
      // Ignore this response if a newer query has since been issued.
      if (latestQueryRef.current !== q) return;
      setResults(data.products || []);
      setRescue(data.rescue || []);
      setTotalFound(data.totalFound || 0);
      setUnderstanding(data.understanding);
      setIntent(data.intent);
    } catch (err) {
      if (latestQueryRef.current !== q) return; // stale error, ignore
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      // Only clear loading if this is still the active query.
      if (latestQueryRef.current === q) setLoading(false);
    }
  }, []);

  // ── Search whenever the navbar query changes (debounced) ──────────────────
  useEffect(() => {
    const q = initialQuery.trim();
    if (!q) {
      latestQueryRef.current = '';
      setResults([]);
      setUnderstanding(null);
      setIntent(null);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(q);
    }, 350);

    return () => clearTimeout(timer);
  }, [initialQuery, runSearch]);

  const handleAddToCart = async (product) => {
    const result = await addToCart(product._id, 1);
    if (result.success) {
      setToast({ type: 'success', message: `"${product.name}" added to cart!` });
      if (onGoToCart) setTimeout(onGoToCart, 1200);
    } else {
      setToast({ type: 'error', message: result.message });
    }
    setTimeout(() => setToast(null), 3000);
  };

  // Toggle a chip in/out of the removed set (re-clickable).
  const handleRemoveChip = (chip) => {
    setRemovedChips(prev => {
      const exists = prev.some(c => c.type === chip.type && c.value === chip.value);
      return exists
        ? prev.filter(c => !(c.type === chip.type && c.value === chip.value))
        : [...prev, chip];
    });
  };

  // The backend already returns the correct, ranked products. The ONLY optional
  // client-side filtering is EXCLUSION: if the user clicks a chip to relax a
  // constraint, drop products that only matched because of that constraint.
  const displayResults = results.filter(p => {
    for (const chip of removedChips) {
      if (chip.type === 'category' && p.category === chip.value) return false;
      if (chip.type === 'color') {
        const text = `${p.name} ${p.description || ''}`.toLowerCase();
        if (text.includes(String(chip.value).toLowerCase())) return false;
      }
    }
    return true;
  });

  const showRescue = !loading && results.length === 0 && rescue.length > 0;

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <div className="h-20 bg-indigo-50 border border-indigo-100 rounded-xl mb-5 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
              <div className="w-full h-48 bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
                <div className="h-8 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Understanding card */}
      <UnderstandingCard
        understanding={understanding}
        removedChips={removedChips}
        onRemoveChip={handleRemoveChip}
      />

      {/* Result count */}
      {displayResults.length > 0 && (
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-semibold text-gray-800">{displayResults.length}</span> result{displayResults.length !== 1 ? 's' : ''} for{' '}
          <span className="text-indigo-600 font-medium">"{intent?.corrected || initialQuery}"</span>
        </p>
      )}

      {/* Results grid */}
      {displayResults.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayResults.map((product, i) => (
            <SearchProductCard
              key={product._id}
              product={product}
              rank={i + 1}
              onAddToCart={handleAddToCart}
              onOpenModal={setSelectedProduct}
            />
          ))}
        </div>
      ) : !showRescue ? (
        /* Zero results, no rescue either */
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 text-sm">
            No results for <span className="font-medium">"{intent?.corrected || initialQuery}"</span>
          </p>
          <p className="text-gray-400 text-xs mt-2">Try different keywords or clear the search to browse all products</p>
        </div>
      ) : null}

      {/* Zero-result rescue */}
      {showRescue && (
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center mb-6">
            <div className="text-4xl mb-3">🔍</div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No exact matches</h3>
            <p className="text-gray-500 text-sm">
              No results for <span className="font-medium">"{intent?.corrected || initialQuery}"</span>
            </p>
            <p className="text-gray-400 text-xs mt-1">Clear the search bar to browse all products</p>
          </div>

          <p className="text-sm font-semibold text-gray-700 mb-4">💡 You might like these instead</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {rescue.map((product, i) => (
              <SearchProductCard
                key={product._id}
                product={product}
                rank={99}
                onAddToCart={handleAddToCart}
                onOpenModal={setSelectedProduct}
              />
            ))}
          </div>
        </div>
      )}

      {/* Product detail modal — reuse from ProductsPage */}
      {selectedProduct && (
        <ProductDetailModalLazy
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={async (p) => { await handleAddToCart(p); setSelectedProduct(null); }}
          onGoToCart={() => { setSelectedProduct(null); onGoToCart && onGoToCart(); }}
          onOpenSimilar={(p) => setSelectedProduct(p)}
        />
      )}
    </div>
  );
};

// ── Lazy-import ProductDetailModal from ProductsPage to avoid circular deps ───
import { ProductDetailModal as ProductDetailModalLazy } from './ProductsPage';

export default SearchPage;