import { useCallback, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../../../src/context/AuthContext';
import { verifyEsewa } from '../../../../src/utils/payment';
import PaymentVerifyStatus from '../../../../src/components/PaymentVerifyStatus';

// Deep-link landing screen for nepshop://payment/esewa/verify — mirrors
// frontend/src/pages/payment/EsewaVerify.jsx post-PendingPayment-refactor:
// reads only `data` (eSewa's own signed base64 blob) and posts it as-is;
// mobile never sends orderData, same as web now does. No initiate-side
// wiring exists yet on mobile (see the task summary — eSewa requires a form
// POST that expo-web-browser's openAuthSessionAsync cannot perform), but
// this verify screen is fully functional and ready for whenever that's
// solved, since verification doesn't depend on how the browser was opened.
//
// Same "no explicit cart refresh" and cold-start auth-readiness guard as
// the Khalti screen — see its comment for the full explanation.
export default function EsewaVerifyScreen() {
  const { data } = useLocalSearchParams();
  const { token, loading } = useAuth();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!data) {
        setStatus('failed');
        setMessage('Payment was cancelled. Your cart is still saved.');
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
        const result = await verifyEsewa(data);
        if (cancelled) return;
        if (result.success) {
          setOrder(result.order);
          setStatus('success');
          setMessage(result.message || 'Payment successful! Your order has been confirmed.');
        } else if (result.message === 'Payment already processed') {
          setStatus('already-processed');
          setMessage(result.message);
        } else {
          setStatus('failed');
          setMessage(result.message);
        }
      })();
      return () => { cancelled = true; };
    }, [data, token, loading])
  );

  return <PaymentVerifyStatus status={status} message={message} order={order} gatewayLabel="eSewa" />;
}
