import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';
import BecomeCustomer from '../../components/common/BecomeCustomer';

const SettingsPage = () => {
  const { user, login } = useAuth();

  const [formData, setFormData] = useState({
    firstName:         user?.firstName             || '',
    lastName:          user?.lastName              || '',
    phone:             user?.phone                 || '',
    shopName:          user?.shopName              || '',
    shopStreet:        user?.shopAddress?.street   || '',
    shopCity:          user?.shopAddress?.city     || '',
    shopDistrict:      user?.shopAddress?.district || '',
    shopPhone:         user?.shopAddress?.phone    || '',
    preferredMethod:   user?.payoutDetails?.preferredMethod   || '',
    bankName:          user?.payoutDetails?.bankName          || '',
    accountNumber:     user?.payoutDetails?.accountNumber     || '',
    accountHolderName: user?.payoutDetails?.accountHolderName || '',
    khaltiNumber:      user?.payoutDetails?.khaltiNumber      || '',
    esewaNumber:       user?.payoutDetails?.esewaNumber       || '',
  });

  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');
  const [errors, setErrors]     = useState({});

  const districts = [
    'Kathmandu', 'Lalitpur', 'Bhaktapur', 'Pokhara', 'Chitwan',
    'Butwal', 'Birgunj', 'Biratnagar', 'Dharan', 'Hetauda', 'Other',
  ];

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
    setError('');
    setSuccess('');
  };

  const validate = () => {
    const errs = {};
    if (!formData.firstName.trim())    errs.firstName    = 'First name is required';
    if (!formData.lastName.trim())     errs.lastName     = 'Last name is required';
    if (!formData.phone.trim())        errs.phone        = 'Phone is required';
    if (!formData.shopName.trim())     errs.shopName     = 'Shop name is required';
    if (!formData.shopStreet.trim())   errs.shopStreet   = 'Street address is required';
    if (!formData.shopCity.trim())     errs.shopCity     = 'City is required';
    if (!formData.shopDistrict)        errs.shopDistrict = 'District is required';
    if (!formData.shopPhone.trim())    errs.shopPhone    = 'Shop contact is required';
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await API.put('/auth/seller/settings', {
        firstName: formData.firstName,
        lastName:  formData.lastName,
        phone:     formData.phone,
        shopName:  formData.shopName,
        shopAddress: {
          street:   formData.shopStreet,
          city:     formData.shopCity,
          district: formData.shopDistrict,
          phone:    formData.shopPhone,
        },
        payoutDetails: {
        preferredMethod:   formData.preferredMethod,
        bankName:          formData.bankName,
        accountNumber:     formData.accountNumber,
        accountHolderName: formData.accountHolderName,
        khaltiNumber:      formData.khaltiNumber,
        esewaNumber:       formData.esewaNumber,
      },
      });

      // Update auth context with new user data
      const token = localStorage.getItem('nepshop_token');
      login(data.user, token);

      setSuccess('Settings saved successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">

      {/* Become a customer */}
      <BecomeCustomer />

      {/* Personal info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
        <h3 className="font-semibold text-gray-900 mb-1">Personal Information</h3>
        <p className="text-sm text-gray-400 mb-5">Update your name and contact details</p>

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
      </div>

      {/* Shop info */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
        <h3 className="font-semibold text-gray-900 mb-1">Shop Information</h3>
        <p className="text-sm text-gray-400 mb-5">
          This address is shown to delivery agents for order pickup
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shop / business name</label>
            <input
              name="shopName"
              value={formData.shopName}
              onChange={handleChange}
              className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                ${errors.shopName ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
            />
            {errors.shopName && <p className="text-red-500 text-xs mt-1">{errors.shopName}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
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

          <div className="grid grid-cols-2 gap-4">
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
                <option value="">Select district</option>
                {districts.map(d => <option key={d}>{d}</option>)}
              </select>
              {errors.shopDistrict && <p className="text-red-500 text-xs mt-1">{errors.shopDistrict}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shop contact number
              <span className="text-gray-400 font-normal text-xs ml-1">
                (shown to delivery agent for pickup)
              </span>
            </label>
            <input
              name="shopPhone"
              value={formData.shopPhone}
              onChange={handleChange}
              placeholder="Shop phone number"
              className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                ${errors.shopPhone ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`}
            />
            {errors.shopPhone && <p className="text-red-500 text-xs mt-1">{errors.shopPhone}</p>}
          </div>
        </div>
      </div>

      {/* Payout details */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
        <h3 className="font-semibold text-gray-900 mb-1">Payout Details</h3>
        <p className="text-sm text-gray-400 mb-5">
          How you want to receive payments from NepShop
        </p>

        <div className="space-y-4">
          {/* Preferred method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Preferred payout method
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'bank',   label: 'Bank Transfer', icon: '🏦' },
                { key: 'khalti', label: 'Khalti',         icon: '💜' },
                { key: 'esewa',  label: 'eSewa',          icon: '💚' },
              ].map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, preferredMethod: m.key });
                    setError('');
                    setSuccess('');
                  }}
                  className={`flex items-center justify-center gap-2 px-3 py-2.5 border rounded-lg text-sm font-medium transition-all
                    ${formData.preferredMethod === m.key
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                >
                  <span>{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bank fields */}
          {formData.preferredMethod === 'bank' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank name</label>
                <input
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleChange}
                  placeholder="e.g. Nepal Investment Bank"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account number</label>
                <input
                  name="accountNumber"
                  value={formData.accountNumber}
                  onChange={handleChange}
                  placeholder="Your bank account number"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account holder name</label>
                <input
                  name="accountHolderName"
                  value={formData.accountHolderName}
                  onChange={handleChange}
                  placeholder="Name as on bank account"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </>
          )}

          {/* Khalti field */}
          {formData.preferredMethod === 'khalti' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Khalti number</label>
              <input
                name="khaltiNumber"
                value={formData.khaltiNumber}
                onChange={handleChange}
                placeholder="Khalti registered phone number"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          )}

          {/* eSewa field */}
          {formData.preferredMethod === 'esewa' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">eSewa number</label>
              <input
                name="esewaNumber"
                value={formData.esewaNumber}
                onChange={handleChange}
                placeholder="eSewa registered phone number"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          )}

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <p className="text-xs text-blue-700">
              💡 NepShop will use these details to send your earnings after deducting the platform commission.
              Payouts are processed manually by the admin after you request them.
            </p>
          </div>
        </div>
      </div>

      {/* Account info — read only */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
        <h3 className="font-semibold text-gray-900 mb-1">Account Information</h3>
        <p className="text-sm text-gray-400 mb-4">Read-only information about your account</p>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-50">
            <span className="text-sm text-gray-500">PAN Number</span>
            <span className="text-sm font-medium text-gray-700">{user?.panNumber || 'Not set'}</span>
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

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            Saving...
          </>
        ) : '💾 Save Settings'}
      </button>
    </div>
  );
};

export default SettingsPage;