import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('pending');
  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectedUsers, setRejectedUsers] = useState([]);
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalSellers: 0,
    totalDelivery: 0,
    pendingApprovals: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/admin/users');
      const users = data.users;
      setAllUsers(users);
      setPendingUsers(users.filter(u => u.status === 'pending'));
      setRejectedUsers(users.filter(u => u.status === 'rejected'));
      setStats({
        totalCustomers:   users.filter(u => u.role === 'customer').length,
        totalSellers:     users.filter(u => u.role === 'seller').length,
        totalDelivery:    users.filter(u => u.role === 'delivery').length,
        pendingApprovals: users.filter(u => u.status === 'pending').length,
      });
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    setActionLoading(userId + '_approve');
    try {
      await API.put(`/admin/users/${userId}/approve`);
      fetchData();
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId) => {
    setActionLoading(userId + '_reject');
    try {
      await API.put(`/admin/users/${userId}/reject`);
      fetchData();
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUndoReject = async (userId) => {
  setActionLoading(userId + '_undo');
  try {
    await API.put(`/admin/users/${userId}/undoreject`);
    fetchData();
  } catch (err) {
    console.error('Undo reject failed:', err);
  } finally {
    setActionLoading(null);
  }
};

  const getRoleBadge = (role) => {
    const styles = {
      customer: 'bg-blue-100 text-blue-700',
      seller:   'bg-green-100 text-green-700',
      delivery: 'bg-orange-100 text-orange-700',
      admin:    'bg-purple-100 text-purple-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[role]}`}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      active:    'bg-green-100 text-green-700',
      pending:   'bg-yellow-100 text-yellow-700',
      rejected:  'bg-red-100 text-red-700',
      suspended: 'bg-gray-100 text-gray-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const statCards = [
    { label: 'Total Customers',   value: stats.totalCustomers,   icon: '🛍️', color: 'bg-blue-50 border-blue-100' },
    { label: 'Total Sellers',     value: stats.totalSellers,     icon: '🏪', color: 'bg-green-50 border-green-100' },
    { label: 'Delivery Agents',   value: stats.totalDelivery,    icon: '🚚', color: 'bg-orange-50 border-orange-100' },
    { label: 'Pending Approvals', value: stats.pendingApprovals, icon: '⏳', color: 'bg-yellow-50 border-yellow-100' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Navbar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">N</div>
          <span className="font-bold text-gray-900">NepShop <span className="text-gray-400 font-normal">Admin</span></span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            👋 {user?.firstName} {user?.lastName}
          </span>
          <button
            onClick={logout}
            className="text-sm bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg transition-all font-medium"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Manage users, approvals, and platform settings</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((s) => (
            <div key={s.label} className={`border rounded-xl p-5 ${s.color}`}>
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
          {[
                { key: 'pending',  label: `Pending (${stats.pendingApprovals})` },
                { key: 'rejected', label: `Rejected (${rejectedUsers.length})` },
                { key: 'all',      label: 'All Users' },
            ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all
                ${activeTab === tab.key
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
          ) : (

            <>
              {/* Pending tab */}
              {activeTab === 'pending' && (
                <>
                  {pendingUsers.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <div className="text-4xl mb-3">✅</div>
                      <p className="font-medium">No pending approvals</p>
                      <p className="text-sm mt-1">All accounts are reviewed</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          {['Name', 'Email', 'Role', 'Details', 'Applied', 'Actions'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {pendingUsers.map((u) => (
                          <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-4">
                              <div className="font-medium text-gray-900 text-sm">{u.firstName} {u.lastName}</div>
                              <div className="text-gray-400 text-xs">{u.phone}</div>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">{u.email}</td>
                            <td className="px-4 py-4">{getRoleBadge(u.role)}</td>
                            <td className="px-4 py-4 text-sm text-gray-500">
                              {u.role === 'seller' && (
                                <div>
                                  <div className="text-xs font-medium text-gray-700">{u.shopName}</div>
                                  <div className="text-xs text-gray-400">PAN: {u.panNumber}</div>
                                </div>
                              )}
                              {u.role === 'delivery' && (
                                <div>
                                  <div className="text-xs font-medium text-gray-700">{u.vehicleType}</div>
                                  <div className="text-xs text-gray-400">ID: {u.citizenshipNumber}</div>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 text-xs text-gray-400">
                              {new Date(u.createdAt).toLocaleDateString('en-NP', {
                                day: 'numeric', month: 'short', year: 'numeric'
                              })}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApprove(u._id)}
                                  disabled={actionLoading === u._id + '_approve'}
                                  className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                                >
                                  {actionLoading === u._id + '_approve' ? '...' : '✓ Approve'}
                                </button>
                                <button
                                  onClick={() => handleReject(u._id)}
                                  disabled={actionLoading === u._id + '_reject'}
                                  className="bg-red-50 hover:bg-red-100 disabled:opacity-60 text-red-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                                >
                                  {actionLoading === u._id + '_reject' ? '...' : '✕ Reject'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {/* Rejected tab */}
{activeTab === 'rejected' && (
  <>
    {rejectedUsers.length === 0 ? (
      <div className="text-center py-16 text-gray-400">
        <div className="text-4xl mb-3">✅</div>
        <p className="font-medium">No rejected accounts</p>
      </div>
    ) : (
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {['Name', 'Email', 'Role', 'Details', 'Applied', 'Action'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rejectedUsers.map((u) => (
            <tr key={u._id} className="hover:bg-gray-50">
              <td className="px-4 py-4">
                <div className="font-medium text-gray-900 text-sm">{u.firstName} {u.lastName}</div>
                <div className="text-gray-400 text-xs">{u.phone}</div>
              </td>
              <td className="px-4 py-4 text-sm text-gray-600">{u.email}</td>
              <td className="px-4 py-4">{getRoleBadge(u.role)}</td>
              <td className="px-4 py-4 text-sm text-gray-500">
                {u.role === 'seller' && (
                  <div>
                    <div className="text-xs font-medium text-gray-700">{u.shopName}</div>
                    <div className="text-xs text-gray-400">PAN: {u.panNumber}</div>
                  </div>
                )}
                {u.role === 'delivery' && (
                  <div>
                    <div className="text-xs font-medium text-gray-700">{u.vehicleType}</div>
                    <div className="text-xs text-gray-400">ID: {u.citizenshipNumber}</div>
                  </div>
                )}
              </td>
              <td className="px-4 py-4 text-xs text-gray-400">
                {new Date(u.createdAt).toLocaleDateString('en-NP', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </td>
              <td className="px-4 py-4">
                <button
                  onClick={() => handleUndoReject(u._id)}
                  disabled={actionLoading === u._id + '_undo'}
                  className="bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 text-indigo-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
                >
                  {actionLoading === u._id + '_undo' ? '...' : '↩ Move to Pending'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </>
)}

              {/* All users tab */}
              {activeTab === 'all' && (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Name', 'Email', 'Phone', 'Role', 'Status', 'Joined'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allUsers.filter(u => u.role !== 'admin').map((u) => (
                      <tr key={u._id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-4">
                          <div className="font-medium text-gray-900 text-sm">{u.firstName} {u.lastName}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">{u.email}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">{u.phone}</td>
                        <td className="px-4 py-4">{getRoleBadge(u.role)}</td>
                        <td className="px-4 py-4">{getStatusBadge(u.status)}</td>
                        <td className="px-4 py-4 text-xs text-gray-400">
                          {new Date(u.createdAt).toLocaleDateString('en-NP', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;