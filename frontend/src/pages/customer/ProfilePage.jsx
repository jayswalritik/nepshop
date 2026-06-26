import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import RoleUpgrade from '../../components/customer/RoleUpgrade';

const ProfilePage = () => {
  const { user, login } = useAuth();

  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName:  user?.lastName  || '',
    phone:     user?.phone     || '',
  });

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
    if (!formData.firstName.trim()) errs.firstName = 'First name is required';
    if (!formData.lastName.trim())  errs.lastName  = 'Last name is required';
    if (!formData.phone.trim())     errs.phone     = 'Phone is required';
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await API.put('/auth/customer/profile', {
        firstName: formData.firstName,
        lastName:  formData.lastName,
        phone:     formData.phone,
      });

      const token = localStorage.getItem('nepshop_token');
      login(data.user, token);
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">

      {/* Avatar */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5 text-center">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-2xl mx-auto mb-3">
          {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
        </div>
        <h2 className="font-bold text-gray-900 text-lg">
          {user?.firstName} {user?.lastName}
        </h2>
        <p className="text-sm text-gray-400">{user?.email}</p>
        <span className="inline-block mt-2 text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
          ✓ Active Customer
        </span>
      </div>

      {/* Edit form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
        <h3 className="font-semibold text-gray-900 mb-1">Personal Information</h3>
        <p className="text-sm text-gray-400 mb-5">Update your profile details</p>

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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
              <input
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                  ${errors.firstName ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
              />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
              <input
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                  ${errors.lastName ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
              />
              {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
            <input
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                ${errors.phone ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
            <input
              value={user?.email}
              disabled
              className="w-full px-3 py-2.5 border border-gray-100 rounded-lg text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full mt-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Saving...
            </>
          ) : '💾 Save Profile'}
        </button>
      </div>

      {/* Grow with NepShop — role upgrade */}
      <RoleUpgrade />

      {/* Account info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Account Details</h3>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Account Type</span>
            <span className="text-sm font-medium text-gray-700 capitalize">
              {(user?.roles || [user?.role]).join(', ')}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">Account Status</span>
            <span className="text-sm font-medium text-green-600">✓ Active</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-500">Member Since</span>
            <span className="text-sm font-medium text-gray-700">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-NP', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;