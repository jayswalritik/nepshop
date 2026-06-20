import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
    setApiError('');
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email))
      newErrors.email = 'Valid email is required';
    if (!formData.password)
      newErrors.password = 'Password is required';
    return newErrors;
  };

  const handleLogin = async () => {
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setLoading(true);
    setApiError('');
    try {
      const { data } = await API.post('/auth/login', {
        email: formData.email,
        password: formData.password,
        role: 'admin',
      });
      login(data.user, data.token);
      navigate('/admin/dashboard');
    } catch (err) {
      setApiError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white text-xl font-bold">N</div>
          <span className="text-white text-2xl font-bold">
            Nep<span className="text-orange-400">Shop</span>
            <span className="text-gray-500 text-base font-normal ml-2">Admin</span>
          </span>
        </div>

        {/* Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">

          <div className="mb-6">
            <h2 className="text-xl font-bold text-white">Admin sign in</h2>
            <p className="text-gray-500 text-sm mt-1">Restricted access — authorized personnel only</p>
          </div>

          {/* API Error */}
          {apiError && (
            <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-sm text-red-400 mb-4 flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{apiError}</span>
            </div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-400 mb-1">Email address</label>
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="admin@nepshop.com"
              className={`w-full px-3 py-2.5 bg-gray-800 border rounded-lg text-sm text-white placeholder-gray-600 outline-none transition-all
                ${errors.email ? 'border-red-500' : 'border-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-900'}`}
            />
            {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
          </div>

          {/* Password */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
            <div className="relative">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                placeholder="Your password"
                className={`w-full px-3 py-2.5 pr-10 bg-gray-800 border rounded-lg text-sm text-white placeholder-gray-600 outline-none transition-all
                  ${errors.password ? 'border-red-500' : 'border-gray-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-900'}`}
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
          </div>

          {/* Submit */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-all text-sm"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Signing in...
              </span>
            ) : 'Sign in to Admin Panel'}
          </button>

          {/* Back link */}
          <p className="text-center text-sm text-gray-600 mt-5">
            Not an admin?{' '}
            <a href="/login" className="text-indigo-400 hover:underline">Go to main login</a>
          </p>
        </div>

        {/* Security note */}
        <p className="text-center text-xs text-gray-700 mt-4">
          🔒 All admin actions are logged and monitored
        </p>
      </div>
    </div>
  );
};

export default AdminLoginPage;