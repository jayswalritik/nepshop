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

      const now = new Date();
      const inPeriod = (o) => {
        if (period === 'today') return new Date(o.createdAt).toDateString() === now.toDateString();
        if (period === 'week')  return new Date(o.createdAt) >= new Date(now - 7 * 24 * 60 * 60 * 1000);
        if (period === 'month') return new Date(o.createdAt).getMonth() === now.getMonth() &&
                                       new Date(o.createdAt).getFullYear() === now.getFullYear();
        return true;
      };

      // Delivered orders in period = earned (subject to settlement window)
      const delivered = all.filter(o => o.status === 'delivered' && inPeriod(o));

      // Seller earning per order = subtotal − commission (NEVER includes delivery)
      const sellerEarning = (o) => o.subtotal - o.commissionAmount;

      const productRevenue = delivered.reduce((sum, o) => sum + o.subtotal, 0);
      const totalCommission = delivered.reduce((sum, o) => sum + o.commissionAmount, 0);
      const totalEarnings   = delivered.reduce((sum, o) => sum + sellerEarning(o), 0);

      // Available vs pending — based on settlement lock
      let available = 0, pending = 0;
      delivered.forEach(o => {
        const earning = sellerEarning(o);
        const released = o.settlement?.sellerReleased;
        if (released) available += earning;
        else pending += earning;
      });

      // In-progress orders (not yet delivered, not yet earned)
      const inProgress = all.filter(o => ['pending', 'confirmed', 'packed', 'dispatched'].includes(o.status));
      const inProgressEarning = inProgress.reduce((sum, o) => sum + sellerEarning(o), 0);

      // Top products
      const productMap = {};
      delivered.forEach(o => {
        o.items.forEach(item => {
          if (!productMap[item.name]) {
            productMap[item.name] = { name: item.name, image: item.image, qty: 0, revenue: 0 };
          }
          productMap[item.name].qty     += item.quantity;
          productMap[item.name].revenue += item.price * item.quantity;
        });
      });
      const topProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      setStats({
        productRevenue,
        totalCommission,
        totalEarnings,
        available,
        pending,
        inProgressCount: inProgress.length,
        inProgressEarning,
        deliveredCount: delivered.length,
        topProducts,
      });
      setOrders(delivered.slice(0, 10));
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

  const sellerEarning = (o) => o.subtotal - o.commissionAmount;

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

      {/* Balance cards — the settlement view */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5">
          <p className="text-xs text-green-700 mb-1 font-medium">💰 Available Balance</p>
          <p className="text-3xl font-bold text-green-700">
            Rs {stats?.available.toLocaleString()}
          </p>
          <p className="text-xs text-green-600 mt-1">Released — ready to withdraw</p>
        </div>
        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-5">
          <p className="text-xs text-yellow-700 mb-1 font-medium">⏳ Pending (in escrow)</p>
          <p className="text-3xl font-bold text-yellow-600">
            Rs {stats?.pending.toLocaleString()}
          </p>
          <p className="text-xs text-yellow-600 mt-1">Locked during 7-day return window</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Total Earned (delivered)</p>
          <p className="text-3xl font-bold text-gray-900">
            Rs {stats?.totalEarnings.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">{stats?.deliveredCount} delivered orders</p>
        </div>
      </div>

      {/* Breakdown cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Product Revenue</p>
          <p className="text-2xl font-bold text-gray-900">
            Rs {stats?.productRevenue.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">Before commission</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Commission Paid</p>
          <p className="text-2xl font-bold text-orange-500">
            − Rs {stats?.totalCommission.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1">5% platform fee on products</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">In-Progress Orders</p>
          <p className="text-2xl font-bold text-indigo-500">{stats?.inProgressCount}</p>
          <p className="text-xs text-gray-400 mt-1">
            ~Rs {stats?.inProgressEarning.toLocaleString()} once delivered
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
                  <img src={product.image} alt={product.name}
                    className="w-10 h-10 rounded-lg object-cover border border-gray-100 flex-shrink-0" />
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
          <h3 className="font-semibold text-gray-900 mb-4">Recent Delivered Orders</h3>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">🧾</div>
              <p className="text-sm">No delivered orders in this period</p>
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
                      {new Date(order.createdAt).toLocaleDateString('en-NP', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">
                      Product Rs {order.subtotal.toLocaleString()}
                    </p>
                    <p className="text-sm font-semibold text-green-600">
                      You earn Rs {sellerEarning(order).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ml-2
                    ${order.settlement?.sellerReleased ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {order.settlement?.sellerReleased ? 'Released' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How earnings work */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mt-5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm font-semibold text-indigo-900 mb-1">How your earnings work</p>
            <p className="text-sm text-indigo-700">
              Your earning = <strong>product price − 5% commission</strong>. The delivery charge is
              <strong> not</strong> part of your earnings — it pays the delivery agent.
              After delivery, your earning is held in escrow for <strong>7 days</strong> (the return window).
              Once the window passes with no return, it moves to your <strong>Available Balance</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EarningsPage;