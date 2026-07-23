import { useState } from 'react';
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

// Self-contained "Change Password" card, mounted on the customer profile,
// seller settings, and delivery profile pages. Takes no per-role props — it
// acts on the logged-in user via the role-agnostic, protected endpoint
// PUT /api/auth/change-password (token attached automatically by utils/api).
//
// Client-side validation mirrors ResetPasswordPage (min 8 / ≥1 uppercase /
// ≥1 number) as a convenience only; the backend remains the validation
// authority, so a failed request always surfaces the server's message (e.g.
// a 401 clearly says the current password is incorrect).
const ChangePasswordForm = () => {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword:     '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError]     = useState('');
  const [errors, setErrors]   = useState({});

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
    setError('');
    setSuccess('');
  };

  const validate = () => {
    const errs = {};
    if (!formData.currentPassword) errs.currentPassword = 'Current password is required';

    if (!formData.newPassword || formData.newPassword.length < 8)
      errs.newPassword = 'Password must be at least 8 characters';
    else if (!/[A-Z]/.test(formData.newPassword))
      errs.newPassword = 'Password must contain at least one uppercase letter';
    else if (!/[0-9]/.test(formData.newPassword))
      errs.newPassword = 'Password must contain at least one number';
    else if (formData.newPassword === formData.currentPassword)
      errs.newPassword = 'New password must be different from your current password';

    if (formData.newPassword !== formData.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';

    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Never send confirmPassword — the backend only takes currentPassword +
      // newPassword. The session intentionally stays valid: no logout, no
      // redirect, no token/auth-context changes here.
      await API.put('/auth/change-password', {
        currentPassword: formData.currentPassword,
        newPassword:     formData.newPassword,
      });
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess('Password changed successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (hasError) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
      ${hasError ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
      <h3 className="font-semibold text-gray-900 mb-1">Change Password</h3>
      <p className="text-sm text-gray-400 mb-5">
        Choose a strong password with at least 8 characters, one uppercase letter, and one number
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

      <div className="space-y-4">
        {/* Current password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              placeholder="Enter your current password"
              className={`${inputClass(errors.currentPassword)} pr-10`}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <EyeIcon off={showCurrent} />
            </button>
          </div>
          {errors.currentPassword && <p className="text-red-500 text-xs mt-1">{errors.currentPassword}</p>}
        </div>

        {/* New password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="Min. 8 chars, 1 uppercase, 1 number"
              className={`${inputClass(errors.newPassword)} pr-10`}
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <EyeIcon off={showNew} />
            </button>
          </div>
          {errors.newPassword && <p className="text-red-500 text-xs mt-1">{errors.newPassword}</p>}
        </div>

        {/* Confirm new password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Repeat your new password"
              className={`${inputClass(errors.confirmPassword)} pr-10`}
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
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full mt-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Changing...
          </>
        ) : '🔐 Change Password'}
      </button>
    </div>
  );
};

export default ChangePasswordForm;
