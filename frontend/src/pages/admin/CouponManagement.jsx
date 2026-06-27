import { useState, useEffect } from 'react';
import API from '../../utils/api';

const CouponManagement = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const emptyForm = {
    code: '', description: '', type: 'fixed', value: '',
    minOrder: '', maxDiscount: '', usageLimit: '', expiresAt: '', isPublic: true,
  };
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { fetchCoupons(); }, []);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/coupons');
      setCoupons(data.coupons);
    } catch (err) {
      console.error('Failed to fetch coupons:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.code.trim() || !form.value) {
      setError('Code and value are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await API.post('/coupons', {
        code: form.code.trim(),
        description: form.description,
        type: form.type,
        value: Number(form.value),
        minOrder: form.minOrder ? Number(form.minOrder) : 0,
        maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : 0,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        expiresAt: form.expiresAt || null,
        isPublic: form.isPublic,
      });
      setSuccess('Coupon created successfully');
      setForm(emptyForm);
      setShowForm(false);
      fetchCoupons();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create coupon');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      await API.put(`/coupons/${id}/toggle`);
      fetchCoupons();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to toggle coupon');
    }
  };

  const handleDelete = async (id, code) => {
    if (!window.confirm(`Delete coupon ${code}? This cannot be undone.`)) return;
    try {
      await API.delete(`/coupons/${id}`);
      fetchCoupons();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete coupon');
    }
  };

  const isExpired = (c) => c.expiresAt && new Date(c.expiresAt) < new Date();
  const discountLabel = (c) => c.type === 'fixed' ? `Rs ${c.value}` : `${c.value}%`;

  return (
    <div>
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-5 flex items-center gap-2">
          <span>✅</span> {success}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-gray-900">Coupons</h3>
          <p className="text-xs text-gray-400">Platform-funded discounts — NepShop absorbs the cost</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); setForm(emptyForm); }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-all"
        >
          {showForm ? 'Cancel' : '+ New Coupon'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <h4 className="font-medium text-gray-900 mb-4">Create New Coupon</h4>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 mb-4">
              {error}
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code *</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="DASHAIN100"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Rs 100 off Dashain sale"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
              >
                <option value="fixed">Fixed (Rs off)</option>
                <option value="percentage">Percentage (% off)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Value * {form.type === 'fixed' ? '(Rs)' : '(%)'}
              </label>
              <input
                type="number"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={form.type === 'fixed' ? '100' : '10'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min Order (Rs)</label>
              <input
                type="number"
                value={form.minOrder}
                onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
                placeholder="0 (no minimum)"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
              />
            </div>
            {form.type === 'percentage' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Discount (Rs)</label>
                <input
                  type="number"
                  value={form.maxDiscount}
                  onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })}
                  placeholder="0 (no cap)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Usage Limit</label>
              <input
                type="number"
                value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
                placeholder="Blank = unlimited"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expires At</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Public toggle */}
          <div className="mt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm({ ...form, isPublic: e.target.checked })}
                className="w-4 h-4 text-indigo-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Public coupon</p>
                <p className="text-xs text-gray-400">
                  Shows on the customer Offers page. Uncheck for secret codes (work only if entered manually).
                </p>
              </div>
            </label>
          </div>

          <button
            onClick={handleCreate}
            disabled={saving}
            className="mt-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-all"
          >
            {saving ? 'Creating...' : 'Create Coupon'}
          </button>
        </div>
      )}

      {/* Coupons table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">🎟️</div>
            <p className="font-medium">No coupons yet</p>
            <p className="text-sm mt-1">Create one to offer discounts to customers</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Code', 'Discount', 'Min Order', 'Usage', 'Visibility', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <p className="text-sm font-mono font-bold text-gray-900">{c.code}</p>
                    {c.description && <p className="text-xs text-gray-400">{c.description}</p>}
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">{discountLabel(c)}</p>
                    {c.type === 'percentage' && c.maxDiscount > 0 && (
                      <p className="text-xs text-gray-400">max Rs {c.maxDiscount}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {c.minOrder > 0 ? `Rs ${c.minOrder}` : '—'}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ' / ∞'}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.isPublic ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.isPublic ? '🌐 Public' : '🔒 Secret'}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {isExpired(c) ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">Expired</span>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggle(c._id)}
                        className="text-xs text-indigo-600 font-medium px-2.5 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300"
                      >
                        {c.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => handleDelete(c._id, c.code)}
                        className="text-xs text-red-500 font-medium px-2.5 py-1.5 border border-red-200 rounded-lg hover:border-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CouponManagement;