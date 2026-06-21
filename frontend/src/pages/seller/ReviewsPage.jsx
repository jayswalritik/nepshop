import { useState, useEffect } from 'react';
import API from '../../utils/api';

const ReviewsPage = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState(0); // 0 = all, 1-5 = star filter
  const [stats, setStats]     = useState({
    avg: 0, total: 0,
    breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/reviews/seller/all');
      setReviews(data.reviews);

      // Calculate stats
      const total = data.reviews.length;
      const avg   = total > 0
        ? (data.reviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1)
        : 0;
      const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      data.reviews.forEach(r => breakdown[r.rating]++);
      setStats({ avg, total, breakdown });
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 0
    ? reviews
    : reviews.filter(r => r.rating === filter);

  return (
    <div>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : reviews.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-3">⭐</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No reviews yet</h3>
          <p className="text-gray-500 text-sm">Customer reviews will appear here after delivery</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">

          {/* Stats sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
              <div className="text-center mb-4">
                <div className="text-5xl font-bold text-gray-900">{stats.avg}</div>
                <div className="flex justify-center gap-0.5 my-2">
                  {[1,2,3,4,5].map(s => (
                    <span key={s} className={`text-xl ${s <= Math.round(stats.avg) ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                  ))}
                </div>
                <p className="text-sm text-gray-400">{stats.total} total reviews</p>
              </div>

              {/* Star breakdown */}
              <div className="space-y-2">
                {[5,4,3,2,1].map(star => (
                  <button
                    key={star}
                    onClick={() => setFilter(filter === star ? 0 : star)}
                    className={`w-full flex items-center gap-2 p-1.5 rounded-lg transition-all
                      ${filter === star ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-xs text-gray-600 w-3">{star}</span>
                    <span className="text-yellow-400 text-xs">★</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-yellow-400 h-2 rounded-full transition-all"
                        style={{ width: stats.total > 0 ? `${(stats.breakdown[star] / stats.total) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-4">{stats.breakdown[star]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reviews list */}
          <div className="lg:col-span-2">
            {filter > 0 && (
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">
                  Showing {filter}★ reviews ({filtered.length})
                </p>
                <button
                  onClick={() => setFilter(0)}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Clear filter
                </button>
              </div>
            )}

            <div className="space-y-3">
              {filtered.map((review) => (
                <div key={review._id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    {/* Product image */}
                    <img
                      src={review.product?.images[0]?.url}
                      alt={review.product?.name}
                      className="w-12 h-12 object-cover rounded-lg border border-gray-100 flex-shrink-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate max-w-48">
                            {review.product?.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            by {review.customer?.firstName} {review.customer?.lastName}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {[1,2,3,4,5].map(s => (
                            <span key={s} className={`text-sm ${s <= review.rating ? 'text-yellow-400' : 'text-gray-200'}`}>★</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{review.comment}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(review.createdAt).toLocaleDateString('en-NP', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewsPage;