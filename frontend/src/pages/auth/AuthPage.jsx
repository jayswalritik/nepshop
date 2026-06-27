import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

const AuthPage = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [currentRole, setCurrentRole] = useState('customer');
  const [currentMode, setCurrentMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [success, setSuccess] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form fields
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    shopName: '',
    panNumber: '',
    shopStreet: '',
    shopCity: '',
    shopDistrict: '',
    shopPhone: '',
    vehicleType: '',
    citizenshipNumber: '',
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
    setApiError('');
  };

  const validate = () => {
    const newErrors = {};
    if (currentMode === 'signup') {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
      if (!formData.lastName.trim())  newErrors.lastName  = 'Last name is required';
      if (!formData.phone.trim())     newErrors.phone     = 'Phone number is required';
      if (currentRole === 'seller') {
        if (!formData.shopName.trim())    newErrors.shopName    = 'Shop name is required';
        if (!formData.panNumber.trim())   newErrors.panNumber   = 'PAN number is required';
        if (!formData.shopStreet.trim())  newErrors.shopStreet  = 'Shop street address is required';
        if (!formData.shopCity.trim())    newErrors.shopCity    = 'City is required';
        if (!formData.shopDistrict)       newErrors.shopDistrict = 'District is required';
        if (!formData.shopPhone.trim())   newErrors.shopPhone   = 'Shop contact number is required';
      }
      if (currentRole === 'delivery') {
        if (!formData.vehicleType)           newErrors.vehicleType        = 'Vehicle type is required';
        if (!formData.citizenshipNumber.trim()) newErrors.citizenshipNumber = 'Citizenship number is required';
      }
      if (!formData.password || formData.password.length < 8)
        newErrors.password = 'Password must be at least 8 characters';
      if (!/[A-Z]/.test(formData.password))
        newErrors.password = 'Password must contain at least one uppercase letter';
      if (!/[0-9]/.test(formData.password))
        newErrors.password = 'Password must contain at least one number';
      if (formData.password !== formData.confirmPassword)
        newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!formData.email || !/\S+@\S+\.\S+/.test(formData.email))
      newErrors.email = 'Valid email is required';
    if (!formData.password)
      newErrors.password = 'Password is required';
    return newErrors;
  };

  const redirectAfterLogin = (role) => {
    const map = {
      customer: '/customer/dashboard',
      seller:   '/seller/dashboard',
      delivery: '/delivery/dashboard',
      admin:    '/admin/dashboard',
    };
    navigate(map[role] || '/');
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
        role: currentRole,
      });
      login(data.user, data.token);
      redirectAfterLogin(data.user.activeRole || data.user.role);
    } catch (err) {
      setApiError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    setLoading(true);
    setApiError('');
    try {
      const payload = {
        firstName: formData.firstName,
        lastName:  formData.lastName,
        email:     formData.email,
        phone:     formData.phone,
        password:  formData.password,
        role:      currentRole,
        ...(currentRole === 'seller' && {
          shopName:  formData.shopName,
          panNumber: formData.panNumber,
          shopAddress: {
            street:   formData.shopStreet,
            city:     formData.shopCity,
            district: formData.shopDistrict,
            phone:    formData.shopPhone,
          },
        }),
        ...(currentRole === 'delivery' && {
          vehicleType:       formData.vehicleType,
          citizenshipNumber: formData.citizenshipNumber,
        }),
      };
      const { data } = await API.post('/auth/register', payload);
      if (data.token) {
        // Don't auto-login — show success and redirect to login
        setSuccess('Account created successfully! Please sign in with your credentials.');
      } else {
        setSuccess(data.message);
      }
    } catch (err) {
      setApiError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchRole = (role) => {
    setCurrentRole(role);
    setErrors({});
    setApiError('');
    setSuccess(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      shopName: '',
      panNumber: '',
      shopStreet: '',
      shopCity: '',
      shopDistrict: '',
      shopPhone: '',
      vehicleType: '',
      citizenshipNumber: '',
    });
  };

  const switchMode = (mode) => {
    setCurrentMode(mode);
    setErrors({});
    setApiError('');
    setSuccess(null);
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      shopName: '',
      panNumber: '',
      shopStreet: '',
      shopCity: '',
      shopDistrict: '',
      shopPhone: '',
      vehicleType: '',
      citizenshipNumber: '',
    });
  };

  const roles = [
    { key: 'customer', label: 'Customer', icon: '🛍️' },
    { key: 'seller',   label: 'Seller',   icon: '🏪' },
    { key: 'delivery', label: 'Delivery', icon: '🚚' },
  ];

  return (
    <div className="min-h-screen flex">

      {/* ── Left Panel ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-900 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500 opacity-20 rounded-full blur-3xl"></div>
          <div className="absolute top-0 right-0 w-72 h-72 bg-orange-500 opacity-10 rounded-full blur-3xl"></div>
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white text-xl font-bold">N</div>
          <span className="text-white text-2xl font-bold">Nep<span className="text-orange-400">Shop</span></span>
        </div>

        {/* Hero */}
        <div className="relative z-10">
          <p className="text-orange-400 text-sm font-semibold uppercase tracking-widest mb-4">Nepal's Smart Marketplace</p>
          <h1 className="text-white text-5xl font-bold leading-tight mb-6">
            Buy, sell &<br />deliver <span className="text-orange-400">smarter</span><br />across Nepal.
          </h1>
          <p className="text-indigo-300 text-base leading-relaxed mb-10 max-w-sm">
            AI-powered search, personalized recommendations, and real-time delivery tracking — built for Nepal.
          </p>
          <div className="flex gap-10">
            <div>
              <div className="text-white text-3xl font-bold">Khalti</div>
              <div className="text-indigo-400 text-sm mt-1">& eSewa payments</div>
            </div>
            <div>
              <div className="text-white text-3xl font-bold">AI</div>
              <div className="text-indigo-400 text-sm mt-1">Powered search</div>
            </div>
            <div>
              <div className="text-white text-3xl font-bold">4+</div>
              <div className="text-indigo-400 text-sm mt-1">Role support</div>
            </div>
          </div>
        </div>

        {/* Trust bar */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-indigo-400 text-xs">Secure · HTTPS · JWT Auth · No card data stored</span>
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-white overflow-y-auto">
        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-7">
            <h2 className="text-2xl font-bold text-gray-900">
              {currentMode === 'login'
                ? currentRole === 'customer' ? 'Welcome back'
                  : currentRole === 'seller' ? 'Seller sign in' : 'Delivery sign in'
                : currentRole === 'customer' ? 'Create your account'
                  : currentRole === 'seller' ? 'Become a seller' : 'Join as delivery agent'}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {currentMode === 'login' ? 'Sign in to your NepShop account' : 'Get started with NepShop today'}
            </p>
          </div>

          {/* Role Tabs */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1 mb-6">
            {roles.map((r) => (
              <button
                key={r.key}
                onClick={() => switchRole(r.key)}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5
                  ${currentRole === r.key
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span>{r.icon}</span>{r.label}
              </button>
            ))}
          </div>

          {/* Mode switcher */}
          <div className="flex border-b border-gray-200 mb-6">
            {['login', 'signup'].map((mode) => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                className={`flex-1 pb-3 text-sm font-medium transition-all border-b-2 -mb-px
                  ${currentMode === mode
                    ? 'text-indigo-600 border-indigo-600'
                    : 'text-gray-400 border-transparent hover:text-gray-600'}`}
              >
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {/* Success screen */}
          {success && (
  <div className="text-center py-4">

    {/* Icon */}
    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
      style={{ background: currentRole === 'customer' ? '#f0fdf4' : '#fff7ed' }}>
      <span className="text-3xl">
        {currentRole === 'customer' ? '✅' : '⏳'}
      </span>
    </div>

    {/* Title */}
    <h3 className="text-xl font-bold text-gray-900 mb-2">
      {currentRole === 'customer' ? 'Account Created!' : 'Application Submitted!'}
    </h3>

    {/* Customer flow */}
    {currentRole === 'customer' && (
      <>
        <p className="text-gray-500 text-sm mb-4">{success}</p>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-700 mb-5 text-left">
          ✔ Your account is ready. Please sign in with your email and password to start shopping.
        </div>
      </>
    )}

    {/* Seller / Delivery flow */}
    {(currentRole === 'seller' || currentRole === 'delivery') && (
      <>
        {/* Pending badge */}
        <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-2 text-sm text-orange-700 mb-4">
          <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
          Pending admin approval
        </div>

        {/* Office visit instruction */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 text-left mb-4">
          <p className="text-amber-800 font-semibold text-sm mb-2">
            📋 Next step — Visit NepShop Office
          </p>
          <p className="text-amber-700 text-sm mb-3">
            To complete your verification, please visit our office with the following documents:
          </p>
          {currentRole === 'seller' && (
            <ul className="text-amber-700 text-sm space-y-1">
              <li>• Citizenship card (original + photocopy)</li>
              <li>• PAN registration certificate</li>
              <li>• Business registration document</li>
              <li>• Recent passport-size photo</li>
            </ul>
          )}
          {currentRole === 'delivery' && (
            <ul className="text-amber-700 text-sm space-y-1">
              <li>• Citizenship card (original + photocopy)</li>
              <li>• Driving license</li>
              <li>• Vehicle registration document (bluebook)</li>
              <li>• Recent passport-size photo</li>
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-amber-200">
            <p className="text-amber-800 text-xs font-medium">📍 NepShop Office</p>
            <p className="text-amber-700 text-xs">Kathmandu, Bagmati Province, Nepal</p>
            <p className="text-amber-700 text-xs">Office hours: Sun – Fri, 10:00 AM – 5:00 PM</p>
          </div>
        </div>

        <p className="text-gray-400 text-xs mb-4">
          You will receive an email notification once your account is approved.
        </p>
      </>
    )}

    {/* CTA button */}
    <button
      onClick={() => {
        setSuccess(null);
        switchMode('login');
      }}
      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition-all text-sm"
    >
      {currentRole === 'customer' ? 'Go to Sign in' : 'Back to Sign in'}
    </button>
  </div>
)}

          {/* Form */}
          {!success && (
            <>
              {/* API Error */}
              {apiError && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4 flex items-start gap-2">
                  <span className="mt-0.5">⚠️</span>
                  <span>{apiError}</span>
                </div>
              )}

              {/* Pending notice for seller/delivery signup */}
              {currentMode === 'signup' && (currentRole === 'seller' || currentRole === 'delivery') && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-700 mb-4 flex items-start gap-2">
                  <span className="mt-0.5">ℹ️</span>
                  <span>
                    {currentRole === 'seller'
                      ? 'Your seller account will require admin approval before you can start selling.'
                      : 'Your delivery agent account will require admin approval before activation.'}
                  </span>
                </div>
              )}

              {/* Login note for seller/delivery */}
              {currentMode === 'login' && currentRole !== 'customer' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-700 mb-4 flex items-start gap-2">
                  <span className="mt-0.5">ℹ️</span>
                  <span>Your account must be approved by admin before you can sign in.</span>
                </div>
              )}

              {/* Signup-only fields */}
              {currentMode === 'signup' && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                      <input
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleChange}
                        placeholder="Ritik"
                        className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                          ${errors.firstName ? 'border-red-400 focus:ring-red-200' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                      />
                      {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                      <input
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleChange}
                        placeholder="Jayswal"
                        className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                          ${errors.lastName ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                      />
                      {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                    <input
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="98XXXXXXXX"
                      className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                        ${errors.phone ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                    />
                    {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
                  </div>

                  {/* Seller fields */}
{currentRole === 'seller' && (
  <>
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">Shop / business name</label>
      <input
        name="shopName"
        value={formData.shopName}
        onChange={handleChange}
        placeholder="My Nepal Store"
        className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
          ${errors.shopName ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
      />
      {errors.shopName && <p className="text-red-500 text-xs mt-1">{errors.shopName}</p>}
    </div>
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">PAN / registration number</label>
      <input
        name="panNumber"
        value={formData.panNumber}
        onChange={handleChange}
        placeholder="PAN or Reg. no."
        className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
          ${errors.panNumber ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
      />
      {errors.panNumber && <p className="text-red-500 text-xs mt-1">{errors.panNumber}</p>}
    </div>
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">Shop street address</label>
      <input
        name="shopStreet"
        value={formData.shopStreet}
        onChange={handleChange}
        placeholder="e.g. New Road, Shop no. 5"
        className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
          ${errors.shopStreet ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
      />
      {errors.shopStreet && <p className="text-red-500 text-xs mt-1">{errors.shopStreet}</p>}
    </div>
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
        <input
          name="shopCity"
          value={formData.shopCity}
          onChange={handleChange}
          placeholder="e.g. Kathmandu"
          className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
            ${errors.shopCity ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
        />
        {errors.shopCity && <p className="text-red-500 text-xs mt-1">{errors.shopCity}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
        <select
          name="shopDistrict"
          value={formData.shopDistrict}
          onChange={handleChange}
          className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all bg-white
            ${errors.shopDistrict ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500'}`}
        >
          <option value="">Select</option>
          {['Kathmandu','Lalitpur','Bhaktapur','Pokhara','Chitwan',
            'Butwal','Birgunj','Biratnagar','Dharan','Hetauda','Other'].map(d => (
            <option key={d}>{d}</option>
          ))}
        </select>
        {errors.shopDistrict && <p className="text-red-500 text-xs mt-1">{errors.shopDistrict}</p>}
      </div>
    </div>
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">Shop contact number</label>
      <input
        name="shopPhone"
        value={formData.shopPhone}
        onChange={handleChange}
        placeholder="Shop phone for delivery agent"
        className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
          ${errors.shopPhone ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
      />
      {errors.shopPhone && <p className="text-red-500 text-xs mt-1">{errors.shopPhone}</p>}
    </div>
  </>
)}

                  {/* Delivery fields */}
                  {currentRole === 'delivery' && (
                    <>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle type</label>
                        <select
                          name="vehicleType"
                          value={formData.vehicleType}
                          onChange={handleChange}
                          className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all bg-white
                            ${errors.vehicleType ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                        >
                          <option value="">Select vehicle</option>
                          <option>Motorcycle</option>
                          <option>Scooter</option>
                          <option>Bicycle</option>
                          <option>Van / Car</option>
                        </select>
                        {errors.vehicleType && <p className="text-red-500 text-xs mt-1">{errors.vehicleType}</p>}
                      </div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Citizenship / ID number</label>
                        <input
                          name="citizenshipNumber"
                          value={formData.citizenshipNumber}
                          onChange={handleChange}
                          placeholder="Citizenship no."
                          className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                            ${errors.citizenshipNumber ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                        />
                        {errors.citizenshipNumber && <p className="text-red-500 text-xs mt-1">{errors.citizenshipNumber}</p>}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Email */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                    ${errors.email ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              {/* Password */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={currentMode === 'signup' ? 'Min. 8 chars, 1 uppercase, 1 number' : 'Your password'}
                    className={`w-full px-3 py-2.5 pr-11 border rounded-lg text-sm outline-none transition-all
                      ${errors.password ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
              </div>

              {/* Confirm password */}
              {currentMode === 'signup' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                  <div className="relative">
                    <input
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Repeat password"
                      className={`w-full px-3 py-2.5 pr-11 border rounded-lg text-sm outline-none transition-all
                        ${errors.confirmPassword ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowConfirmPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
                </div>
              )}

              {/* Forgot password */}
              {currentMode === 'login' && (
                <div className="text-right mb-4 -mt-2">
                  <button
                    onClick={() => navigate('/forgot-password')}
                    className="text-indigo-600 text-xs font-medium hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={currentMode === 'login' ? handleLogin : handleSignup}
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-lg transition-all text-sm"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    {currentMode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </span>
                ) : (
                  currentMode === 'login' ? 'Sign in to NepShop'
                    : currentRole === 'customer' ? 'Create account'
                    : currentRole === 'seller' ? 'Apply as seller'
                    : 'Apply as delivery agent'
                )}
              </button>

              {/* Terms */}
              {currentMode === 'signup' && (
                <p className="text-xs text-gray-400 text-center mt-3">
                  By creating an account you agree to our{' '}
                  <a href="#" className="text-indigo-600">Terms</a> and{' '}
                  <a href="#" className="text-indigo-600">Privacy Policy</a>
                </p>
              )}

              {/* Switch mode */}
              <p className="text-center text-sm text-gray-500 mt-5">
                {currentMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => switchMode(currentMode === 'login' ? 'signup' : 'login')}
                  className="text-indigo-600 font-medium hover:underline"
                >
                  {currentMode === 'login' ? 'Create one' : 'Sign in'}
                </button>
              </p>

              {/* Admin portal link */}
              <div className="text-center mt-6 pt-5 border-t border-dashed border-gray-200">
                <a href="/admin/login" className="text-xs text-gray-400 hover:text-indigo-600">
                  Admin portal →
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;