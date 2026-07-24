import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import RoleUpgrade from '../../src/components/RoleUpgrade';
import ChangePasswordForm from '../../src/components/ChangePasswordForm';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';

// Pushed hidden route (mobile/src/navigation/roleNavConfig.js's delivery
// hiddenRoutes), reached from the Account tab's "Edit Profile & Payout"
// row — mirrors frontend/src/pages/delivery/ProfilePage.jsx exactly:
// <RoleUpgrade/> (reused as-is — it already handles the delivery-agent
// "become a customer" case generically, no fork needed, see the component's
// own header comment), LOCKED First/Last name (delivery agents are
// identity-verified in person — backend/controllers/authController.js's
// updateDeliveryProfile rejects any genuine name change; this UI lock is a
// courtesy, not the guard) + editable Phone, read-only Email, Payout
// Details (preferred method + conditional fields), then Account Information
// (vehicle type/status/member since). Same single PUT /auth/delivery/profile
// call web's handleSave makes — the locked name fields still ride along in
// the payload unchanged (a no-op server-side), profile AND payout fields
// submitted together in one request, not two.
// Khalti/eSewa carry their real brand logos — the same PNGs the customer
// checkout already ships (app/(customer)/checkout.js:60-61,
// mobile/assets/payment-logos/). Bank Transfer has no brand mark, so it takes
// a tokenized Ionicon rather than a lone emoji beside two real logos; that
// keeps the three chips reading as one set. `key`/`label` are unchanged —
// selection state and the PUT payload are untouched.
const PAYOUT_METHODS = [
  { key: 'bank', label: 'Bank Transfer', icon: 'business' },
  { key: 'khalti', label: 'Khalti', logo: require('../../assets/payment-logos/khalti-logo.png') },
  { key: 'esewa', label: 'eSewa', logo: require('../../assets/payment-logos/esewa-logo.png') },
];

// firstName/lastName are locked (not user-editable), so they can never fail
// validation here — checking them would risk silently blocking a legitimate
// phone/payout-only save with no visible error, since neither field renders
// an error message anymore.
// Phone rule — identical to the backend (backend/utils/contactValidation.js):
// exactly 10 digits starting 98/97. Enforced only when the phone actually
// changes, so a legacy number still saves untouched.
const PHONE_RE = /^(98|97)\d{8}$/;
const PHONE_MSG = 'Phone number must be exactly 10 digits and start with 98 or 97.';
// Khalti/eSewa payout numbers — optional, but must be valid when non-empty.
const KHALTI_MSG = 'Khalti number must be exactly 10 digits and start with 98 or 97.';
const ESEWA_MSG  = 'eSewa number must be exactly 10 digits and start with 98 or 97.';

const validate = (form, originalPhone = '') => {
  const errs = {};
  if (!form.phone.trim()) errs.phone = 'Phone is required';
  else if (form.phone.trim() !== (originalPhone || '').trim() && !PHONE_RE.test(form.phone.trim()))
    errs.phone = PHONE_MSG;
  // Payout numbers are optional — validate only when non-empty.
  if (form.khaltiNumber.trim() && !PHONE_RE.test(form.khaltiNumber.trim())) errs.khaltiNumber = KHALTI_MSG;
  if (form.esewaNumber.trim()  && !PHONE_RE.test(form.esewaNumber.trim()))  errs.esewaNumber  = ESEWA_MSG;
  return errs;
};

export default function DeliveryProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    preferredMethod: user?.payoutDetails?.preferredMethod || '',
    bankName: user?.payoutDetails?.bankName || '',
    accountNumber: user?.payoutDetails?.accountNumber || '',
    accountHolderName: user?.payoutDetails?.accountHolderName || '',
    khaltiNumber: user?.payoutDetails?.khaltiNumber || '',
    esewaNumber: user?.payoutDetails?.esewaNumber || '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setError('');
    setSuccess('');
  };

  const handleSave = async () => {
    const errs = validate(form, user?.phone);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await updateProfile(
        {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          payoutDetails: {
            preferredMethod: form.preferredMethod,
            bankName: form.bankName,
            accountNumber: form.accountNumber,
            accountHolderName: form.accountHolderName,
            khaltiNumber: form.khaltiNumber,
            esewaNumber: form.esewaNumber,
          },
        },
        '/auth/delivery/profile'
      );
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();

  return (
    // Local branded header: DeliveryHero has no left slot to host a back arrow,
    // so this bar reproduces the exact two-tone wordmark treatment ("Shop" in
    // accentLight, no textTransform) on the same indigo gradient the other
    // delivery screens open with, plus the back affordance the shell can't
    // place. The gradient bleeds behind the status bar (own top inset), so the
    // outer wrapper is a plain View, not a SafeAreaView with a 'top' edge.
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[COLORS.primaryDark, COLORS.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + SPACING.md }]}
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerBrand}>
            Nep<Text style={{ color: COLORS.accentLight }}>Shop</Text>
            <Text style={styles.headerBrandRole}> · Delivery</Text>
          </Text>
          <Text style={styles.headerTitle}>Profile &amp; Payout</Text>
        </View>
      </LinearGradient>
      <SafeAreaView style={styles.flex} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <RoleUpgrade />

        {/* Personal info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-outline" size={16} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Personal Information</Text>
          </View>
          <Text style={styles.cardSubtitle}>Update your name and contact details</Text>

          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>✅ {success}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>First name</Text>
              <View style={styles.disabledInput}>
                <Text style={styles.disabledInputText}>{form.firstName}</Text>
              </View>
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Last name</Text>
              <View style={styles.disabledInput}>
                <Text style={styles.disabledInputText}>{form.lastName}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.helperText}>Contact support to change verified identity details.</Text>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={[styles.input, errors.phone && styles.inputError]}
              value={form.phone}
              onChangeText={(v) => handleChange('phone', v)}
              placeholderTextColor={COLORS.tabInactive}
              keyboardType="phone-pad"
            />
            {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Email address</Text>
            <View style={styles.disabledInput}>
              <Text style={styles.disabledInputText}>{user?.email}</Text>
            </View>
            <Text style={styles.helperText}>Email cannot be changed</Text>
          </View>
        </View>

        {/* Payout details */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="wallet-outline" size={16} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Payout Details</Text>
          </View>
          <Text style={styles.cardSubtitle}>How you want to receive your delivery earnings from NepShop</Text>

          <Text style={styles.label}>Preferred payout method</Text>
          <View style={styles.methodRow}>
            {PAYOUT_METHODS.map((m) => (
              <Pressable
                key={m.key}
                style={[styles.methodChip, form.preferredMethod === m.key && styles.methodChipActive]}
                onPress={() => handleChange('preferredMethod', m.key)}
              >
                {m.logo ? (
                  <Image source={m.logo} style={styles.methodChipLogo} resizeMode="contain" />
                ) : (
                  <View style={styles.methodChipGlyph}>
                    <Ionicons name={m.icon} size={18} color={COLORS.primary} />
                  </View>
                )}
                <Text style={[styles.methodChipText, form.preferredMethod === m.key && styles.methodChipTextActive]}>
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {form.preferredMethod === 'bank' && (
            <>
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Bank name</Text>
                <TextInput
                  style={styles.input}
                  value={form.bankName}
                  onChangeText={(v) => handleChange('bankName', v)}
                  placeholder="e.g. Nepal Investment Bank"
                  placeholderTextColor={COLORS.tabInactive}
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Account number</Text>
                <TextInput
                  style={styles.input}
                  value={form.accountNumber}
                  onChangeText={(v) => handleChange('accountNumber', v)}
                  placeholder="Your bank account number"
                  placeholderTextColor={COLORS.tabInactive}
                />
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Account holder name</Text>
                <TextInput
                  style={styles.input}
                  value={form.accountHolderName}
                  onChangeText={(v) => handleChange('accountHolderName', v)}
                  placeholder="Name as on bank account"
                  placeholderTextColor={COLORS.tabInactive}
                />
              </View>
            </>
          )}

          {form.preferredMethod === 'khalti' && (
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Khalti number</Text>
              <TextInput
                style={[styles.input, errors.khaltiNumber && styles.inputError]}
                value={form.khaltiNumber}
                onChangeText={(v) => handleChange('khaltiNumber', v)}
                placeholder="Khalti registered phone number"
                placeholderTextColor={COLORS.tabInactive}
                keyboardType="phone-pad"
              />
              {errors.khaltiNumber ? <Text style={styles.fieldError}>{errors.khaltiNumber}</Text> : null}
            </View>
          )}

          {form.preferredMethod === 'esewa' && (
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>eSewa number</Text>
              <TextInput
                style={[styles.input, errors.esewaNumber && styles.inputError]}
                value={form.esewaNumber}
                onChangeText={(v) => handleChange('esewaNumber', v)}
                placeholder="eSewa registered phone number"
                placeholderTextColor={COLORS.tabInactive}
                keyboardType="phone-pad"
              />
              {errors.esewaNumber ? <Text style={styles.fieldError}>{errors.esewaNumber}</Text> : null}
            </View>
          )}

          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              💡 NepShop pays Rs 50 per successful delivery. Payouts are processed by the admin after you request
              them from the Earnings tab.
            </Text>
          </View>
        </View>

        {/* Account info */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Account Information</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Vehicle Type</Text>
            <Text style={styles.detailValue}>{user?.vehicleType || 'Not set'}</Text>
          </View>
          <View style={[styles.detailRow, styles.detailRowDivider]}>
            <Text style={styles.detailLabel}>Account Status</Text>
            <Text style={[styles.detailValue, styles.detailValueActive]}>✓ Active</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Member Since</Text>
            <Text style={styles.detailValue}>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-NP', { day: 'numeric', month: 'long', year: 'numeric' })
                : 'N/A'}
            </Text>
          </View>
        </View>

        <Pressable style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleSave} disabled={loading}>
          {loading ? (
            <View style={styles.saveButtonRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.saveButtonText}>Saving...</Text>
            </View>
          ) : (
            <Text style={styles.saveButtonText}>💾 Save Profile</Text>
          )}
        </Pressable>

        {/* Change password */}
        <ChangePasswordForm />
      </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  content: { padding: SPACING.lg, paddingBottom: 32 },

  // ── Branded header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomLeftRadius: RADII.xl,
    borderBottomRightRadius: RADII.xl,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.pill,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitleWrap: { flex: 1 },
  // Same recipe as DeliveryHero's wordmark: white base so "Nep" reads as
  // brand, accentLight only on "Shop", no textTransform / letterSpacing.
  headerBrand: { fontSize: 13, fontWeight: '700', color: '#fff', marginBottom: 3 },
  headerBrandRole: { color: COLORS.heroText, fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.background },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardSubtitle: { fontSize: 12.5, color: COLORS.textMuted, marginBottom: SPACING.lg },
  successBox: {
    backgroundColor: COLORS.successSoft,
    borderWidth: 1,
    borderColor: COLORS.success,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  successText: { fontSize: 12.5, color: COLORS.success, fontWeight: '600' },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  errorText: { fontSize: 12.5, color: COLORS.danger, fontWeight: '600' },
  row: { flexDirection: 'row', gap: SPACING.md },
  fieldHalf: { flex: 1, marginBottom: SPACING.sm + 2 },
  fieldWrap: { marginBottom: SPACING.sm + 2 },
  label: { fontSize: 12.5, fontWeight: '600', color: COLORS.text, marginBottom: 5 },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 3,
    fontSize: 14,
    color: COLORS.text,
  },
  inputError: { borderColor: COLORS.danger },
  fieldError: { color: COLORS.danger, fontSize: 11.5, marginTop: 3 },
  disabledInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 3,
    backgroundColor: COLORS.surface,
  },
  disabledInputText: { fontSize: 14, color: COLORS.tabInactive },
  helperText: { fontSize: 11, color: COLORS.tabInactive, marginTop: 3 },
  methodRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm + 2 },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingVertical: SPACING.sm + 2,
  },
  methodChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  // Both variants occupy the same 20px band so the three chips stay the same
  // height. resizeMode="contain" letterboxes each logo inside the chip width,
  // so the differing aspect ratios don't reach the chip edges.
  methodChipLogo: { width: '100%', height: 20 },
  methodChipGlyph: { height: 20, alignItems: 'center', justifyContent: 'center' },
  methodChipText: { fontSize: 11.5, fontWeight: '600', color: COLORS.textMuted },
  methodChipTextActive: { color: COLORS.primary },
  noticeBox: {
    backgroundColor: COLORS.infoSoft,
    borderWidth: 1,
    borderColor: COLORS.info,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginTop: SPACING.xs,
  },
  noticeText: { fontSize: 12, color: COLORS.info, lineHeight: 17 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm + 2 },
  detailRowDivider: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.surface },
  detailLabel: { fontSize: 13, color: COLORS.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  detailValueActive: { color: COLORS.success },
  saveButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  saveButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
