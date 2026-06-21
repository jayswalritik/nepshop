import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { useCart } from '../../context/CartContext';

const ProductsPage = ({ onGoToCart }) => {
  const { addToCart, loading: cartLoading } = useCart();
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('');
  const [sort, setSort]           = useState('newest');
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]         = useState(0);
  const [addedId, setAddedId]     = useState(null);
  const [toast, setToast]         = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const categories = [
    'Electronics', 'Clothing', 'Food & Grocery', 'Home & Kitchen',
    'Beauty & Health', 'Sports & Outdoors', 'Books & Stationery',
    'Toys & Games', 'Automotive', 'Other',
  ];

  useEffect(() => {
    fetchProducts();
  }, [page, category, sort]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchProducts();
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 12, sort });
      if (search)   params.append('search', search);
      if (category) params.append('category', category);

      const { data } = await API.get(`/products?${params}`);
      setProducts(data.products);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async (product) => {
    setAddedId(product._id);
    const result = await addToCart(product._id, 1);
    if (result.success) {
      setToast({ type: 'success', message: `"${product.name}" added to cart!` });
      setTimeout(() => setToast(null), 3000);
    } else {
      setToast({ type: 'error', message: result.message });
      setTimeout(() => setToast(null), 3000);
    }
    setAddedId(null);
  };

  const getDiscountedPrice = (product) => {
    if (product.discount > 0) {
      return Math.round(product.price - (product.price * product.discount / 100));
    }
    return product.price;
  };

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 transition-all
          ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          {toast.message}
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-white opacity-70 hover:opacity-100"
          >✕</button>
        </div>
      )}

      {/* Search and filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <div className="flex gap-3 flex-wrap">
          {/* Search */}
          <div className="flex-1 min-w-64 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {/* Category */}
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="top_rated">Top Rated</option>
          </select>

          {/* Clear */}
          {(search || category) && (
            <button
              onClick={() => { setSearch(''); setCategory(''); setPage(1); }}
              className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-all"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results count */}
        {!loading && (
          <p className="text-xs text-gray-400 mt-3">
            {total} product{total !== 1 ? 's' : ''} found
            {category && ` in "${category}"`}
            {search && ` for "${search}"`}
          </p>
        )}
      </div>

      {/* Products grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
              <div className="w-full h-48 bg-gray-200"></div>
              <div className="p-4">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-100 rounded w-2/3 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-500 text-sm">Try a different search or category</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((product) => (
              <div
                key={product._id}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-all group"
              >
                {/* Image */}
                <div
                  className="relative cursor-pointer overflow-hidden"
                  onClick={() => setSelectedProduct(product)}
                >
                  <img
                    src={product.images[0]?.url}
                    alt={product.name}
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {product.discount > 0 && (
                    <span className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {product.discount}% OFF
                    </span>
                  )}
                  {product.stock <= 5 && product.stock > 0 && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      Only {product.stock} left
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="p-3">
                  <p
                    className="text-sm font-medium text-gray-900 line-clamp-2 mb-1 cursor-pointer hover:text-indigo-600"
                    onClick={() => setSelectedProduct(product)}
                  >
                    {product.name}
                  </p>
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

                  {/* Rating */}
                  {product.numReviews > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-yellow-400 text-xs">★</span>
                      <span className="text-xs text-gray-600">{product.rating}</span>
                      <span className="text-xs text-gray-400">({product.numReviews})</span>
                    </div>
                  )}

                  {/* Add to cart */}
                  <button
                    onClick={() => handleAddToCart(product)}
                    disabled={addedId === product._id || cartLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition-all"
                  >
                    {addedId === product._id ? 'Adding...' : '🛒 Add to Cart'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300 transition-all"
              >
                ← Prev
              </button>
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i + 1)}
                  className={`w-9 h-9 text-sm rounded-lg transition-all
                    ${page === i + 1
                      ? 'bg-indigo-600 text-white'
                      : 'border border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300 transition-all"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Product detail modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(p) => { handleAddToCart(p); setSelectedProduct(null); }}
          onGoToCart={() => { setSelectedProduct(null); onGoToCart(); }}
        />
      )}
    </div>
  );
};

// ── Product Detail Modal ──────────────────────────────────
const ProductDetailModal = ({ product, onClose, onAddToCart, onGoToCart }) => {
  const [quantity, setQuantity]     = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  const discountedPrice = product.discount > 0
    ? Math.round(product.price - (product.price * product.discount / 100))
    : product.price;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-screen overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Product Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="p-5">
          <div className="grid md:grid-cols-2 gap-6">

            {/* Images */}
            <div>
              <img
                src={product.images[activeImage]?.url}
                alt={product.name}
                className="w-full h-64 object-cover rounded-xl mb-3"
              />
              {product.images.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                  {product.images.map((img, i) => (
                    <img
                      key={i}
                      src={img.url}
                      alt=""
                      onClick={() => setActiveImage(i)}
                      className={`w-14 h-14 object-cover rounded-lg cursor-pointer border-2 transition-all
                        ${activeImage === i ? 'border-indigo-500' : 'border-gray-200'}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                {product.category}
              </span>
              <h2 className="text-lg font-bold text-gray-900 mt-2 mb-1">{product.name}</h2>
              <p className="text-sm text-gray-400 mb-3">by {product.seller?.shopName}</p>

              {/* Price */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl font-bold text-gray-900">
                  Rs {discountedPrice.toLocaleString()}
                </span>
                {product.discount > 0 && (
                  <>
                    <span className="text-gray-400 line-through text-sm">
                      Rs {product.price.toLocaleString()}
                    </span>
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {product.discount}% OFF
                    </span>
                  </>
                )}
              </div>

              {/* Description */}
              <p className="text-sm text-gray-600 leading-relaxed mb-4">{product.description}</p>

              {/* Stock */}
              <div className="mb-4">
                {product.stock > 0 ? (
                  <span className="text-xs text-green-600 font-medium bg-green-50 px-2 py-1 rounded-full">
                    ✓ In stock ({product.stock} available)
                  </span>
                ) : (
                  <span className="text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded-full">
                    Out of stock
                  </span>
                )}
              </div>

              {/* Quantity */}
              {product.stock > 0 && (
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm font-medium text-gray-700">Qty:</span>
                  <div className="flex items-center border border-gray-200 rounded-lg">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-l-lg"
                    >−</button>
                    <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                    <button
                      onClick={() => setQuantity(q => Math.min(product.stock, q + 1))}
                      className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-50 rounded-r-lg"
                    >+</button>
                  </div>
                </div>
              )}

              {/* Reviews section */}
                <ReviewsSection productId={product._id} />

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => onAddToCart(product)}
                  disabled={product.stock === 0}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-all"
                >
                  🛒 Add to Cart
                </button>
                <button
                  onClick={onGoToCart}
                  className="px-4 py-2.5 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 font-medium rounded-lg text-sm transition-all"
                >
                  View Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Reviews Section ───────────────────────────────────────
const ReviewsSection = ({ productId }) => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const { data } = await API.get(`/reviews/${productId}`);
        setReviews(data.reviews);
      } catch (err) {
        console.error('Failed to fetch reviews:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, [productId]);

  if (loading) return (
    <div className="py-4 text-center">
      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
    </div>
  );

  if (reviews.length === 0) return (
    <div className="py-3 border-t border-gray-100 mt-3">
      <p className="text-xs text-gray-400 text-center">No reviews yet — be the first to review!</p>
    </div>
  );

  const avgRating = (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1);

  return (
    <div className="border-t border-gray-100 mt-4 pt-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-yellow-400 text-lg">★</span>
        <span className="font-bold text-gray-900">{avgRating}</span>
        <span className="text-sm text-gray-400">({reviews.length} reviews)</span>
      </div>
      <div className="space-y-3 max-h-40 overflow-y-auto">
        {reviews.map((review) => (
          <div key={review._id} className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700">
                {review.customer?.firstName} {review.customer?.lastName}
              </span>
              <div className="flex">
                {[1,2,3,4,5].map(s => (
                  <span key={s} className={`text-xs ${s <= review.rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-600">{review.comment}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductsPage;