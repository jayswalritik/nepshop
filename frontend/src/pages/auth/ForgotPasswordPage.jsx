import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../utils/api';

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [role, setRole]       = useState('customer');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState('');

  const roles = [
    { key: 'customer', label: 'Customer',       icon: '🛍️' },
    { key: 'seller',   label: 'Seller',          icon: '🏪' },
    { key: 'delivery', label: 'Delivery Agent',  icon: '🚚' },
    { key: 'admin',    label: 'Admin',            icon: '🛡️' },
  ];

  const handleSubmit = async () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await API.post('/auth/forgot-password', { email, role });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center text-white font-bold">N</div>
          <span className="font-bold text-gray-900 text-xl">Nep<span className="text-orange-500">Shop</span></span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">

          {sent ? (
            /* Success state */
            <div className="text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">📧</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Check your email</h2>
              <p className="text-gray-500 text-sm mb-2">
                If an account with <strong>{email}</strong> exists, we've sent a password reset link.
              </p>
              <p className="text-gray-400 text-xs mb-6">
                The link expires in 15 minutes. Check your spam folder if you don't see it.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all text-sm"
              >
                Back to Sign in
              </button>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="w-full mt-3 text-sm text-indigo-600 hover:underline font-medium"
              >
                Try a different email
              </button>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Forgot password?</h2>
                <p className="text-gray-500 text-sm">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4 flex gap-2">
                  <span>⚠️</span> {error}
                </div>
              )}

              {/* Role selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  I am a:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {roles.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRole(r.key)}
                      className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all
                        ${role === r.key
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >
                      <span>{r.icon}</span> {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Sending...
                  </>
                ) : '📧 Send Reset Link'}
              </button>

              <p className="text-center text-sm text-gray-500 mt-5">
                Remember your password?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  Sign in
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;