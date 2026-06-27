import { useState, useEffect } from 'react';
import API from '../../utils/api';

const ReturnPickups = () => {
  const [returns, setReturns]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirm, setConfirm]   = useState(null); // { type: 'pickup'|'complete', return }

  useEffect(() => {
    fetchPickups();
  }, []);

  const fetchPickups = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/returns/pickups');
      setReturns(data.returns);
    } catch (err) {
      console.error('Failed to fetch return pickups:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePickup = async (returnId) => {
    setActionLoading(returnId);
    try {
      await API.put(`/returns/${returnId}/pickup`);
      fetchPickups();
      setConfirm(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to mark pickup');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (returnId) => {
    setActionLoading(returnId);
    try {
      const { data } = await API.put(`/returns/${returnId}/complete`);
      alert(data.message); // shows refund + earning summary
      fetchPickups();
      setConfirm(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to complete return');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (returns.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
        <div className="text-5xl mb-3">🔄</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No return pickups</h3>
        <p className="text-gray-500 text-sm">Return jobs assigned to you will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
        <p className="text-sm text-amber-800">
          🔄 <strong>Return pickups</strong> — collect the item FROM the customer, then deliver it TO the seller. You earn Rs 50 per completed return.
        </p>
      </div>

      <div className="space-y-4">
        {returns.map((r) => (
          <div key={r._id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Return for Order</p>
                <p className="text-sm font-mono font-medium text-gray-700">
                  #{r.order?._id?.slice(-8).toUpperCase()}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium
                ${r.status === 'approved' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {r.status === 'approved' ? '📦 Awaiting Pickup' : '🚚 In Transit to Seller'}
              </span>
            </div>

            <div className="p-5">
              {/* Items */}
              <div className="space-y-2 mb-4">
                {r.items.map((item, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <img src={item.image} alt={item.name}
                      className="w-12 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reason */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-400">Return reason</p>
                <p className="text-sm text-gray-700">{r.reason}</p>
              </div>

              {/* Pickup FROM customer / Deliver TO seller */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">📦 Collect FROM (Customer)</p>
                  <p className="text-xs font-medium text-blue-800">
                    {r.customer?.firstName} {r.customer?.lastName}
                  </p>
                  <p className="text-xs text-blue-600">{r.customer?.phone}</p>
                  {r.order?.deliveryAddress && (
                    <p className="text-xs text-blue-600">
                      {r.order.deliveryAddress.street}, {r.order.deliveryAddress.city}
                    </p>
                  )}
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-700 mb-1">🏪 Deliver TO (Seller)</p>
                  {r.order?.pickupAddress?.shopName ? (
                    <>
                      <p className="text-xs font-medium text-green-800">{r.order.pickupAddress.shopName}</p>
                      <p className="text-xs text-green-600">
                        {r.order.pickupAddress.street}, {r.order.pickupAddress.city}
                      </p>
                      {r.order.pickupAddress.phone && (
                        <p className="text-xs text-green-600">📞 {r.order.pickupAddress.phone}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-green-600">Seller address on file</p>
                  )}
                </div>
              </div>

              {/* Earning + action */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div>
                  <span className="text-xs text-gray-400">Your earning: </span>
                  <span className="text-sm font-bold text-green-600">Rs {r.returnAgentEarning || 50}</span>
                </div>
                {r.status === 'approved' ? (
                  <button
                    onClick={() => setConfirm({ type: 'pickup', return: r })}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-all"
                  >
                    ✓ Mark Picked Up
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirm({ type: 'complete', return: r })}
                    className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-4 py-2 rounded-lg transition-all"
                  >
                    ✓ Returned to Seller
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="text-4xl text-center mb-3">
              {confirm.type === 'pickup' ? '📦' : '🏪'}
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
              {confirm.type === 'pickup' ? 'Confirm Pickup' : 'Confirm Return to Seller'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-5">
              {confirm.type === 'pickup'
                ? 'Confirm you have collected the item from the customer.'
                : 'Confirm you have delivered the item to the seller. This completes the return and processes the customer refund.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => confirm.type === 'pickup'
                  ? handlePickup(confirm.return._id)
                  : handleComplete(confirm.return._id)}
                disabled={actionLoading === confirm.return._id}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
              >
                {actionLoading === confirm.return._id ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnPickups;