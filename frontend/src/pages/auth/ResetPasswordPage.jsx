import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import API from '../../utils/api';

const ResetPasswordPage = () => {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const [formData, setFormData]   = useState({ password: '', confirmPassword: '' });
  const [showPw, setShowPw]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');
  const [errors, setErrors]       = useState({});

  const validate = () => {
    const errs = {};
    if (!formData.password || formData.password.length < 8)
      errs.password = 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(formData.password))
      errs.password = 'Password must contain at least one uppercase letter';
    if (!/[0-9]/.test(formData.password))
      errs.password = 'Password must contain at least one number';
    if (formData.password !== formData.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setError('');

    try {
      await API.put(`/auth/reset-password/${token}`, {
        password: formData.password,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. The link may have expired.');
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

          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✅</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Password Reset!</h2>
              <p className="text-gray-500 text-sm mb-6">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all text-sm"
              >
                Go to Sign in →
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Set new password</h2>
                <p className="text-gray-500 text-sm">
                  Choose a strong password with at least 8 characters, one uppercase letter, and one number.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4 flex gap-2">
                  <span>⚠️</span>
                  <div>
                    {error}
                    {error.includes('expired') && (
                      <div className="mt-2">
                        <button
                          onClick={() => navigate('/forgot-password')}
                          className="text-indigo-600 font-medium hover:underline text-xs"
                        >
                          Request a new reset link →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* New password */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      setErrors({ ...errors, password: '' });
                    }}
                    placeholder="Min. 8 chars, 1 uppercase, 1 number"
                    className={`w-full px-3 py-2.5 pr-10 border rounded-lg text-sm outline-none transition-all
                      ${errors.password ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              {/* Confirm password */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    setErrors({ ...errors, confirmPassword: '' });
                  }}
                  placeholder="Repeat your new password"
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                    ${errors.confirmPassword ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                />
                {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
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
                    Resetting...
                  </>
                ) : '🔐 Reset Password'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;