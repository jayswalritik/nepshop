import { useState, useEffect } from 'react';
import API from '../../utils/api';

const CommissionManagement = () => {
  const [report, setReport]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [editSeller, setEditSeller] = useState(null);
  const [newRate, setNewRate]   = useState('');
  const [saving, setSaving]     = useState(false);
  const [success, setSuccess]   = useState('');

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/commission');
      setReport(data);
    } catch (err) {
      console.error('Failed to fetch commission report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRate = async () => {
    if (!newRate && newRate !== 0) return;
    setSaving(true);
    try {
      await API.put(`/admin/commission/${editSeller._id}`, {
        commissionRate: Number(newRate),
      });
      setSuccess(`Commission rate updated to ${newRate}% for ${editSeller.shopName}`);
      setEditSeller(null);
      setNewRate('');
      fetchReport();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update commission');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div>
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-5 flex items-center gap-2">
          <span>✅</span> {success}
        </div>
      )}

      {/* Overall stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Platform Revenue</p>
          <p className="text-2xl font-bold text-gray-900">
            Rs {report?.overall?.totalRevenue?.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Commission Earned</p>
          <p className="text-2xl font-bold text-green-600">
            Rs {report?.overall?.totalCommission?.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Orders</p>
          <p className="text-2xl font-bold text-indigo-600">
            {report?.overall?.totalOrders || 0}
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5 flex gap-3">
        <span className="text-xl">💡</span>
        <div>
          <p className="text-sm font-semibold text-indigo-900 mb-1">How commission works</p>
          <p className="text-sm text-indigo-700">
            Default commission is <strong>5%</strong> of each order total.
            You can set a custom rate per seller below.
            Commission is automatically deducted when an order is placed.
          </p>
        </div>
      </div>

      {/* Per-seller breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Commission by Seller</h3>
          <p className="text-xs text-gray-400 mt-0.5">Click "Edit Rate" to set a custom commission for any seller</p>
        </div>

        {report?.sellers?.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">💰</div>
            <p className="font-medium">No commission data yet</p>
            <p className="text-sm mt-1">Commission data will appear once orders are placed</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Seller', 'Orders', 'Revenue', 'Commission Earned', 'Rate', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report?.sellers?.map((s) => (
                <tr key={s._id?._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">{s._id?.shopName || 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{s._id?.email}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">{s.totalOrders}</td>
                  <td className="px-4 py-4 text-sm font-medium text-gray-900">
                    Rs {s.totalRevenue?.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-green-600">
                    Rs {s.totalCommission?.toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-sm font-bold text-indigo-600">
                      {s._id?.commissionRate || 5}%
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => {
                        setEditSeller(s._id);
                        setNewRate(s._id?.commissionRate || 5);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                    >
                      ✏️ Edit Rate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit commission modal */}
      {editSeller && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Edit Commission Rate</h3>
              <button onClick={() => setEditSeller(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-sm font-medium text-gray-900">{editSeller.shopName}</p>
              <p className="text-xs text-gray-400">{editSeller.email}</p>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Commission Rate (%)
              </label>
              <input
                type="number"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                min="0"
                max="50"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="text-xs text-gray-400 mt-1">Enter a value between 0 and 50</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditSeller(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRate}
                disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
              >
                {saving ? 'Saving...' : '💾 Save Rate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionManagement;