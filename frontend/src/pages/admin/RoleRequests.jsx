import { useState, useEffect } from 'react';
import API from '../../utils/api';

const roleColors = {
  seller:   'bg-green-100 text-green-700',
  delivery: 'bg-orange-100 text-orange-700',
};

const RoleRequests = () => {
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/role-requests');
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to fetch role requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (userId, action) => {
    setActionLoading(userId + '_' + action);
    try {
      await API.put(`/auth/role-request/${userId}/${action}`);
      fetchRequests();
      setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} request`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        {users.length} pending role request{users.length !== 1 ? 's' : ''}
      </p>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-medium">No pending role requests</p>
            <p className="text-sm mt-1">When customers apply to become sellers or delivery agents, they'll appear here</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['User', 'Existing Roles', 'Requesting', 'Applied', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                        {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                        <p className="text-xs text-gray-400">{u.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {(u.roles || [u.role]).map(r => (
                        <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[u.pendingRoleRequest?.role]}`}>
                      {u.pendingRoleRequest?.role}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-xs text-gray-400">
                    {u.pendingRoleRequest?.requestedAt
                      ? new Date(u.pendingRoleRequest.requestedAt).toLocaleDateString('en-NP', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      onClick={() => setSelected(u)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
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
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-screen overflow-y-auto">

            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Review Role Request</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                {selected.firstName?.charAt(0)}{selected.lastName?.charAt(0)}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">{selected.firstName} {selected.lastName}</h4>
                <p className="text-sm text-gray-500">{selected.email}</p>
                <p className="text-sm text-gray-500">{selected.phone}</p>
              </div>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4 text-center">
              <p className="text-xs text-indigo-500 uppercase font-semibold mb-1">Applying to become</p>
              <p className="text-lg font-bold text-indigo-700 capitalize">{selected.pendingRoleRequest?.role}</p>
            </div>

            {/* Submitted info */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Submitted Information</p>
              {selected.pendingRoleRequest?.role === 'seller' && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Shop Name</span>
                    <span className="font-medium text-gray-700">{selected.shopName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">PAN</span>
                    <span className="font-medium text-gray-700">{selected.panNumber}</span>
                  </div>
                  {selected.shopAddress?.street && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Address</span>
                      <span className="font-medium text-gray-700 text-right">
                        {selected.shopAddress.street}, {selected.shopAddress.city}, {selected.shopAddress.district}
                      </span>
                    </div>
                  )}
                  {selected.shopAddress?.phone && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Shop Phone</span>
                      <span className="font-medium text-gray-700">{selected.shopAddress.phone}</span>
                    </div>
                  )}
                </>
              )}
              {selected.pendingRoleRequest?.role === 'delivery' && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Vehicle</span>
                    <span className="font-medium text-gray-700">{selected.vehicleType}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Citizenship</span>
                    <span className="font-medium text-gray-700">{selected.citizenshipNumber}</span>
                  </div>
                </>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-5">
              <p className="text-xs text-amber-700">
                ℹ️ Approving adds the <strong>{selected.pendingRoleRequest?.role}</strong> role to this user's account. They keep their existing roles and can switch between them.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleAction(selected._id, 'reject')}
                disabled={actionLoading}
                className="flex-1 bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 font-medium py-2.5 rounded-xl text-sm transition-all"
              >
                {actionLoading === selected._id + '_reject' ? 'Processing...' : '✕ Reject'}
              </button>
              <button
                onClick={() => handleAction(selected._id, 'approve')}
                disabled={actionLoading}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-xl text-sm transition-all"
              >
                {actionLoading === selected._id + '_approve' ? 'Processing...' : '✓ Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleRequests;