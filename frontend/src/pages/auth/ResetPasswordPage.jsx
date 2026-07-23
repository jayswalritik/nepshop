import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import API from '../../utils/api';

// Inline eye / eye-off toggle icon — frontend has no icon library, so this
// reuses AdminLoginPage.jsx's SVG (matching mobile login.js's Ionicons look)
// rather than adding a dependency. `off` = password currently visible.
const EyeIcon = ({ off }) => (
  off ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  )
);

const ResetPasswordPage = () => {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const [searchParams] = useSearchParams();
  // Preserve the app-origin marker so "request a new one" lands on a
  // forgot-password page that filters roles to the app's supported set.
  const forgotPath = searchParams.get('client') === 'app'
    ? '/forgot-password?client=app'
    : '/forgot-password';
  // App-originated resets get an "open the app" CTA on success (with a web
  // fallback beneath). Web-originated resets are left exactly as before.
  const isApp = searchParams.get('client') === 'app';
  const [formData, setFormData]   = useState({ password: '', confirmPassword: '' });
  const [showPw, setShowPw]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
              {isApp ? (
                <>
                  {/* Non-http scheme → must be a plain anchor; a React Router
                      Link would try to route it in-app. Matches the app's
                      deep-link precedent (nepshop://payment/... in
                      MobileReturn.jsx / app.json scheme "nepshop"). */}
                  <a
                    href="nepshop://login"
                    className="block w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all text-sm"
                  >
                    Open the NepShop app →
                  </a>
                  <button
                    onClick={() => navigate('/login')}
                    className="mt-4 text-indigo-600 font-medium hover:underline text-xs"
                  >
                    Or continue signing in on the web
                  </button>
                </>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all text-sm"
                >
                  Go to Sign in →
                </button>
              )}
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
                          onClick={() => navigate(forgotPath)}
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
                    <EyeIcon off={showPw} />
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              {/* Confirm password */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      setErrors({ ...errors, confirmPassword: '' });
                    }}
                    placeholder="Repeat your new password"
                    className={`w-full px-3 py-2.5 pr-10 border rounded-lg text-sm outline-none transition-all
                      ${errors.confirmPassword ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <EyeIcon off={showConfirm} />
                  </button>
                </div>
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