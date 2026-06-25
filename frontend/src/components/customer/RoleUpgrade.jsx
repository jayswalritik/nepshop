import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

const districts = ['Kathmandu','Lalitpur','Bhaktapur','Pokhara','Chitwan','Butwal','Birgunj','Biratnagar','Dharan','Hetauda','Other'];

const RoleUpgrade = () => {
  const { user, login } = useAuth();
  const [openForm, setOpenForm] = useState(null); // 'seller' | 'delivery' | null
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const [sellerData, setSellerData] = useState({
    shopName: '', panNumber: '', shopStreet: '', shopCity: '', shopDistrict: '', shopPhone: '',
  });
  const [deliveryData, setDeliveryData] = useState({
    vehicleType: '', citizenshipNumber: '',
  });

  const roles      = user?.roles || [user?.role];
  const isCustomer = roles.includes('customer');
  const isSeller   = roles.includes('seller');
  const isDelivery = roles.includes('delivery');
  const pending    = user?.pendingRoleRequest?.status === 'pending'
    ? user.pendingRoleRequest.role
    : null;

  const refreshUser = (updatedUser) => {
    const token = localStorage.getItem('nepshop_token');
    login(updatedUser, token);
  };

  const applySeller = async () => {
    if (!sellerData.shopName || !sellerData.panNumber || !sellerData.shopStreet
        || !sellerData.shopCity || !sellerData.shopDistrict || !sellerData.shopPhone) {
      setError('Please fill all seller fields');
      return;
    }
    setLoading(true); setError('');
    try {
      const { data } = await API.post('/auth/apply-role', {
        role: 'seller',
        shopName:  sellerData.shopName,
        panNumber: sellerData.panNumber,
        shopAddress: {
          street:   sellerData.shopStreet,
          city:     sellerData.shopCity,
          district: sellerData.shopDistrict,
          phone:    sellerData.shopPhone,
        },
      });
      refreshUser(data.user);
      setSuccess(data.message);
      setOpenForm(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit application');
    } finally { setLoading(false); }
  };

  const applyDelivery = async () => {
    if (!deliveryData.vehicleType || !deliveryData.citizenshipNumber) {
      setError('Please fill all delivery fields');
      return;
    }
    setLoading(true); setError('');
    try {
      const { data } = await API.post('/auth/apply-role', {
        role: 'delivery',
        vehicleType:       deliveryData.vehicleType,
        citizenshipNumber: deliveryData.citizenshipNumber,
      });
      refreshUser(data.user);
      setSuccess(data.message);
      setOpenForm(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit application');
    } finally { setLoading(false); }
  };

  const becomeCustomer = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await API.post('/auth/add-customer-role');
      refreshUser(data.user);
      setSuccess(data.message);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed');
    } finally { setLoading(false); }
  };

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all';

  // Nothing to show if user already has everything possible
  const canApplySeller   = !isSeller && !isDelivery && !pending;
  const canApplyDelivery = !isDelivery && !isSeller && !pending;
  const canBecomeCustomer = !isCustomer;

  if (!canApplySeller && !canApplyDelivery && !canBecomeCustomer && !pending) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-5">
      <h3 className="font-semibold text-gray-900 mb-1">Grow with NepShop</h3>
      <p className="text-sm text-gray-400 mb-5">Expand what you can do with your account</p>

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

      {/* Pending state */}
      {pending && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-4 flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse flex-shrink-0"></span>
          <div>
            <p className="text-sm font-medium text-orange-800">
              Your {pending} application is under review
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              You'll be notified by email once an admin approves it. Meanwhile you can keep shopping.
            </p>
          </div>
        </div>
      )}

      {/* Action cards */}
      {!pending && (
        <div className="space-y-3">

          {/* Become a Seller */}
          {canApplySeller && openForm !== 'seller' && (
            <button
              onClick={() => { setOpenForm('seller'); setError(''); setSuccess(''); }}
              className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
            >
              <span className="text-2xl">🏪</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Become a Seller</p>
                <p className="text-xs text-gray-500">Start selling your products on NepShop</p>
              </div>
              <span className="text-gray-400">→</span>
            </button>
          )}

          {/* Seller form */}
          {openForm === 'seller' && (
            <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/30">
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-gray-900 text-sm">🏪 Seller Application</p>
                <button onClick={() => setOpenForm(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Shop / business name</label>
                  <input value={sellerData.shopName} onChange={(e) => setSellerData({...sellerData, shopName: e.target.value})} placeholder="My Nepal Store" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">PAN / registration number</label>
                  <input value={sellerData.panNumber} onChange={(e) => setSellerData({...sellerData, panNumber: e.target.value})} placeholder="PAN or Reg. no." className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Shop street address</label>
                  <input value={sellerData.shopStreet} onChange={(e) => setSellerData({...sellerData, shopStreet: e.target.value})} placeholder="e.g. New Road, Shop no. 5" className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                    <input value={sellerData.shopCity} onChange={(e) => setSellerData({...sellerData, shopCity: e.target.value})} placeholder="Kathmandu" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">District</label>
                    <select value={sellerData.shopDistrict} onChange={(e) => setSellerData({...sellerData, shopDistrict: e.target.value})} className={inputCls + ' bg-white'}>
                      <option value="">Select</option>
                      {districts.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Shop contact number</label>
                  <input value={sellerData.shopPhone} onChange={(e) => setSellerData({...sellerData, shopPhone: e.target.value})} placeholder="Shop phone for delivery agent" className={inputCls} />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-amber-700">ℹ️ Your application will require admin approval. You'll keep shopping while it's reviewed.</p>
                </div>
                <button onClick={applySeller} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-all">
                  {loading ? 'Submitting...' : 'Submit Seller Application'}
                </button>
              </div>
            </div>
          )}

          {/* Become a Delivery Agent */}
          {canApplyDelivery && openForm !== 'delivery' && (
            <button
              onClick={() => { setOpenForm('delivery'); setError(''); setSuccess(''); }}
              className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left"
            >
              <span className="text-2xl">🚚</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Become a Delivery Agent</p>
                <p className="text-xs text-gray-500">Earn by delivering orders across Nepal</p>
              </div>
              <span className="text-gray-400">→</span>
            </button>
          )}

          {/* Delivery form */}
          {openForm === 'delivery' && (
            <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/30">
              <div className="flex items-center justify-between mb-4">
                <p className="font-semibold text-gray-900 text-sm">🚚 Delivery Agent Application</p>
                <button onClick={() => setOpenForm(null)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle type</label>
                  <select value={deliveryData.vehicleType} onChange={(e) => setDeliveryData({...deliveryData, vehicleType: e.target.value})} className={inputCls + ' bg-white'}>
                    <option value="">Select vehicle</option>
                    <option>Motorcycle</option>
                    <option>Scooter</option>
                    <option>Bicycle</option>
                    <option>Van / Car</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Citizenship / ID number</label>
                  <input value={deliveryData.citizenshipNumber} onChange={(e) => setDeliveryData({...deliveryData, citizenshipNumber: e.target.value})} placeholder="Citizenship no." className={inputCls} />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs text-amber-700">ℹ️ Your application will require admin approval. You'll keep shopping while it's reviewed.</p>
                </div>
                <button onClick={applyDelivery} disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-all">
                  {loading ? 'Submitting...' : 'Submit Delivery Application'}
                </button>
              </div>
            </div>
          )}

          {/* Become a Customer (instant) — for seller/delivery without customer role */}
          {canBecomeCustomer && (
            <button
              onClick={becomeCustomer}
              disabled={loading}
              className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-xl hover:border-green-300 hover:bg-green-50 transition-all text-left disabled:opacity-60"
            >
              <span className="text-2xl">🛍️</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Start Shopping as Customer</p>
                <p className="text-xs text-gray-500">Instantly enable shopping — no approval needed</p>
              </div>
              <span className="text-gray-400">→</span>
            </button>
          )}

        </div>
      )}
    </div>
  );
};

export default RoleUpgrade;