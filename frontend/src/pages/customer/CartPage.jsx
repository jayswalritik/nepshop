import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import API from '../../utils/api';

const CartPage = ({ onCheckoutSuccess }) => {
  const { cart, updateQuantity, removeFromCart, clearCart } = useCart();
  const { user } = useAuth();
  const [showCheckout, setShowCheckout] = useState(false);

  if (cart.items.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
        <div className="text-6xl mb-4">🛒</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Your cart is empty</h3>
        <p className="text-gray-500 text-sm">Add some products to get started</p>
      </div>
    );
  }

  if (showCheckout) {
    return (
      <CheckoutPage
        cart={cart}
        user={user}
        onSuccess={() => { clearCart(); onCheckoutSuccess(); }}
        onBack={() => setShowCheckout(false)}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900">
          Your Cart <span className="text-gray-400 font-normal text-base">({cart.itemCount} items)</span>
        </h2>
        <button
          onClick={clearCart}
          className="text-sm text-red-500 hover:text-red-700 font-medium"
        >
          Clear All
        </button>
      </div>

      {/* Cart items */}
      <div className="space-y-3 mb-5">
        {cart.items.map((item) => (
          <div key={item._id} className="bg-white border border-gray-200 rounded-xl p-4 flex gap-4">
            <img
              src={item.product?.images[0]?.url}
              alt={item.product?.name}
              className="w-20 h-20 object-cover rounded-lg border border-gray-100 flex-shrink-0"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900 mb-0.5">{item.product?.name}</p>
              <p className="text-xs text-gray-400 mb-2">{item.product?.category}</p>
              <p className="text-base font-bold text-gray-900">
                Rs {item.price.toLocaleString()}
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {/* Quantity */}
              <div className="flex items-center border border-gray-200 rounded-lg">
                <button
                  onClick={() => updateQuantity(item.product._id, item.quantity - 1)}
                  disabled={item.quantity <= 1}
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40 rounded-l-lg"
                >−</button>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.product._id, item.quantity + 1)}
                  disabled={item.quantity >= item.product?.stock}
                  className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40 rounded-r-lg"
                >+</button>
              </div>
              {/* Subtotal */}
              <p className="text-sm font-semibold text-indigo-600">
                Rs {(item.price * item.quantity).toLocaleString()}
              </p>
              {/* Remove */}
              <button
                onClick={() => removeFromCart(item.product._id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Order summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>
        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal ({cart.itemCount} items)</span>
            <span className="font-medium">Rs {cart.total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Delivery charge</span>
            <span className="font-medium text-green-600">
              {cart.total >= 2000 ? 'FREE' : 'Rs 100'}
            </span>
          </div>
          {cart.total < 2000 && (
            <p className="text-xs text-orange-600">
              Add Rs {(2000 - cart.total).toLocaleString()} more for free delivery
            </p>
          )}
        </div>
        <div className="border-t border-gray-100 pt-3 mb-4">
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>Rs {(cart.total + (cart.total >= 2000 ? 0 : 100)).toLocaleString()}</span>
          </div>
        </div>
        <button
          onClick={() => setShowCheckout(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-all"
        >
          Proceed to Checkout →
        </button>
      </div>
    </div>
  );
};

// ── Checkout Page ─────────────────────────────────────────
const CheckoutPage = ({ cart, user, onSuccess, onBack }) => {
  const [address, setAddress] = useState({
    fullName:  `${user.firstName} ${user.lastName}`,
    phone:     user.phone || '',
    street:    '',
    city:      '',
    district:  '',
    landmark:  '',
  });
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const [customerNote, setCustomerNote]   = useState('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [fieldErrors, setFieldErrors]     = useState({});

  const districts = [
    'Kathmandu', 'Lalitpur', 'Bhaktapur', 'Pokhara', 'Chitwan',
    'Butwal', 'Birgunj', 'Biratnagar', 'Dharan', 'Hetauda', 'Other'
  ];

  const handleChange = (e) => {
    setAddress({ ...address, [e.target.name]: e.target.value });
    setFieldErrors({ ...fieldErrors, [e.target.name]: '' });
    setError('');
  };

  const validate = () => {
    const errs = {};
    if (!address.fullName.trim())  errs.fullName  = 'Full name is required';
    if (!address.phone.trim())     errs.phone     = 'Phone is required';
    if (!address.street.trim())    errs.street    = 'Street address is required';
    if (!address.city.trim())      errs.city      = 'City is required';
    if (!address.district)         errs.district  = 'District is required';
    return errs;
  };

  const handlePlaceOrder = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setLoading(true);
    setError('');
    try {
      await API.post('/orders', {
        deliveryAddress: address,
        paymentMethod,
        customerNote,
      });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to place order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const total = cart.total + (cart.total >= 2000 ? 0 : 100);

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700 mb-5 flex items-center gap-1">
        ← Back to Cart
      </button>

      <div className="grid md:grid-cols-2 gap-6">

        {/* Left — Delivery details */}
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h3 className="font-semibold text-gray-900 mb-4">Delivery Address</h3>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full name *</label>
                <input name="fullName" value={address.fullName} onChange={handleChange}
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                    ${fieldErrors.fullName ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`} />
                {fieldErrors.fullName && <p className="text-red-500 text-xs mt-1">{fieldErrors.fullName}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone *</label>
                <input name="phone" value={address.phone} onChange={handleChange}
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                    ${fieldErrors.phone ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`} />
                {fieldErrors.phone && <p className="text-red-500 text-xs mt-1">{fieldErrors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Street address *</label>
                <input name="street" value={address.street} onChange={handleChange}
                  placeholder="e.g. Putalisadak, House no. 12"
                  className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                    ${fieldErrors.street ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`} />
                {fieldErrors.street && <p className="text-red-500 text-xs mt-1">{fieldErrors.street}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">City *</label>
                  <input name="city" value={address.city} onChange={handleChange}
                    placeholder="e.g. Kathmandu"
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none transition-all
                      ${fieldErrors.city ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'}`} />
                  {fieldErrors.city && <p className="text-red-500 text-xs mt-1">{fieldErrors.city}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">District *</label>
                  <select name="district" value={address.district} onChange={handleChange}
                    className={`w-full px-3 py-2.5 border rounded-lg text-sm outline-none bg-white transition-all
                      ${fieldErrors.district ? 'border-red-400' : 'border-gray-200 focus:border-indigo-500'}`}>
                    <option value="">Select</option>
                    {districts.map(d => <option key={d}>{d}</option>)}
                  </select>
                  {fieldErrors.district && <p className="text-red-500 text-xs mt-1">{fieldErrors.district}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Landmark (optional)</label>
                <input name="landmark" value={address.landmark} onChange={handleChange}
                  placeholder="e.g. Near post office"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>
          </div>

          {/* Payment method */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
            <h3 className="font-semibold text-gray-900 mb-4">Payment Method</h3>
            <div className="space-y-2">
              {[
                { value: 'cash_on_delivery', label: 'Cash on Delivery', icon: '💵', desc: 'Pay when your order arrives' },
                { value: 'khalti',           label: 'Khalti',           icon: '💜', desc: 'Coming soon' },
                { value: 'esewa',            label: 'eSewa',            icon: '💚', desc: 'Coming soon' },
              ].map((method) => (
                <label
                  key={method.value}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all
                    ${paymentMethod === method.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'}
                    ${method.value !== 'cash_on_delivery' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={method.value}
                    checked={paymentMethod === method.value}
                    onChange={() => method.value === 'cash_on_delivery' && setPaymentMethod(method.value)}
                    className="text-indigo-600"
                    disabled={method.value !== 'cash_on_delivery'}
                  />
                  <span className="text-xl">{method.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{method.label}</p>
                    <p className="text-xs text-gray-400">{method.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Order Note (optional)</h3>
            <textarea
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="Any special instructions for your order..."
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
          </div>
        </div>

        {/* Right — Order summary */}
        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-24">
            <h3 className="font-semibold text-gray-900 mb-4">Order Summary</h3>

            {/* Items */}
            <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
              {cart.items.map((item) => (
                <div key={item._id} className="flex gap-3">
                  <img
                    src={item.product?.images[0]?.url}
                    alt=""
                    className="w-12 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{item.product?.name}</p>
                    <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-medium flex-shrink-0">
                    Rs {(item.price * item.quantity).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-3 space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>Rs {cart.total.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery</span>
                <span className={cart.total >= 2000 ? 'text-green-600 font-medium' : ''}>
                  {cart.total >= 2000 ? 'FREE' : 'Rs 100'}
                </span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100">
                <span>Total</span>
                <span>Rs {total.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Placing order...
                </>
              ) : '✅ Place Order'}
            </button>

            <p className="text-xs text-gray-400 text-center mt-3">
              By placing this order you agree to our terms and conditions
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartPage;