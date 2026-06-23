import { useState, useEffect } from 'react';
import API from '../../utils/api';

const statusColors = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-yellow-100 text-yellow-700',
  rejected:  'bg-red-100 text-red-700',
  suspended: 'bg-gray-100 text-gray-700',
};

const roleColors = {
  customer: 'bg-blue-100 text-blue-700',
  seller:   'bg-green-100 text-green-700',
  delivery: 'bg-orange-100 text-orange-700',
  admin:    'bg-purple-100 text-purple-700',
};

const UserManagement = () => {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [roleFilter, setRoleFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected]   = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [activeSubTab, setActiveSubTab]   = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/users');
      setUsers(data.users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (userId, action) => {
    setActionLoading(userId + '_' + action);
    try {
      if (action === 'delete') {
        await API.delete(`/admin/users/${userId}`);
        setConfirmDelete(null);
        setSelected(null);
      } else {
        await API.put(`/admin/users/${userId}/${action}`);
      }
      fetchUsers();
      if (selected?._id === userId) setSelected(null);
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} user`);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter logic
  const filtered = users.filter(u => {
    if (u.role === 'admin') return false;

    const matchSearch = !search || [u.firstName, u.lastName, u.email, u.phone, u.shopName]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()));

    const matchRole   = !roleFilter   || u.role   === roleFilter;
    const matchStatus = !statusFilter || u.status === statusFilter;

    const matchTab = activeSubTab === 'all'      ? true
      : activeSubTab === 'pending'   ? u.status === 'pending'
      : activeSubTab === 'suspended' ? u.status === 'suspended'
      : activeSubTab === 'rejected'  ? u.status === 'rejected'
      : true;

    return matchSearch && matchRole && matchStatus && matchTab;
  });

  const counts = {
    all:       users.filter(u => u.role !== 'admin').length,
    pending:   users.filter(u => u.status === 'pending').length,
    suspended: users.filter(u => u.status === 'suspended').length,
    rejected:  users.filter(u => u.status === 'rejected').length,
  };

  const getActionButtons = (user) => {
    const buttons = [];

    if (user.status === 'pending') {
      buttons.push({ label: '✓ Approve',      action: 'approve',    style: 'bg-green-600 hover:bg-green-700 text-white' });
      buttons.push({ label: '✕ Reject',       action: 'reject',     style: 'bg-red-50 hover:bg-red-100 text-red-600' });
    }
    if (user.status === 'rejected') {
      buttons.push({ label: '↩ Move to Pending', action: 'undoreject', style: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600' });
    }
    if (user.status === 'active') {
      buttons.push({ label: '🚫 Suspend',     action: 'suspend',    style: 'bg-orange-50 hover:bg-orange-100 text-orange-600' });
    }
    if (user.status === 'suspended') {
      buttons.push({ label: '✓ Reactivate',   action: 'reactivate', style: 'bg-green-50 hover:bg-green-100 text-green-600' });
    }
    buttons.push({ label: '🗑️ Delete',        action: 'delete',     style: 'bg-red-50 hover:bg-red-100 text-red-600' });

    return buttons;
  };

  return (
    <div>
      {/* Sub tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5 w-fit">
        {[
          { key: 'all',       label: `All (${counts.all})` },
          { key: 'pending',   label: `Pending (${counts.pending})` },
          { key: 'suspended', label: `Suspended (${counts.suspended})` },
          { key: 'rejected',  label: `Rejected (${counts.rejected})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all
              ${activeSubTab === tab.key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by name, email, phone, shop..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
        >
          <option value="">All Roles</option>
          <option value="customer">Customer</option>
          <option value="seller">Seller</option>
          <option value="delivery">Delivery</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 bg-white"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
        {(search || roleFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:border-gray-300 transition-all"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-gray-400 mb-3">
        Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''}
      </p>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3">👥</div>
            <p className="font-medium">No users found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['User', 'Role', 'Status', 'Details', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                  {/* User */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm flex-shrink-0">
                        {u.firstName?.charAt(0)}{u.lastName?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                        <p className="text-xs text-gray-400">{u.phone}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[u.role]}`}>
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[u.status]}`}>
                      {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                    </span>
                  </td>

                  {/* Details */}
                  <td className="px-4 py-4 text-xs text-gray-500">
                    {u.role === 'seller' && (
                      <div>
                        <p className="font-medium text-gray-700">{u.shopName}</p>
                        <p className="text-gray-400">PAN: {u.panNumber}</p>
                      </div>
                    )}
                    {u.role === 'delivery' && (
                      <div>
                        <p className="font-medium text-gray-700">{u.vehicleType}</p>
                        <p className="text-gray-400">ID: {u.citizenshipNumber}</p>
                      </div>
                    )}
                    {u.role === 'customer' && (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>

                  {/* Joined */}
                  <td className="px-4 py-4 text-xs text-gray-400">
                    {new Date(u.createdAt).toLocaleDateString('en-NP', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-4">
                    <button
                      onClick={() => setSelected(u)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 border border-indigo-200 rounded-lg hover:border-indigo-300 transition-all"
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* User management modal */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl max-h-screen overflow-y-auto">

            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900">Manage User</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            {/* User info */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                {selected.firstName?.charAt(0)}{selected.lastName?.charAt(0)}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">{selected.firstName} {selected.lastName}</h4>
                <p className="text-sm text-gray-500">{selected.email}</p>
                <div className="flex gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[selected.role]}`}>
                    {selected.role}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[selected.status]}`}>
                    {selected.status}
                  </span>
                </div>
              </div>
            </div>

            {/* User details */}
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Phone</span>
                <span className="font-medium text-gray-700">{selected.phone}</span>
              </div>
              {selected.role === 'seller' && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Shop</span>
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
                        {selected.shopAddress.street}, {selected.shopAddress.city}
                      </span>
                    </div>
                  )}
                </>
              )}
              {selected.role === 'delivery' && (
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

                {/* Payout details */}
                {(selected.role === 'seller' || selected.role === 'delivery') &&
                selected.payoutDetails?.preferredMethod && (
                <>
                    <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Payout Details</p>
                    </div>
                    <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Method</span>
                    <span className="font-medium text-gray-700 capitalize">
                        {selected.payoutDetails.preferredMethod}
                    </span>
                    </div>
                    {selected.payoutDetails.preferredMethod === 'bank' && (
                    <>
                        <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Bank</span>
                        <span className="font-medium text-gray-700">{selected.payoutDetails.bankName}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Account No.</span>
                        <span className="font-medium text-gray-700">{selected.payoutDetails.accountNumber}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Holder</span>
                        <span className="font-medium text-gray-700">{selected.payoutDetails.accountHolderName}</span>
                        </div>
                    </>
                    )}
                    {selected.payoutDetails.preferredMethod === 'khalti' && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Khalti No.</span>
                        <span className="font-medium text-gray-700">{selected.payoutDetails.khaltiNumber}</span>
                    </div>
                    )}
                    {selected.payoutDetails.preferredMethod === 'esewa' && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">eSewa No.</span>
                        <span className="font-medium text-gray-700">{selected.payoutDetails.esewaNumber}</span>
                    </div>
                    )}
                </>
                )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Joined</span>
                <span className="font-medium text-gray-700">
                  {new Date(selected.createdAt).toLocaleDateString('en-NP', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              {getActionButtons(selected).map((btn) => (
                <button
                  key={btn.action}
                  onClick={() => {
                    if (btn.action === 'delete') {
                      setConfirmDelete(selected);
                    } else {
                      handleAction(selected._id, btn.action);
                    }
                  }}
                  disabled={actionLoading === selected._id + '_' + btn.action}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 ${btn.style}`}
                >
                  {actionLoading === selected._id + '_' + btn.action
                    ? 'Processing...'
                    : btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="text-3xl text-center mb-3">🗑️</div>
            <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Delete Account?</h3>
            <p className="text-sm text-gray-500 text-center mb-2">
              You are about to permanently delete:
            </p>
            <p className="text-sm font-semibold text-gray-900 text-center mb-1">
              {confirmDelete.firstName} {confirmDelete.lastName}
            </p>
            <p className="text-xs text-gray-400 text-center mb-5">
              {confirmDelete.email}
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-5">
              <p className="text-xs text-red-700 text-center">
                ⚠️ This action cannot be undone. All data associated with this account will be permanently removed.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:border-gray-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(confirmDelete._id, 'delete')}
                disabled={actionLoading === confirmDelete._id + '_delete'}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium py-2.5 transition-all"
              >
                {actionLoading === confirmDelete._id + '_delete' ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;