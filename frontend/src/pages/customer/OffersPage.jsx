import { useState, useEffect } from 'react';
import API from '../../utils/api';

const OffersPage = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied]   = useState(null);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/coupons/available');
      setCoupons(data.coupons);
    } catch (err) {
      console.error('Failed to fetch offers:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const discountLabel = (c) =>
    c.type === 'fixed' ? `Rs ${c.value} OFF` : `${c.value}% OFF`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Offers & Coupons</h2>
        <p className="text-sm text-gray-400">Apply these codes at checkout to save</p>
      </div>

      {coupons.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🎟️</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No offers right now</h3>
          <p className="text-gray-500 text-sm">Check back soon for new deals and discounts</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {coupons.map((c) => (
            <div key={c.code} className="bg-white border border-gray-200 rounded-xl overflow-hidden flex">
              {/* Left ticket stub */}
              <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-4 flex flex-col items-center justify-center min-w-28 relative">
                <span className="text-xs text-indigo-200">SAVE</span>
                <span className="text-xl font-bold leading-tight text-center">{discountLabel(c)}</span>
                {/* notches */}
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-50 rounded-full"></div>
              </div>

              {/* Right details */}
              <div className="flex-1 p-4">
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {c.description || discountLabel(c)}
                </p>
                <div className="text-xs text-gray-400 space-y-0.5 mb-3">
                  {c.minOrder > 0 && <p>Min. order: Rs {c.minOrder.toLocaleString()}</p>}
                  {c.type === 'percentage' && c.maxDiscount > 0 && (
                    <p>Max discount: Rs {c.maxDiscount.toLocaleString()}</p>
                  )}
                  {c.expiresAt && (
                    <p>Expires: {new Date(c.expiresAt).toLocaleDateString('en-NP', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}</p>
                  )}
                </div>

                {/* Code + copy */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 bg-gray-50">
                    <span className="text-sm font-mono font-bold text-gray-700 tracking-wider">{c.code}</span>
                  </div>
                  <button
                    onClick={() => copyCode(c.code)}
                    className="text-xs font-medium px-3 py-2 rounded-lg transition-all bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {copied === c.code ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default OffersPage;