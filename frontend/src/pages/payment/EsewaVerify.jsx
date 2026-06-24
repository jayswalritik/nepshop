import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import API from '../../utils/api';

const EsewaVerify = () => {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [status, setStatus]   = useState('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    const data    = searchParams.get('data');
    const orderId = searchParams.get('orderId');

    if (!data) {
      setStatus('failed');
      setMessage('Payment was cancelled. Your order is still saved.');
      return;
    }

    try {
      const res = await API.post('/payment/esewa/verify', { data, orderId });

      if (res.data.success) {
        setStatus('success');
        setMessage('Payment successful! Your order has been confirmed.');
        setTimeout(() => navigate('/customer/dashboard'), 3000);
      }
    } catch (err) {
      setStatus('failed');
      setMessage(err.response?.data?.message || 'Payment verification failed.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">

        {status === 'verifying' && (
          <>
            <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verifying eSewa Payment</h2>
            <p className="text-gray-500 text-sm">Please wait while we confirm your payment with eSewa...</p>
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

export default EsewaVerify;