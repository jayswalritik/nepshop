import { useState } from 'react';
import API from '../../utils/api';

const AddProduct = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    name:         '',
    description:  '',
    price:        '',
    comparePrice: '',
    category:     '',
    stock:        '',
    discount:     '0',
  });
  const [images, setImages]     = useState([]);
  const [previews, setPreviews] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const categories = [
    'Electronics', 'Clothing', 'Food & Grocery', 'Home & Kitchen',
    'Beauty & Health', 'Sports & Outdoors', 'Books & Stationery',
    'Toys & Games', 'Automotive', 'Other',
  ];

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setFieldErrors({ ...fieldErrors, [e.target.name]: '' });
    setError('');
  };

  const handleImages = (e) => {
    const newFiles = Array.from(e.target.files);
    const combined = [...images, ...newFiles];

    if (combined.length > 5) {
      setError('Maximum 5 images allowed. Remove some before adding more.');
      return;
    }

    setError('');
    setImages(combined);

    // Generate previews for new files and add to existing
    const newUrls = newFiles.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newUrls]);

    // Reset input so same file can be selected again if needed
    e.target.value = '';
  };

  const removeImage = (index) => {
    const newImages   = images.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setImages(newImages);
    setPreviews(newPreviews);
  };

  const validate = () => {
    const errs = {};
    if (!formData.name.trim())        errs.name        = 'Product name is required';
    if (!formData.description.trim()) errs.description = 'Description is required';
    if (!formData.price)              errs.price       = 'Price is required';
    if (!formData.category)           errs.category    = 'Category is required';
    if (!formData.stock)              errs.stock       = 'Stock is required';
    if (images.length === 0)          errs.images      = 'At least one image is required';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      Object.entries(formData).forEach(([k, v]) => {
        if (v !== '') form.append(k, v);
      });
      images.forEach((img) => form.append('images', img));

      await API.post('/products', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create product. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white border border-gray-200 rounded-xl p-6">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-5 flex items-start gap-2">
            <span>⚠️</span><span>{error}</span>
          </div>
        )}

        <div className="space-y-5">

          {/* Product name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product name <span className="text-red-500">*</span>
            </label>
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Samsung Galaxy A55 5G"
              className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                ${fieldErrors.name ? 'border-red-400 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
            />
            {fieldErrors.name && <p className="text-red-500 text-xs mt-1">{fieldErrors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe your product — features, specifications, condition, etc."
              rows={4}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all resize-none
                ${fieldErrors.description ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
            />
            <div className="flex justify-between mt-1">
              {fieldErrors.description
                ? <p className="text-red-500 text-xs">{fieldErrors.description}</p>
                : <span />}
              <p className="text-xs text-gray-400">{formData.description.length}/2000</p>
            </div>
          </div>

          {/* Price row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Selling price (Rs) <span className="text-red-500">*</span>
              </label>
              <input
                name="price"
                type="number"
                value={formData.price}
                onChange={handleChange}
                placeholder="e.g. 45000"
                min="0"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                  ${fieldErrors.price ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
              />
              {fieldErrors.price && <p className="text-red-500 text-xs mt-1">{fieldErrors.price}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Original price (Rs) <span className="text-gray-400 font-normal text-xs">optional</span>
              </label>
              <input
                name="comparePrice"
                type="number"
                value={formData.comparePrice}
                onChange={handleChange}
                placeholder="e.g. 50000"
                min="0"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
          </div>

          {/* Stock and discount row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock quantity <span className="text-red-500">*</span>
              </label>
              <input
                name="stock"
                type="number"
                value={formData.stock}
                onChange={handleChange}
                placeholder="e.g. 10"
                min="0"
                className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                  ${fieldErrors.stock ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
              />
              {fieldErrors.stock && <p className="text-red-500 text-xs mt-1">{fieldErrors.stock}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount <span className="text-gray-400 font-normal text-xs">optional (%)</span>
              </label>
              <input
                name="discount"
                type="number"
                value={formData.discount}
                onChange={handleChange}
                placeholder="0"
                min="0"
                max="100"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all bg-white
                ${fieldErrors.category ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
            >
              <option value="">Select a category</option>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
            {fieldErrors.category && <p className="text-red-500 text-xs mt-1">{fieldErrors.category}</p>}
          </div>

          {/* Images */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Product images <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal text-xs ml-1">(max 5, 2MB each)</span>
            </label>

            {/* Upload area */}
            <label
              htmlFor="product-images"
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all
                ${fieldErrors.images ? 'border-red-400 bg-red-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 bg-gray-50'}`}
            >
              <div className="text-3xl mb-1">📸</div>
              <p className="text-sm text-gray-500">Click to upload images</p>
              <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WEBP — from your device or camera</p>
              <input
                id="product-images"
                type="file"
                multiple
                accept="image/*"
                onChange={handleImages}
                className="hidden"
              />
            </label>
            {fieldErrors.images && <p className="text-red-500 text-xs mt-1">{fieldErrors.images}</p>}

            {/* Image previews */}
            {previews.length > 0 && (
              <div className="flex gap-3 mt-3 flex-wrap">
                {previews.map((url, i) => (
                  <div key={i} className="relative">
                    <img
                      src={url}
                      alt={`Preview ${i + 1}`}
                      className="w-20 h-20 rounded-xl object-cover border border-gray-200"
                    />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                    >
                      ✕
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-60 text-white px-1 rounded">Main</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Price preview */}
          {formData.price && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
              <p className="text-xs font-medium text-indigo-700 mb-2">Price preview</p>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-indigo-900">
                  Rs {formData.discount > 0
                    ? Math.round(formData.price - (formData.price * formData.discount / 100)).toLocaleString()
                    : Number(formData.price).toLocaleString()}
                </span>
                {formData.comparePrice && (
                  <span className="text-sm text-gray-400 line-through">Rs {Number(formData.comparePrice).toLocaleString()}</span>
                )}
                {formData.discount > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{formData.discount}% off</span>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Submit */}
        <div className="flex gap-3 mt-6 pt-5 border-t border-gray-100">
          <button
            onClick={onSuccess}
            className="px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-all text-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Uploading & saving...
              </>
            ) : '📦 List Product'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddProduct;