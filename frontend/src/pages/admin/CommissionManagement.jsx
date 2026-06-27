import { useState, useEffect } from 'react';
import API from '../../utils/api';

const CommissionManagement = () => {
  const [report, setReport]         = useState(null);
  const [loading, setLoading]       = useState(true);
  const [editSeller, setEditSeller] = useState(null);
  const [newRate, setNewRate]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [success, setSuccess]       = useState('');

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

      {/* NepShop income breakdown */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 mb-6 text-white">
        <p className="text-sm text-indigo-200 mb-1">Total NepShop Income (delivered orders)</p>
        <p className="text-4xl font-bold mb-4">
          Rs {report?.overall?.nepShopIncome?.toLocaleString() || 0}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-xs text-indigo-200 mb-1">💼 Commission Income</p>
            <p className="text-2xl font-bold">
              Rs {report?.overall?.totalCommission?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-indigo-200 mt-1">5% of product price</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <p className="text-xs text-indigo-200 mb-1">🚚 Delivery Margin</p>
            <p className="text-2xl font-bold">
              Rs {report?.overall?.deliveryMargin?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-indigo-200 mt-1">
              Collected Rs {report?.overall?.totalDeliveryCharge?.toLocaleString() || 0} − paid agents Rs {report?.overall?.totalDeliveryPaid?.toLocaleString() || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Product Revenue</p>
          <p className="text-2xl font-bold text-gray-900">
            Rs {report?.overall?.productRevenue?.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">Goes to sellers (− commission)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Paid to Agents</p>
          <p className="text-2xl font-bold text-purple-600">
            Rs {report?.overall?.totalDeliveryPaid?.toLocaleString() || 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">Rs 50 × delivered orders</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Pending Revenue</p>
          <p className="text-2xl font-bold text-yellow-500">
            Rs {report?.overall?.pendingRevenue?.toLocaleString() || 0}
          </p>
          <p className="text-xs text-yellow-500 mt-1">⏳ In-progress orders</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Delivered Orders</p>
          <p className="text-2xl font-bold text-indigo-600">
            {report?.overall?.totalOrders || 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {report?.overall?.pendingOrders || 0} still in progress
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5 flex gap-3">
        <span className="text-xl">💡</span>
        <div>
          <p className="text-sm font-semibold text-indigo-900 mb-1">How commission works</p>
          <p className="text-sm text-indigo-700">
            NepShop earns from two sources: <strong>commission</strong> (5% of product price) and
            <strong> delivery margin</strong> (delivery charge collected minus the Rs 50 paid to agents).
            On a Rs 1,000 product: seller gets Rs 950, agent gets Rs 50, and NepShop keeps Rs 100
            (Rs 50 commission + Rs 50 delivery margin). All figures from delivered orders only.
          </p>
        </div>
      </div>

      {/* Per-seller breakdown */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Commission by Seller</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Confirmed = delivered orders · Pending = in-progress · Cancelled orders excluded
          </p>
        </div>

        {!report?.sellers?.length ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">💰</div>
            <p className="font-medium">No commission data yet</p>
            <p className="text-sm mt-1">Data appears once orders are placed</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  'Seller',
                  'Confirmed Orders',
                  'Product Revenue',
                  'Commission Earned',
                  'Pending Revenue',
                  'Rate',
                  'Actions'
                ].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report?.sellers?.map((s, i) => (
                <tr key={i} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {s._id?.shopName || 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400">{s._id?.email}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-gray-700">{s.confirmedOrders}</p>
                    {s.pendingOrders > 0 && (
                      <p className="text-xs text-yellow-500">+{s.pendingOrders} pending</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      Rs {s.confirmedRevenue?.toLocaleString() || 0}
                    </p>
                    <p className="text-xs text-green-500">Before Commission</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-green-600">
                      Rs {s.confirmedCommission?.toLocaleString() || 0}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {s.pendingRevenue > 0 ? (
                      <>
                        <p className="text-sm font-medium text-yellow-600">
                          Rs {s.pendingRevenue?.toLocaleString() || 0}
                        </p>
                        <p className="text-xs text-yellow-500">⏳ In progress</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">—</p>
                    )}
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
              <button
                onClick={() => setEditSeller(null)}
                className="text-gray-400 hover:text-gray-600"
              >✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-sm font-medium text-gray-900">{editSeller.shopName}</p>
              <p className="text-xs text-gray-400">{editSeller.email}</p>
              <p className="text-xs text-gray-400 mt-1">
                Current rate: <strong>{editSeller.commissionRate || 5}%</strong>
              </p>
            </div>

            <div className="mb-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Commission Rate (%)
              </label>
              <input
                type="number"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                min="0"
                max="50"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <p className="text-xs text-gray-400 mt-1">Enter a value between 0% and 50%</p>
            </div>

            {/* Preview */}
            {newRate !== '' && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-4 mt-3">
                <p className="text-xs text-indigo-700">
                  On a Rs 1,000 order — NepShop earns{' '}
                  <strong>Rs {(1000 * newRate / 100).toFixed(0)}</strong>,
                  seller receives{' '}
                  <strong>Rs {(1000 - 1000 * newRate / 100).toFixed(0)}</strong>
                </p>
              </div>
            )}

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