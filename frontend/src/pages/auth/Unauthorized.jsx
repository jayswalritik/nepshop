import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow text-center">
        <h1 className="text-4xl font-bold text-red-500 mb-2">403</h1>
        <p className="text-gray-500 mb-6">You are not authorized to view this page.</p>
        <button
          onClick={() => navigate('/login')}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;