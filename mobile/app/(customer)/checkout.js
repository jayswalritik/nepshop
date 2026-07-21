import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../src/context/AuthContext';
import { getCartSummary } from '../../src/utils/cart';
import { getAvailableCoupons } from '../../src/utils/coupons';
import { placeOrder } from '../../src/utils/orders';
import { initiateKhalti, initiateEsewa } from '../../src/utils/payment';
import ScreenHeader from '../../src/components/ScreenHeader';
import Dropdown from '../../src/components/Dropdown';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';
import { DISTRICTS } from '../../src/constants/districts';
import { formatRs } from '../../src/utils/format';

// Mirrors frontend/src/pages/customer/CartPage.jsx's CheckoutPage: same
// address fields/validation, same GET /coupons/available suggestions, same
// POST /orders COD payload. Order Summary numbers come ENTIRELY from
// GET /api/cart/summary (backend/controllers/cartController.js's
// getCartSummary) — nothing here computes delivery, coupon, or totals.
// Khalti/eSewa show their own brand logos, the same images web uses
// (frontend/public/payment-logos/*.png, copied to mobile/assets/payment-logos/
// since a native bundle can't read the web app's public/ dir). Rendered at the
// same 24x56 contain box as web's `h-6 w-14 object-contain`, with the same
// logo-or-icon fallback. Cash on Delivery keeps its Ionicon — web uses an
// emoji there and has no logo for it either.
//
// Both gateways are enabled, and both open through the same
// openGatewayAndWait helper below (WebBrowser.openAuthSessionAsync, waiting
// for the OS to deliver the matching nepshop://... deep link):
//
// - Khalti: POST /payment/khalti/initiate with source:'mobile' returns a
//   paymentUrl straight from Khalti — a plain GET-style browser navigation,
//   which openAuthSessionAsync handles natively.
// - eSewa needs a real HTML <form method="POST"> of signed hidden fields
//   (amount, transaction_uuid, product_code, signature, success_url,
//   failure_url) submitted to eSewa's gateway, same as web builds inline as
//   a DOM <form>. openAuthSessionAsync only accepts a URL string for a GET
//   navigation — no method/body option — and browsers block top-level
//   navigation to data: URIs, so mobile can't build+submit that form
//   itself. Solved with a backend bridge: POST /payment/esewa/initiate
//   (source:'mobile') now also returns formUrl, a GET endpoint
//   (backend/controllers/paymentController.js's esewaForm) that
//   server-renders + auto-submits the identical signed form. Mobile just
//   opens formUrl exactly like Khalti's paymentUrl.
const PAYMENT_METHODS = [
  { value: 'cash_on_delivery', label: 'Cash on Delivery', icon: 'cash-outline', desc: 'Pay when your order arrives', enabled: true },
  { value: 'khalti', label: 'Khalti', icon: 'wallet-outline', logo: require('../../assets/payment-logos/khalti-logo.png'), desc: 'Pay with Khalti wallet', enabled: true },
  { value: 'esewa', label: 'eSewa', icon: 'wallet-outline', logo: require('../../assets/payment-logos/esewa-logo.png'), desc: 'Pay with eSewa wallet', enabled: true },
];

export default function CheckoutScreen() {
  const { user } = useAuth();

  const [address, setAddress] = useState({
    fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    phone: user?.phone || '',
    street: '',
    city: '',
    district: '',
    landmark: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('cash_on_delivery');
  const [customerNote, setCustomerNote] = useState('');

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [couponInput, setCouponInput] = useState('');
  const [couponApplying, setCouponApplying] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);

  const [placing, setPlacing] = useState(false);
  const [awaitingGateway, setAwaitingGateway] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const [orderResult, setOrderResult] = useState(null);

  const appliedCode = summary?.coupon?.valid ? summary.coupon.code : null;
  // Mirrors `appliedCode` without being a dependency of the focus effect
  // below — lets the refocus refetch re-apply whatever coupon was active,
  // without needing to re-run every time appliedCode itself changes.
  const appliedCodeRef = useRef(null);
  useEffect(() => {
    appliedCodeRef.current = appliedCode;
  }, [appliedCode]);

  const fetchSummary = useCallback(async (couponCode) => {
    const result = await getCartSummary(couponCode);
    if (result.success) setSummary(result.summary);
    return result;
  }, []);

  // Refetch on every focus, not just the first mount. Checkout is a hidden
  // tab route (mobile/src/navigation/roleNavConfig.js's hiddenRoutes,
  // rendered via RoleTabs.js's href:null Tabs.Screen), so React Navigation
  // keeps it mounted in the background instead of unmounting it when you
  // navigate away — a plain useEffect only ever ran once, on that very
  // first mount. Revisiting Checkout after selecting/deselecting items on
  // the Cart tab reused that same stale mounted instance and kept showing
  // the FIRST summary ever fetched — server state had moved on, but the
  // screen hadn't asked again. useFocusEffect (same pattern cart.js already
  // uses) makes the server the single source of truth for what's eligible,
  // every time this screen is actually looked at.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        setSummaryLoading(true);
        await fetchSummary(appliedCodeRef.current || undefined);
        setSummaryLoading(false);
      })();
    }, [fetchSummary])
  );

  useEffect(() => {
    getAvailableCoupons().then((r) => setAvailableCoupons(r.coupons));
  }, []);

  const handleApplyCoupon = async (codeOverride) => {
    const code = (codeOverride ?? couponInput).trim();
    if (!code) return;
    setCouponInput(code);
    setCouponApplying(true);
    await fetchSummary(code);
    setCouponApplying(false);
  };

  const handleRemoveCoupon = async () => {
    setCouponInput('');
    setSummaryLoading(true);
    await fetchSummary();
    setSummaryLoading(false);
  };

  const handleAddressChange = (field, value) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    setPlaceError('');
  };

  const validateAddress = () => {
    const errs = {};
    if (!address.fullName.trim()) errs.fullName = 'Full name is required';
    if (!address.phone.trim()) errs.phone = 'Phone is required';
    if (!address.street.trim()) errs.street = 'Street address is required';
    if (!address.city.trim()) errs.city = 'City is required';
    if (!address.district) errs.district = 'District is required';
    return errs;
  };

  // Shared by both gateways — open the gateway URL in the browser sheet and
  // wait for it to resolve. openAuthSessionAsync resolves 'success' when the
  // OS delivers the matching nepshop://... deep link (that verify screen
  // owns the actual verify call from here); 'cancel'/'dismiss' means the
  // user swiped the sheet away or backed out before completing — nothing
  // was created or charged (PendingPayment stays 'initiated' until
  // TTL-reaped), cart and checkout are untouched, so this just surfaces a
  // non-alarming notice and lets them try again.
  const openGatewayAndWait = async (url, redirectUrl) => {
    setPlacing(false);
    setAwaitingGateway(true);
    try {
      const browserResult = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
      if (browserResult.type !== 'success') {
        setPlaceError('Payment was not completed. You can try again.');
      }
    } catch {
      setPlaceError('Could not open the payment page. Please try again.');
    } finally {
      setAwaitingGateway(false);
    }
  };

  const handlePlaceOrder = async () => {
    const errs = validateAddress();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setPlaceError('Please complete your delivery address.');
      return;
    }
    setPlaceError('');
    setPlacing(true);

    if (paymentMethod === 'khalti') {
      const result = await initiateKhalti({
        deliveryAddress: address,
        customerNote,
        couponCode: appliedCode,
      });
      if (!result.success) {
        setPlacing(false);
        setPlaceError(result.message);
        return;
      }
      await openGatewayAndWait(result.paymentUrl, 'nepshop://payment/khalti/verify');
      return;
    }

    if (paymentMethod === 'esewa') {
      const result = await initiateEsewa({
        deliveryAddress: address,
        customerNote,
        couponCode: appliedCode,
      });
      if (!result.success) {
        setPlacing(false);
        setPlaceError(result.message);
        return;
      }
      if (!result.formUrl) {
        // Backend contract violation — initiateEsewa's response is missing
        // formUrl (backend/controllers/paymentController.js should always
        // include it). Fail loudly rather than silently, since there is no
        // fallback way to open eSewa's form from mobile.
        setPlacing(false);
        setPlaceError('Could not start eSewa payment. Please try again.');
        return;
      }
      await openGatewayAndWait(result.formUrl, 'nepshop://payment/esewa/verify');
      return;
    }

    const result = await placeOrder({
      deliveryAddress: address,
      customerNote,
      couponCode: appliedCode,
    });
    setPlacing(false);
    if (result.success) {
      setOrderResult(result.order);
    } else {
      setPlaceError(result.message);
    }
  };

  if (orderResult) {
    return <OrderSuccess order={orderResult} />;
  }

  const packages = summary?.packages || [];
  const canPlaceOrder = !summaryLoading && packages.length > 0 && !placing && !awaitingGateway;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Checkout" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 1. Delivery address */}
        <Section title="Delivery Address">
          <Field
            label="Full name"
            value={address.fullName}
            onChangeText={(v) => handleAddressChange('fullName', v)}
            error={fieldErrors.fullName}
          />
          <Field
            label="Phone"
            value={address.phone}
            onChangeText={(v) => handleAddressChange('phone', v)}
            error={fieldErrors.phone}
            keyboardType="phone-pad"
          />
          <Field
            label="Street address"
            value={address.street}
            onChangeText={(v) => handleAddressChange('street', v)}
            error={fieldErrors.street}
            placeholder="e.g. Putalisadak, House no. 12"
          />
          <View style={styles.row}>
            <View style={styles.half}>
              <Field
                label="City"
                value={address.city}
                onChangeText={(v) => handleAddressChange('city', v)}
                error={fieldErrors.city}
                placeholder="e.g. Kathmandu"
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>District</Text>
              <Dropdown
                value={address.district}
                onChange={(v) => handleAddressChange('district', v)}
                options={DISTRICTS}
                placeholder="Select"
                error={fieldErrors.district}
              />
              {fieldErrors.district && <Text style={styles.fieldError}>{fieldErrors.district}</Text>}
            </View>
          </View>
          <Field
            label="Landmark (optional)"
            value={address.landmark}
            onChangeText={(v) => handleAddressChange('landmark', v)}
            placeholder="e.g. Near post office"
          />
        </Section>

        {/* 2. Order summary — entirely from GET /cart/summary */}
        <Section title="Order Summary">
          {summaryLoading ? (
            <ActivityIndicator color={COLORS.primary} style={styles.summaryLoader} />
          ) : packages.length === 0 ? (
            <Text style={styles.emptyNote}>
              No items selected — go back to your cart and select at least one item.
            </Text>
          ) : (
            <>
              {packages.map((pkg) => (
                <PackageCard key={pkg.seller} pkg={pkg} />
              ))}

              <View style={styles.summaryTotals}>
                <TotalRow label="Subtotal" value={formatRs(summary.itemsSubtotal)} />
                {packages.length > 1 && (
                  <Text style={styles.packagesNote}>
                    📦 Arrives in {packages.length} packages — delivery charged per package
                  </Text>
                )}
                <TotalRow
                  label="Delivery"
                  value={summary.totalDelivery === 0 ? 'FREE' : formatRs(summary.totalDelivery)}
                  highlight={summary.totalDelivery === 0}
                />
                {summary.totalDiscount > 0 && (
                  <TotalRow label="Coupon discount" value={`− ${formatRs(summary.totalDiscount)}`} highlight />
                )}
                <View style={styles.summaryDivider} />
                <TotalRow label="Total" value={formatRs(summary.grandTotal)} bold />
              </View>
            </>
          )}
        </Section>

        {/* 3. Coupon */}
        <Section title="Coupon">
          {summary?.coupon?.valid ? (
            <View style={styles.appliedCoupon}>
              <View style={styles.appliedCouponText}>
                <Text style={styles.appliedCouponCode}>{summary.coupon.code} applied</Text>
                <Text style={styles.appliedCouponSaved}>You saved {formatRs(summary.coupon.discount)}</Text>
              </View>
              <Pressable onPress={handleRemoveCoupon}>
                <Text style={styles.removeCouponText}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.couponRow}>
                <TextInput
                  style={styles.couponInput}
                  value={couponInput}
                  onChangeText={(t) => setCouponInput(t.toUpperCase())}
                  placeholder="Coupon code"
                  placeholderTextColor={COLORS.tabInactive}
                  autoCapitalize="characters"
                />
                <Pressable
                  style={styles.couponApplyButton}
                  onPress={() => handleApplyCoupon()}
                  disabled={couponApplying}
                >
                  <Text style={styles.couponApplyText}>{couponApplying ? '…' : 'Apply'}</Text>
                </Pressable>
              </View>
              {summary?.coupon && !summary.coupon.valid && (
                <Text style={styles.couponError}>{summary.coupon.message}</Text>
              )}
            </>
          )}

          {availableCoupons.length > 0 && !summary?.coupon?.valid && (
            <View style={styles.suggestionWrap}>
              <Text style={styles.suggestionLabel}>Available offers — tap to apply:</Text>
              <View style={styles.suggestionRow}>
                {availableCoupons.map((c) => {
                  const eligible = (summary?.itemsSubtotal || 0) >= (c.minOrder || 0);
                  return (
                    <Pressable
                      key={c.code}
                      style={[styles.suggestionChip, !eligible && styles.suggestionChipDisabled]}
                      disabled={!eligible || couponApplying}
                      onPress={() => handleApplyCoupon(c.code)}
                    >
                      <Text style={[styles.suggestionChipText, !eligible && styles.suggestionChipTextDisabled]}>
                        🎟️ {c.code} ({c.type === 'fixed' ? formatRs(c.value) : `${c.value}%`})
                      </Text>
                      {!eligible && <Text style={styles.suggestionChipMin}>min {formatRs(c.minOrder)}</Text>}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </Section>

        {/* 4. Payment method */}
        <Section title="Payment Method">
          {PAYMENT_METHODS.map((m) => (
            <Pressable
              key={m.value}
              style={[
                styles.paymentRow,
                paymentMethod === m.value && styles.paymentRowActive,
                !m.enabled && styles.paymentRowDisabled,
              ]}
              disabled={!m.enabled}
              onPress={() => setPaymentMethod(m.value)}
            >
              <Ionicons
                name={paymentMethod === m.value ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={!m.enabled ? COLORS.tabInactive : paymentMethod === m.value ? COLORS.primary : COLORS.border}
              />
              {m.logo ? (
                <Image source={m.logo} style={styles.paymentLogo} resizeMode="contain" />
              ) : (
                <Ionicons name={m.icon} size={20} color={m.enabled ? COLORS.text : COLORS.tabInactive} />
              )}
              <View style={styles.paymentTextWrap}>
                <Text style={[styles.paymentLabel, !m.enabled && styles.paymentLabelDisabled]}>{m.label}</Text>
                <Text style={styles.paymentDesc}>{m.desc}</Text>
              </View>
              {!m.enabled && (
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Coming soon</Text>
                </View>
              )}
            </Pressable>
          ))}
        </Section>

        {/* 5. Customer note */}
        <Section title="Order Note (optional)">
          <TextInput
            style={styles.noteInput}
            value={customerNote}
            onChangeText={setCustomerNote}
            placeholder="Any special instructions for your order..."
            placeholderTextColor={COLORS.tabInactive}
            multiline
            numberOfLines={3}
          />
        </Section>

        {placeError ? <Text style={styles.placeError}>{placeError}</Text> : null}
      </ScrollView>

      <View style={styles.stickyBar}>
        <View style={styles.stickyBarTotal}>
          <Text style={styles.stickyBarTotalLabel}>Total</Text>
          <Text style={styles.stickyBarTotalValue}>{summary ? formatRs(summary.grandTotal) : '—'}</Text>
        </View>
        <Pressable
          style={[styles.placeOrderButton, !canPlaceOrder && styles.placeOrderButtonDisabled]}
          disabled={!canPlaceOrder}
          onPress={handlePlaceOrder}
        >
          <Text style={styles.placeOrderButtonText}>
            {placing
              ? 'Placing order…'
              : awaitingGateway
                ? `Waiting for ${paymentMethod === 'esewa' ? 'eSewa' : 'Khalti'}…`
                : 'Place Order'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, value, onChangeText, error, placeholder, keyboardType }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.tabInactive}
        keyboardType={keyboardType}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function PackageCard({ pkg }) {
  return (
    <View style={styles.package}>
      <Text style={styles.packageSeller}>
        {pkg.sellerName} · {pkg.items.length} item{pkg.items.length > 1 ? 's' : ''}
      </Text>
      {pkg.items.map((item) => (
        <View key={item.product} style={styles.packageItem}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.packageItemImage} />
          ) : (
            <View style={[styles.packageItemImage, styles.packageItemImageFallback]}>
              <Ionicons name="image-outline" size={16} color={COLORS.tabInactive} />
            </View>
          )}
          <View style={styles.packageItemInfo}>
            <Text style={styles.packageItemName} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.packageItemQty}>Qty: {item.quantity}</Text>
          </View>
          <Text style={styles.packageItemPrice}>{formatRs(item.price)}</Text>
        </View>
      ))}
      <View style={styles.packageFooter}>
        <Text style={styles.packageFooterLabel}>Package subtotal</Text>
        <Text style={styles.packageFooterValue}>{formatRs(pkg.packageSubtotal)}</Text>
      </View>
      <View style={styles.packageFooter}>
        <Text style={styles.packageFooterLabel}>Delivery</Text>
        <Text style={[styles.packageFooterValue, pkg.deliveryCharge === 0 && styles.freeText]}>
          {pkg.deliveryCharge === 0 ? 'FREE' : formatRs(pkg.deliveryCharge)}
        </Text>
      </View>
      {pkg.couponAllocation > 0 && (
        <View style={styles.packageFooter}>
          <Text style={styles.packageFooterLabel}>Coupon</Text>
          <Text style={[styles.packageFooterValue, styles.freeText]}>− {formatRs(pkg.couponAllocation)}</Text>
        </View>
      )}
    </View>
  );
}

function TotalRow({ label, value, bold, highlight }) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalRowLabel, bold && styles.totalRowLabelBold]}>{label}</Text>
      <Text style={[styles.totalRowValue, bold && styles.totalRowValueBold, highlight && styles.totalRowValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

function OrderSuccess({ order }) {
  const shortId = order._id.toString().slice(-8).toUpperCase();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Order Placed" />
      <View style={styles.successContainer}>
        <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
        <Text style={styles.successTitle}>Order placed!</Text>
        <Text style={styles.successOrderId}>Order #{shortId}</Text>

        <View style={styles.successAmountBox}>
          <Text style={styles.successAmountLabel}>Amount payable on delivery</Text>
          <Text style={styles.successAmountValue}>{formatRs(order.total)}</Text>
        </View>

        <Pressable style={styles.successPrimaryButton} onPress={() => router.replace('/(customer)/orders')}>
          <Text style={styles.successPrimaryButtonText}>View My Orders</Text>
        </Pressable>
        <Pressable style={styles.successSecondaryButton} onPress={() => router.replace('/(customer)/home')}>
          <Text style={styles.successSecondaryButtonText}>Continue Shopping</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: 32,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  fieldWrap: {
    marginBottom: SPACING.sm + 2,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  half: {
    flex: 1,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 3,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  fieldError: {
    color: COLORS.danger,
    fontSize: 11.5,
    marginTop: 3,
  },
  summaryLoader: {
    marginVertical: SPACING.xl,
  },
  emptyNote: {
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  package: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  packageSeller: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm + 2,
  },
  packageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm + 2,
  },
  packageItemImage: {
    width: 40,
    height: 40,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
  },
  packageItemImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  packageItemInfo: {
    flex: 1,
  },
  packageItemName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.text,
  },
  packageItemQty: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  packageItemPrice: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.text,
  },
  packageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 2,
  },
  packageFooterLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  packageFooterValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  freeText: {
    color: COLORS.success,
  },
  summaryTotals: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    ...SHADOWS.card,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalRowLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  totalRowLabelBold: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  totalRowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalRowValueBold: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.primary,
  },
  totalRowValueHighlight: {
    color: COLORS.success,
  },
  packagesNote: {
    fontSize: 11,
    color: COLORS.tabInactive,
    marginVertical: 4,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  couponRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  couponInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 3,
    fontSize: 14,
    color: COLORS.text,
    textTransform: 'uppercase',
  },
  couponApplyButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
  },
  couponApplyText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  couponError: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: SPACING.sm,
  },
  appliedCoupon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.successSoft,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  appliedCouponText: {
    flex: 1,
  },
  appliedCouponCode: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
  },
  appliedCouponSaved: {
    fontSize: 11.5,
    color: COLORS.success,
  },
  removeCouponText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  suggestionWrap: {
    marginTop: SPACING.md,
  },
  suggestionLabel: {
    fontSize: 11.5,
    color: COLORS.tabInactive,
    marginBottom: SPACING.sm,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  suggestionChip: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm - 1,
  },
  suggestionChipDisabled: {
    borderColor: COLORS.border,
  },
  suggestionChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: COLORS.primary,
  },
  suggestionChipTextDisabled: {
    color: COLORS.tabInactive,
  },
  suggestionChipMin: {
    fontSize: 10,
    color: COLORS.tabInactive,
    marginTop: 1,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  paymentRowActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primarySoft,
  },
  paymentRowDisabled: {
    opacity: 0.6,
  },
  // Same box as web's `h-6 w-14 object-contain` — a fixed frame so the two
  // logos (different aspect ratios) line up and the row height doesn't shift
  // between payment options.
  paymentLogo: {
    width: 56,
    height: 24,
  },
  paymentTextWrap: {
    flex: 1,
  },
  paymentLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.text,
  },
  paymentLabelDisabled: {
    color: COLORS.tabInactive,
  },
  paymentDesc: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  comingSoonBadge: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.tabInactive,
  },
  noteInput: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 3,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  placeError: {
    color: COLORS.danger,
    fontSize: 13,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.stickyBar,
  },
  stickyBarTotal: {
    flex: 1,
  },
  stickyBarTotalLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  stickyBarTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  placeOrderButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.sm + 2,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  placeOrderButtonDisabled: {
    opacity: 0.5,
  },
  placeOrderButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
    gap: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING.md,
  },
  successOrderId: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
  },
  successAmountBox: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  successAmountLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  successAmountValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
  },
  successPrimaryButton: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm + 2,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  successPrimaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  successSecondaryButton: {
    width: '100%',
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  successSecondaryButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
});
