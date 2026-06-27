import { useState } from 'react';
import { useWishlist } from '../../context/WishlistContext';
import { useCart } from '../../context/CartContext';

const WishlistPage = ({ onGoToShop }) => {
  const { wishlist, toggleWish } = useWishlist();
  const { addToCart, loading: cartLoading } = useCart();
  const [addingId, setAddingId] = useState(null);
  const [toast, setToast] = useState(null);

  const getDiscountedPrice = (product) => {
    if (product.discount > 0) {
      return Math.round(product.price - (product.price * product.discount / 100));
    }
    return product.price;
  };

  const handleAddToCart = async (product) => {
    setAddingId(product._id);
    const result = await addToCart(product._id, 1);
    if (result.success) {
      setToast({ type: 'success', message: `"${product.name}" added to cart!` });
    } else {
      setToast({ type: 'error', message: result.message });
    }
    setTimeout(() => setToast(null), 3000);
    setAddingId(null);
  };

  if (!wishlist || wishlist.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
        <div className="text-6xl mb-4">❤️</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Your wishlist is empty</h3>
        <p className="text-gray-500 text-sm mb-5">Save products you love by tapping the heart icon</p>
        {onGoToShop && (
          <button
            onClick={onGoToShop}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-5 py-2.5 rounded-xl transition-all"
          >
            Browse Products →
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900">
          My Wishlist <span className="text-gray-400 font-normal text-base">({wishlist.length})</span>
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {wishlist.map((product) => (
          <div key={product._id} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-all">
            {/* Image */}
            <div className="relative overflow-hidden">
              <img
                src={product.images?.[0]?.url}
                alt={product.name}
                className="w-full h-44 object-cover"
              />
              {product.discount > 0 && (
                <span className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {product.discount}% OFF
                </span>
              )}
              {/* Remove from wishlist */}
              <button
                onClick={() => toggleWish(product._id)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-sm transition-all"
                title="Remove from wishlist"
              >
                <span className="text-base leading-none">❤️</span>
              </button>
            </div>

            {/* Details */}
            <div className="p-3">
              <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">{product.name}</p>
              <p className="text-xs text-gray-400 mb-2">{product.seller?.shopName}</p>

              {/* Price */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base font-bold text-gray-900">
                  Rs {getDiscountedPrice(product).toLocaleString()}
                </span>
                {product.discount > 0 && (
                  <span className="text-xs text-gray-400 line-through">
                    Rs {product.price.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Stock + add to cart */}
              {product.stock > 0 ? (
                <button
                  onClick={() => handleAddToCart(product)}
                  disabled={addingId === product._id || cartLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-all"
                >
                  {addingId === product._id ? 'Adding...' : '🛒 Add to Cart'}
                </button>
              ) : (
                <button
                  disabled
                  className="w-full bg-gray-100 text-gray-400 text-sm font-medium py-2 rounded-lg cursor-not-allowed"
                >
                  Out of Stock
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WishlistPage;