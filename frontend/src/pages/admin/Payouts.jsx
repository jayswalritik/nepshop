import { useState, useEffect } from 'react';
import API from '../../utils/api';

const Payouts = () => {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(null);
  const [confirm, setConfirm] = useState(null); // { type, id, name, amount }

  useEffect(() => {
    fetchPayouts();
  }, []);

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/payouts');
      setData(data);
    } catch (err) {
      console.error('Failed to fetch payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!confirm) return;
    setPaying(confirm.id);
    try {
      const url = confirm.type === 'seller'
        ? `/admin/payouts/seller/${confirm.id}`
        : `/admin/payouts/agent/${confirm.id}`;
      await API.post(url);
      setConfirm(null);
      fetchPayouts();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to process payout');
    } finally {
      setPaying(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const fmtMethod = (pd) => {
    if (!pd?.preferredMethod) return 'No payout method set';
    if (pd.preferredMethod === 'bank')   return `Bank: ${pd.bankName || '—'} · ${pd.accountNumber || '—'}`;
    if (pd.preferredMethod === 'khalti') return `Khalti: ${pd.khaltiNumber || '—'}`;
    if (pd.preferredMethod === 'esewa')  return `eSewa: ${pd.esewaNumber || '—'}`;
    return pd.preferredMethod;
  };

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-5 text-white">
          <p className="text-xs text-indigo-200 mb-1">Total Pending Payouts</p>
          <p className="text-3xl font-bold">Rs {data?.totals?.grandTotal?.toLocaleString() || 0}</p>
          <p className="text-xs text-indigo-200 mt-1">Owed to sellers + agents</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">Owed to Sellers</p>
          <p className="text-3xl font-bold text-gray-900">Rs {data?.totals?.sellerPayout?.toLocaleString() || 0}</p>
          <p className="text-xs text-gray-400 mt-1">Released from escrow</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 mb-1">Owed to Delivery Agents</p>
          <p className="text-3xl font-bold text-purple-600">Rs {data?.totals?.agentPayout?.toLocaleString() || 0}</p>
          <p className="text-xs text-gray-400 mt-1">Completed deliveries</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-xs text-amber-700 mb-1">⏳ Seller Funds in Escrow</p>
          <p className="text-3xl font-bold text-amber-600">Rs {data?.totals?.inEscrow?.toLocaleString() || 0}</p>
          <p className="text-xs text-amber-600 mt-1">Locked until return window closes</p>
        </div>
      </div>

      {/* Seller payouts */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">🏪 Seller Payouts</h3>
          <p className="text-xs text-gray-400 mt-0.5">Released earnings that cleared the return window</p>
        </div>
        {!data?.sellers?.length ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm">No pending seller payouts</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Seller', 'Payout Method', 'Orders', 'Amount Owed', 'Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.sellers.map((s) => (
                <tr key={s.sellerId?._id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">{s.sellerId?.shopName || `${s.sellerId?.firstName} ${s.sellerId?.lastName}`}</p>
                    <p className="text-xs text-gray-400">{s.sellerId?.email}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs text-gray-600">{fmtMethod(s.sellerId?.payoutDetails)}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">{s.orders}</td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-bold text-green-600">Rs {s.amount.toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => setConfirm({ type: 'seller', id: s.sellerId._id, name: s.sellerId?.shopName || s.sellerId?.firstName, amount: s.amount })}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-all"
                    >
                      💰 Mark Paid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Agent payouts */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">🚚 Delivery Agent Payouts</h3>
          <p className="text-xs text-gray-400 mt-0.5">Rs 50 per completed delivery</p>
        </div>
        {!data?.agents?.length ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm">No pending agent payouts</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Agent', 'Payout Method', 'Deliveries', 'Amount Owed', 'Action'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.agents.map((a) => (
                <tr key={a.agentId?._id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">{a.agentId?.firstName} {a.agentId?.lastName}</p>
                    <p className="text-xs text-gray-400">{a.agentId?.email}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-xs text-gray-600">{fmtMethod(a.agentId?.payoutDetails)}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-700">{a.jobs}</td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-bold text-purple-600">Rs {a.amount.toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => setConfirm({ type: 'agent', id: a.agentId._id, name: a.agentId?.firstName, amount: a.amount })}
                      className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-all"
                    >
                      💰 Mark Paid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="text-4xl text-center mb-3">💰</div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Confirm Payout</h3>
            <p className="text-sm text-gray-500 text-center mb-1">
              Mark <strong>Rs {confirm.amount.toLocaleString()}</strong> as paid to
            </p>
            <p className="text-sm font-semibold text-gray-900 text-center mb-5">{confirm.name}</p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-amber-700 text-center">
                This records the payout as completed. Transfer the money via the {confirm.type}'s registered payout method first.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={paying === confirm.id}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
              >
                {paying === confirm.id ? 'Processing...' : 'Confirm Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payouts;