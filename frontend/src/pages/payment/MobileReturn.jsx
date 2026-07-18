import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

// Khalti/eSewa reject non-http(s) return URLs (Khalti: {"return_url":["Enter
// a valid URL."]}), so mobile-sourced payments can't hand them a nepshop://
// deep link directly. Instead the backend's return-URL allowlist
// (backend/controllers/paymentController.js RETURN_URLS.mobile) points
// gateways here — a plain https URL they'll accept — and this page's only
// job is to bounce the browser straight back into the app via the SAME
// deep link the allowlist already produces for source:'mobile', carrying
// the gateway's full query string through unchanged (pidx/status for
// Khalti, data for eSewa).
//
// Deliberately no auth, no API calls, no app state: this loads inside the
// bare in-app browser sheet expo-web-browser opens (openAuthSessionAsync),
// which has no session with this site at all.
const TARGET_DEEP_LINKS = {
  khalti: 'nepshop://payment/khalti/verify',
  esewa:  'nepshop://payment/esewa/verify',
  failed: 'nepshop://payment/failed',
};

const MobileReturn = () => {
  const { target } = useParams();
  const deepLink = TARGET_DEEP_LINKS[target];

  useEffect(() => {
    if (!deepLink) return;
    const query = target === 'failed' ? '' : window.location.search;
    window.location.replace(`${deepLink}${query}`);
  }, [deepLink, target]);

  if (!deepLink) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unknown payment return</h2>
          <p className="text-gray-500 text-sm">This link isn't recognized. Please return to the NepShop app and try again.</p>
        </div>
      </div>
    );
  }

  const fullDeepLink = `${deepLink}${target === 'failed' ? '' : window.location.search}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
        <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Returning to the NepShop app…</h2>
        <p className="text-gray-500 text-sm mb-6">
          If nothing happens automatically, tap below.
        </p>
        <a
          href={fullDeepLink}
          className="block w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-all"
        >
          Open NepShop app
        </a>
      </div>
    </div>
  );
};

export default MobileReturn;
