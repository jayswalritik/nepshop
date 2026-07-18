import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../../../src/context/AuthContext';
import { verifyKhalti } from '../../../../src/utils/payment';
import PaymentVerifyStatus from '../../../../src/components/PaymentVerifyStatus';

// Deep-link landing screen for nepshop://payment/khalti/verify — mirrors
// frontend/src/pages/payment/KhaltiVerify.jsx exactly: Khalti-reported
// cancel/failure (the `status` param) short-circuits locally with no
// backend call; otherwise POST /payment/khalti/verify { pidx } only (mobile
// never sends orderData — backend/controllers/paymentController.js's
// PendingPayment-backed verify contract looks it up server-side by pidx,
// same refactor web already went through).
//
// No explicit cart refresh after success: web's fetchCart() there just
// refreshes a CartContext mobile doesn't have (mobile/src/utils/cart.js's
// own file header: "mobile has no cart context/global state yet"). The
// mobile precedent is checkout.js's COD success path, which also does
// nothing cart-related after placing an order — Cart tab's own
// useFocusEffect (mobile/app/(customer)/cart.js) is the single source of
// truth whenever the user next looks at it. Reusing that existing path by
// doing nothing here, not inventing a new one.
//
// COLD-START GUARD: this route can be reached directly by the OS opening a
// killed app via deep link, bypassing app/index.js's own `loading` gate
// entirely — (customer)/_layout.js renders RoleTabs unconditionally, with
// no auth check of its own. If the verify POST fired immediately on mount,
// it could race AuthContext's async SecureStore restore and go out with no
// Authorization header. Guarding on `token` (set synchronously right after
// the fast SecureStore reads, well before AuthContext's slower /auth/me
// refresh resolves) fixes this without waiting on the full `loading` flag,
// which can stay true for the Render free-tier's ~30-60s cold-start window.
export default function KhaltiVerifyScreen() {
  const { pidx, status: txnStatus } = useLocalSearchParams();
  const { token, loading } = useAuth();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (txnStatus === 'User canceled' || txnStatus === 'Failed') {
        setStatus('failed');
        setMessage(
          txnStatus === 'User canceled'
            ? 'Payment was cancelled. Your cart is still saved.'
            : 'Payment failed — this could be due to insufficient balance or a network issue. Your cart is still saved.'
        );
        return;
      }

      if (!token) {
        if (!loading) {
          setStatus('failed');
          setMessage('Please log in and try again.');
        }
        return; // wait for AuthContext to finish restoring the token
      }

      let cancelled = false;
      (async () => {
        const result = await verifyKhalti(pidx);
        if (cancelled) return;
        if (result.success) {
          setOrder(result.order);
          setStatus('success');
          setMessage(result.message || 'Payment successful! Your order has been placed.');
        } else if (result.message === 'Payment already processed') {
          setStatus('already-processed');
          setMessage(result.message);
        } else {
          setStatus('failed');
          setMessage(result.message);
        }
      })();
      return () => { cancelled = true; };
    }, [pidx, txnStatus, token, loading])
  );

  return <PaymentVerifyStatus status={status} message={message} order={order} gatewayLabel="Khalti" />;
}
