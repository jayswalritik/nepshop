import { useState, useEffect } from 'react';
import API from '../../utils/api';

const EarningsPage = () => {
  const [stats, setStats]     = useState(null);
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState('all');

  useEffect(() => {
    fetchEarnings();
  }, [period]);

  const fetchEarnings = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/orders/seller?limit=100');
      const all = data.orders;

      // Filter by period
      const now   = new Date();
      const filtered = all.filter(o => {
        if (o.status === 'cancelled') return false;
        if (period === 'today') {
          return new Date(o.createdAt).toDateString() === now.toDateString();
        }
        if (period === 'week') {
          const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
          return new Date(o.createdAt) >= weekAgo;
        }
        if (period === 'month') {
          return new Date(o.createdAt).getMonth() === now.getMonth() &&
                 new Date(o.createdAt).getFullYear() === now.getFullYear();
        }
        return true; // all
      });

      // Calculate stats
      const totalRevenue    = filtered.reduce((sum, o) => sum + o.total, 0);
      const totalCommission = filtered.reduce((sum, o) => sum + o.commissionAmount, 0);
      const totalEarnings   = totalRevenue - totalCommission;
      const totalOrders     = filtered.length;
      const delivered       = filtered.filter(o => o.status === 'delivered').length;
      const pending         = filtered.filter(o => o.status === 'pending').length;

      // Top products
      const productMap = {};
      filtered.forEach(o => {
        o.items.forEach(item => {
          if (!productMap[item.name]) {
            productMap[item.name] = { name: item.name, image: item.image, qty: 0, revenue: 0 };
          }
          productMap[item.name].qty     += item.quantity;
          productMap[item.name].revenue += item.price * item.quantity;
        });
      });
      const topProducts = Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      setStats({
        totalRevenue,
        totalCommission,
        totalEarnings,
        totalOrders,
        delivered,
        pending,
        topProducts,
      });
      setOrders(filtered.slice(0, 10));
    } catch (err) {
      console.error('Failed to fetch earnings:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Period filter */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'today', label: 'Today' },
          { key: 'week',  label: 'This Week' },
          { key: 'month', label: 'This Month' },
          { key: 'all',   label: 'All Time' },
        ].map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${period === p.key
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Revenue</p>
          <p className="text-2xl font-bold text-gray-900">
            Rs {stats?.totalRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Before commission</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Your Earnings</p>
          <p className="text-2xl font-bold text-green-600">
            Rs {stats?.totalEarnings.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">After commission</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Commission Paid</p>
          <p className="text-2xl font-bold text-orange-500">
            Rs {stats?.totalCommission.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">5% platform fee</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Orders</p>
          <p className="text-2xl font-bold text-indigo-600">{stats?.totalOrders}</p>
          <p className="text-xs text-gray-400 mt-1">
            {stats?.delivered} delivered · {stats?.pending} pending
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Top products */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Top Selling Products</h3>
          {stats?.topProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">📦</div>
              <p className="text-sm">No sales data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats?.topProducts.map((product, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-400">{product.qty} units sold</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
                    Rs {product.revenue.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Orders</h3>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">🧾</div>
              <p className="text-sm">No orders in this period</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <div key={order._id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-mono font-medium text-gray-700">
                      #{order._id.slice(-8).toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleDateString('en-NP', {
                        day: 'numeric', month: 'short'
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      Rs {order.total.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-600">
                      Earned: Rs {(order.total - order.commissionAmount).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ml-2
                    ${order.status === 'delivered' ? 'bg-green-100 text-green-700'
                    : order.status === 'pending' ? 'bg-yellow-100 text-yellow-700'
                    : order.status === 'dispatched' ? 'bg-purple-100 text-purple-700'
                    : 'bg-indigo-100 text-indigo-700'}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Commission info */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mt-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm font-semibold text-indigo-900 mb-1">
              How earnings are calculated
            </p>
            <p className="text-sm text-indigo-700">
              NepShop charges a <strong>5% commission</strong> on each order total.
              Your earnings = Order total − 5% commission − delivery charge (if applicable).
              Payout requests will be available in the next update.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarningsPage;