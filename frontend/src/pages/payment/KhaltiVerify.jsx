import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import API from '../../utils/api';

const KhaltiVerify = () => {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    const pidx      = searchParams.get('pidx');
    const txnStatus = searchParams.get('status');

    if (txnStatus === 'User canceled' || txnStatus === 'Failed') {
      setStatus('failed');
      setMessage(
        txnStatus === 'User canceled'
          ? 'Payment was cancelled. Your cart is still saved.'
          : 'Payment failed — this could be due to insufficient balance or a network issue. Your cart is still saved.'
      );
      return;
    }

    // Get orderData from sessionStorage
    const orderDataStr = sessionStorage.getItem('khalti_order_data');
    if (!orderDataStr) {
      setStatus('failed');
      setMessage('Session expired. Please try again.');
      return;
    }

    const orderData = JSON.parse(orderDataStr);

    try {
      const { data } = await API.post('/payment/khalti/verify', {
        pidx,
        orderData,
      });

      if (data.success) {
        sessionStorage.removeItem('khalti_order_data');
        setStatus('success');
        setMessage('Payment successful! Your order has been placed.');
        setTimeout(() => navigate('/customer/dashboard'), 3000);
      }
    } catch (err) {
      setStatus('failed');
      setMessage(err.response?.data?.message || 'Payment verification failed. Your cart is still saved.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">

        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verifying Payment</h2>
            <p className="text-gray-500 text-sm">Please wait while we confirm your payment with Khalti...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✅</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-gray-500 text-sm mb-4">{message}</p>
            <p className="text-xs text-gray-400">Redirecting to your orders...</p>
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">❌</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Failed</h2>
            <p className="text-gray-500 text-sm mb-6">{message}</p>
            <button
              onClick={() => navigate('/customer/dashboard')}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-all"
            >
              Go to My Orders
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default KhaltiVerify;