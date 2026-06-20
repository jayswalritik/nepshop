import { useAuth } from '../../context/AuthContext';

const DeliveryDashboard = () => {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow text-center">
        <h1 className="text-2xl font-bold text-indigo-600 mb-2">
          Welcome, {user?.firstName}! 🚚
        </h1>
        <p className="text-gray-500 mb-6">You are logged in as a <strong>Delivery Agent</strong></p>
        <button
          onClick={logout}
          className="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default DeliveryDashboard;