import { useState, useEffect } from 'react';
import API from '../../utils/api';

const statusColors = {
  pending:   'bg-yellow-100 text-yellow-700',
  approved:  'bg-blue-100 text-blue-700',
  picked_up: 'bg-purple-100 text-purple-700',
  refunded:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
};

// Suggested fault based on return reason
const faultSuggestion = {
  'Damaged product':          'seller',
  'Wrong product delivered':  'seller',
  'Product not as described':  'seller',
  'Changed my mind':           'customer',
  'Better price available':    'customer',
  'Other':                     null,
};

const ReturnsManagement = () => {
  const [returns, setReturns]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('pending');
  const [selected, setSelected] = useState(null);
  const [adminNote, setAdminNote]       = useState('');
  const [refundMethod, setRefundMethod] = useState('original_payment');
  const [fault, setFault]               = useState('');
  const [returnAgent, setReturnAgent]   = useState('');
  const [agents, setAgents]             = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchReturns();
    fetchAgents();
  }, [filter]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.append('status', filter);
      const { data } = await API.get(`/returns?${params}`);
      setReturns(data.returns);
    } catch (err) {
      console.error('Failed to fetch returns:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const { data } = await API.get('/admin/delivery-agents');
      setAgents(data.agents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  };

  // When opening a return, pre-fill the fault suggestion
  const openReturn = (r) => {
    setSelected(r);
    setAdminNote('');
    setRefundMethod('original_payment');
    setReturnAgent('');
    setFault(faultSuggestion[r.reason] || '');
  };

  const handleApprove = async () => {
    if (!fault) { alert('Please confirm who is at fault'); return; }
    if (!returnAgent) { alert('Please assign a pickup agent'); return; }
    setActionLoading(true);
    try {
      await API.put(`/returns/${selected._id}/process`, {
        status: 'approved',
        adminNote,
        refundMethod,
        fault,
        returnAgentId: returnAgent,
      });
      fetchReturns();
      setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to approve return');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      await API.put(`/returns/${selected._id}/process`, {
        status: 'rejected',
        adminNote,
      });
      fetchReturns();
      setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to reject return');
    } finally {
      setActionLoading(false);
    }
  };

  // Refund preview based on fault
  const refundPreview = () => {
    if (!selected) return null;
    const total    = selected.order?.total || 0;
    const subtotal = total - 100; // delivery was 100 (or 0 for free delivery; simplified for preview)
    if (fault === 'seller') {
      return { customerGets: total, note: 'Full refund (seller at fault — customer pays nothing).' };
    }
    if (fault === 'customer') {
      const refund = Math.max(0, subtotal - 50 - 50); // product − forward delivery − return pickup
      return { customerGets: refund, note: 'Product price minus both delivery legs (customer\'s choice).' };
    }
    return null;
  };

  const preview = refundPreview();

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit flex-wrap">
        {[
          { key: 'pending',   label: 'Pending' },
          { key: 'approved',  label: 'In Pickup' },
          { key: 'picked_up', label: 'In Transit' },
          { key: 'refunded',  label: 'Refunded' },
          { key: 'rejected',  label: 'Rejected' },
          { key: '',          label: 'All' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all
              ${filter === tab.key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : returns.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">🔄</div>
            <p className="font-medium">No return requests</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Customer', 'Order', 'Reason', 'Refund Amount', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {returns.map((r) => (
                <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {r.customer?.firstName} {r.customer?.lastName}
                    </p>
                    <p className="text-xs text-gray-400">{r.customer?.phone}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-mono text-gray-700">
                      #{r.order?._id?.slice(-8).toUpperCase()}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-gray-700">{r.reason}</p>
                    {r.fault && (
                      <p className="text-xs text-gray-400">Fault: {r.fault}</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-semibold text-gray-900">
                      Rs {r.refundAmount?.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[r.status]}`}>
                      {r.status.replace('_', ' ').charAt(0).toUpperCase() + r.status.replace('_', ' ').slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-400">
                    {new Date(r.createdAt).toLocaleDateString('en-NP', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => openReturn(r)}
                      className="text-xs text-indigo-600 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-xl max-h-screen overflow-y-auto">

            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Review Return Request</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* Customer */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</p>
              <p className="text-sm font-medium text-gray-900">
                {selected.customer?.firstName} {selected.customer?.lastName}
              </p>
              <p className="text-sm text-gray-500">{selected.customer?.email}</p>
              <p className="text-sm text-gray-500">{selected.customer?.phone}</p>
            </div>

            {/* Return details */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Return Details</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Order ID</span>
                  <span className="font-mono font-medium">
                    #{selected.order?._id?.slice(-8).toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reason</span>
                  <span className="font-medium text-gray-700">{selected.reason}</span>
                </div>
                {selected.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Details</span>
                    <span className="text-gray-700 text-right max-w-48">{selected.description}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Order Total</span>
                  <span className="font-medium">Rs {selected.order?.total?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment Method</span>
                  <span className="font-medium">
                    {selected.order?.paymentMethod?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Items</p>
              <div className="space-y-2">
                {selected.items.map((item, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <img src={item.image} alt={item.name}
                      className="w-10 h-10 object-cover rounded-lg border border-gray-100 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold">
                      Rs {(item.price * item.quantity).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {selected.status === 'pending' && (
              <>
                {/* FAULT SELECTOR */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Who is at fault? <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFault('seller')}
                      className={`p-3 border rounded-xl text-left transition-all
                        ${fault === 'seller' ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="text-sm font-semibold text-gray-900">🏪 Seller</p>
                      <p className="text-xs text-gray-500">Damaged / wrong / not as described</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFault('customer')}
                      className={`p-3 border rounded-xl text-left transition-all
                        ${fault === 'customer' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className="text-sm font-semibold text-gray-900">🛍️ Customer</p>
                      <p className="text-xs text-gray-500">Changed mind / better price</p>
                    </button>
                  </div>
                  {faultSuggestion[selected.reason] && (
                    <p className="text-xs text-gray-400 mt-1">
                      Suggested based on reason: <strong>{faultSuggestion[selected.reason]}</strong>
                    </p>
                  )}
                </div>

                {/* REFUND PREVIEW */}
                {preview && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4">
                    <p className="text-sm font-semibold text-indigo-900">
                      Customer will be refunded: Rs {preview.customerGets.toLocaleString()}
                    </p>
                    <p className="text-xs text-indigo-700 mt-1">{preview.note}</p>
                  </div>
                )}

                {/* PICKUP AGENT */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign Pickup Agent <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={returnAgent}
                    onChange={(e) => setReturnAgent(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="">Select agent for return pickup</option>
                    {agents.map((a) => (
                      <option key={a._id} value={a._id}>
                        {a.firstName} {a.lastName} — {a.vehicleType}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Agent collects from customer → delivers to seller. Earns Rs 50.
                  </p>
                </div>

                {/* Refund method */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Refund Method</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="original_payment">Original Payment Method</option>
                    <option value="khalti">Khalti</option>
                    <option value="esewa">eSewa</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>

                {/* Admin note */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Note to customer (optional)
                  </label>
                  <textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Explain your decision..."
                    rows={2}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 font-medium py-2.5 rounded-xl text-sm transition-all"
                  >
                    ✕ Reject
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition-all"
                  >
                    {actionLoading ? 'Processing...' : '✓ Approve & Assign Pickup'}
                  </button>
                </div>
              </>
            )}

            {selected.status !== 'pending' && (
              <div className={`rounded-xl p-4 ${statusColors[selected.status]}`}>
                <p className="text-sm font-medium">
                  Status: {selected.status.replace('_', ' ')}
                </p>
                {selected.fault && <p className="text-sm mt-1">Fault: {selected.fault}</p>}
                {selected.adminNote && <p className="text-sm mt-1">{selected.adminNote}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnsManagement;