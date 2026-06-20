import { useState, useEffect } from 'react';
import API from '../../utils/api';

const ProductList = ({ onAddProduct }) => {
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [category, setCategory]   = useState('');
  const [status, setStatus]       = useState('');
  const [editProduct, setEditProduct] = useState(null);
  const [deleteId, setDeleteId]   = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal]         = useState(0);

  const categories = [
    'Electronics', 'Clothing', 'Food & Grocery', 'Home & Kitchen',
    'Beauty & Health', 'Sports & Outdoors', 'Books & Stationery',
    'Toys & Games', 'Automotive', 'Other',
  ];

  useEffect(() => {
    fetchProducts();
  }, [page, search, category, status]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 10 });
      if (search)   params.append('search', search);
      if (category) params.append('category', category);
      if (status)   params.append('status', status);

      const { data } = await API.get(`/products/seller/myproducts?${params}`);
      setProducts(data.products);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id) => {
    setActionLoading(id + '_toggle');
    try {
      await API.put(`/products/${id}/toggle`);
      fetchProducts();
    } catch (err) {
      console.error('Toggle failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id) => {
    setActionLoading(id + '_delete');
    try {
      await API.delete(`/products/${id}`);
      setDeleteId(null);
      fetchProducts();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const getStockBadge = (stock) => {
    if (stock === 0)  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Out of stock</span>;
    if (stock <= 5)   return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Low: {stock}</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">In stock: {stock}</span>;
  };

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">{total}</div>
          <div className="text-sm text-gray-500 mt-0.5">Total Products</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-600">{products.filter(p => p.isActive).length}</div>
          <div className="text-sm text-gray-500 mt-0.5">Active</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-orange-500">{products.filter(p => p.stock <= 5).length}</div>
          <div className="text-sm text-gray-500 mt-0.5">Low Stock</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          onClick={() => { setSearch(''); setCategory(''); setStatus(''); setPage(1); }}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-all"
        >
          Clear
        </button>
      </div>

      {/* Product table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📦</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No products yet</h3>
            <p className="text-gray-500 text-sm mb-5">Add your first product to start selling</p>
            <button
              onClick={onAddProduct}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all"
            >
              + Add First Product
            </button>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Product', 'Category', 'Price', 'Stock', 'Status', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product._id} className="hover:bg-gray-50 transition-colors">
                    {/* Product */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={product.images[0]?.url}
                          alt={product.name}
                          className="w-12 h-12 rounded-lg object-cover border border-gray-100"
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-900 max-w-48 truncate">{product.name}</p>
                          {product.discount > 0 && (
                            <span className="text-xs text-orange-600 font-medium">{product.discount}% off</span>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* Category */}
                    <td className="px-4 py-4">
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{product.category}</span>
                    </td>
                    {/* Price */}
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900">Rs {product.price.toLocaleString()}</div>
                      {product.comparePrice && (
                        <div className="text-xs text-gray-400 line-through">Rs {product.comparePrice.toLocaleString()}</div>
                      )}
                    </td>
                    {/* Stock */}
                    <td className="px-4 py-4">{getStockBadge(product.stock)}</td>
                    {/* Status */}
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleToggle(product._id)}
                        disabled={actionLoading === product._id + '_toggle'}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                          ${product.isActive ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
                          ${product.isActive ? 'translate-x-4' : 'translate-x-1'}`}
                        />
                      </button>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditProduct(product)}
                          className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg font-medium transition-all"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => setDeleteId(product._id)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg font-medium transition-all"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-sm text-gray-500">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300 transition-all"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:border-gray-300 transition-all"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="text-3xl mb-3 text-center">🗑️</div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Product?</h3>
            <p className="text-gray-500 text-sm text-center mb-6">
              This will permanently delete the product and its images. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={actionLoading === deleteId + '_delete'}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-all"
              >
                {actionLoading === deleteId + '_delete' ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editProduct && (
        <EditProductModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSuccess={() => { setEditProduct(null); fetchProducts(); }}
        />
      )}
    </div>
  );
};

// ── Edit Product Modal ────────────────────────────────────
const EditProductModal = ({ product, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name:         product.name,
    description:  product.description,
    price:        product.price,
    comparePrice: product.comparePrice || '',
    category:     product.category,
    stock:        product.stock,
    discount:     product.discount || 0,
  });
  const [images, setImages]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const categories = [
    'Electronics', 'Clothing', 'Food & Grocery', 'Home & Kitchen',
    'Beauty & Health', 'Sports & Outdoors', 'Books & Stationery',
    'Toys & Games', 'Automotive', 'Other',
  ];

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      Object.entries(formData).forEach(([k, v]) => form.append(k, v));
      images.forEach((img) => form.append('images', img));

      await API.put(`/products/${product._id}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-screen overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Edit Product</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product name</label>
            <input name="name" value={formData.name} onChange={handleChange}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price (Rs)</label>
              <input name="price" type="number" value={formData.price} onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Compare Price (Rs)</label>
              <input name="comparePrice" type="number" value={formData.comparePrice} onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
              <input name="stock" type="number" value={formData.stock} onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount (%)</label>
              <input name="discount" type="number" value={formData.discount} onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select name="category" value={formData.category} onChange={handleChange}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white">
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Replace images (optional)
            </label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => setImages(Array.from(e.target.files))}
                className="hidden"
                id="edit-images"
              />
              <label htmlFor="edit-images" className="cursor-pointer">
                <div className="text-2xl mb-1">📸</div>
                <p className="text-sm text-gray-500">
                  {images.length > 0 ? `${images.length} new image(s) selected` : 'Click to select new images'}
                </p>
                <p className="text-xs text-gray-400 mt-1">Leave empty to keep existing images</p>
              </label>
            </div>
            {/* Current images preview */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {product.images.map((img, i) => (
                <img key={i} src={img.url} alt="" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-300 transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-all">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductList;