/**
 * RecommendationRow.jsx
 * (frontend/src/components/recommendations/RecommendationRow.jsx)
 *
 * Reusable horizontal scrolling row of product cards for all
 * recommendation surfaces: Trending, Similar Products, Home Feed.
 *
 * Props:
 *   title       string    — section heading
 *   subtitle    string    — optional subheading
 *   products    array     — array of product objects from /api/recommendations/*
 *   loading     boolean
 *   onProduct   fn(p)     — called when user clicks a product card (open modal)
 *   onAddToCart fn(p)     — called when user clicks Add to Cart
 *   showReason  boolean   — show the _reason "explain why" label (default: true)
 *   emptyText   string    — what to show when empty (optional, null = hide section)
 */

import { useCart }     from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useState }    from 'react';

const RecommendationRow = ({
  title,
  subtitle,
  products = [],
  loading = false,
  onProduct,
  onAddToCart,
  showReason = true,
  emptyText = null,
}) => {
  const { addToCart } = useCart();
  const { isWished, toggleWish } = useWishlist();
  const [addedId, setAddedId] = useState(null);
  const [toast, setToast]     = useState(null);

  const handleAdd = async (product, e) => {
    e.stopPropagation();
    if (onAddToCart) {
      onAddToCart(product);
      return;
    }
    // Standalone add-to-cart (when used without parent handler)
    setAddedId(product._id);
    const result = await addToCart(product._id, 1);
    setAddedId(null);
    if (result.success) {
      setToast({ type: 'success', message: `"${product.name}" added to cart!` });
    } else {
      setToast({ type: 'error', message: result.message });
    }
    setTimeout(() => setToast(null), 3000);
  };

  const getDisplayPrice = (p) =>
    p.discount > 0
      ? Math.round(p.price - (p.price * p.discount) / 100)
      : p.price;

  // Skeleton cards while loading
  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="h-5 bg-gray-200 rounded w-40 animate-pulse mb-1"></div>
            {subtitle && <div className="h-3 bg-gray-100 rounded w-56 animate-pulse"></div>}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-44 bg-white border border-gray-100 rounded-xl overflow-hidden animate-pulse"
            >
              <div className="w-full h-36 bg-gray-200"></div>
              <div className="p-3">
                <div className="h-3 bg-gray-200 rounded mb-1.5"></div>
                <div className="h-3 bg-gray-100 rounded w-2/3 mb-2.5"></div>
                <div className="h-7 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Hide section entirely when empty and no emptyText configured
  if (!products.length && !emptyText) return null;

  return (
    <div className="mb-8 relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? '✅' : '⚠️'} {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {products.length > 4 && (
          <span className="text-xs text-gray-400">{products.length} items →</span>
        )}
      </div>

      {/* Empty state */}
      {!products.length && emptyText && (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl py-8 text-center text-sm text-gray-400">
          {emptyText}
        </div>
      )}

      {/* Horizontal scroll row */}
      {products.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
          {products.map((product) => (
            <div
              key={product._id}
              onClick={() => onProduct && onProduct(product)}
              className="flex-shrink-0 w-44 bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-all cursor-pointer group snap-start"
            >
              {/* Image */}
              <div className="relative overflow-hidden">
                <img
                  src={product.images?.[0]?.url}
                  alt={product.name}
                  className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {/* Discount badge */}
                {product.discount > 0 && (
                  <span className="absolute top-1.5 left-1.5 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {product.discount}% OFF
                  </span>
                )}
                {/* Wishlist */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleWish(product._id); }}
                  className="absolute top-1.5 right-1.5 w-7 h-7 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-sm hover:scale-110 transition-transform"
                >
                  <span className={isWished(product._id) ? 'text-red-500' : 'text-gray-300'}>
                    {isWished(product._id) ? '♥' : '♡'}
                  </span>
                </button>
              </div>

              {/* Info */}
              <div className="p-3">
                {/* Explain-why label */}
                {showReason && product._reason && (
                  <span className="text-[10px] text-indigo-500 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-full block mb-1 truncate">
                    {product._reason}
                  </span>
                )}

                <p className="text-xs font-semibold text-gray-800 leading-tight mb-1 line-clamp-2">
                  {product.name}
                </p>

                {/* Rating — always reserved so cards in a row align */}
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

                {/* Price */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm font-bold text-gray-900">
                    Rs {getDisplayPrice(product).toLocaleString()}
                  </span>
                  {product.discount > 0 && (
                    <span className="text-[10px] text-gray-400 line-through">
                      Rs {product.price.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* Add to cart */}
                <button
                  onClick={(e) => handleAdd(product, e)}
                  disabled={addedId === product._id || product.stock === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium py-1.5 rounded-lg transition-all"
                >
                  {addedId === product._id
                    ? '...'
                    : product.stock === 0
                    ? 'Out of stock'
                    : '+ Cart'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecommendationRow;