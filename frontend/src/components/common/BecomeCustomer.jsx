import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

const BecomeCustomer = () => {
  const { user, login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const roles      = user?.roles && user.roles.length ? user.roles : [user?.role];
  const isCustomer = roles.includes('customer');
  const isAdmin    = roles.includes('admin');

  // Already a customer, or admin → don't show anything
  if (isCustomer || isAdmin) return null;

  const handleBecomeCustomer = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const { data } = await API.post('/auth/add-customer-role');
      const token = localStorage.getItem('nepshop_token');
      login(data.user, token);
      setSuccess(data.message || 'You can now shop on NepShop! Use the role switcher to start shopping.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to enable shopping');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
      <h3 className="font-semibold text-gray-900 mb-1">Start Shopping on NepShop</h3>
      <p className="text-sm text-gray-400 mb-5">
        Use the same account to shop as a customer — no approval needed
      </p>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 mb-4 flex items-center gap-2">
          <span>✅</span> {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4 flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {!success && (
        <button
          onClick={handleBecomeCustomer}
          disabled={loading}
          className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-green-300 hover:bg-green-50 transition-all text-left disabled:opacity-60"
        >
          <span className="text-2xl">🛍️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              {loading ? 'Enabling...' : 'Enable Shopping'}
            </p>
            <p className="text-xs text-gray-500">
              Instantly shop on NepShop with this account — activates immediately
            </p>
          </div>
          <span className="text-gray-400">→</span>
        </button>
      )}

      {success && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
          <p className="text-sm text-indigo-700">
            🛍️ Shopping enabled! Look for the role switcher to switch into Shopping mode anytime.
          </p>
        </div>
      )}
    </div>
  );
};

export default BecomeCustomer;