import { useNavigate, useSearchParams } from 'react-router-dom';

const PaymentFailed = () => {
  const navigate     = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId      = searchParams.get('orderId');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">❌</span>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Failed</h2>
        <p className="text-gray-500 text-sm mb-6">
          Your payment could not be processed. Your order has been saved —
          you can retry the payment from your orders page.
        </p>
        <button
          onClick={() => navigate('/customer/dashboard')}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-all"
        >
          Go to My Orders
        </button>
      </div>
    </div>
  );
};

export default PaymentFailed;