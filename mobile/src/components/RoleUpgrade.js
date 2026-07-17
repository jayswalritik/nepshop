import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import Dropdown from './Dropdown';
import { DISTRICTS } from '../constants/districts';
import { COLORS, RADII, SPACING } from '../constants/colors';

const VEHICLE_TYPES = ['Motorcycle', 'Scooter', 'Bicycle', 'Van / Car'];

// Mirrors frontend/src/components/customer/RoleUpgrade.jsx exactly — same
// visibility rules, same fields, same two endpoints (POST /auth/apply-role,
// POST /auth/add-customer-role), same pending/office-visit copy. Seller and
// delivery applications go to admin approval (pendingRoleRequest, NOT an
// immediate role grant) — the "Become a Customer" path is the only instant
// one, matching backend/controllers/authController.js's applyForRole vs
// addCustomerRole exactly. The seller+delivery mutual-exclusion rule is
// enforced server-side (see applyForRole); the client-side gating below
// (canApplySeller/canApplyDelivery) only mirrors web's OWN client gate, not
// an extra local copy of the rule — the server still has the final word via
// whatever error message comes back.
//
// No document upload anywhere in this flow: web's forms only collect text
// fields (shop/PAN/address, vehicle type, citizenship number) — the
// "bring documents to the office" instructions only appear as informational
// copy AFTER applying, never as an upload control. So this needed zero new
// dependencies.
const SELLER_FIELDS = ['shopName', 'panNumber', 'shopStreet', 'shopCity', 'shopDistrict', 'shopPhone'];
const DELIVERY_FIELDS = ['vehicleType', 'citizenshipNumber'];

export default function RoleUpgrade() {
  const { user, token, login } = useAuth();
  const [openForm, setOpenForm] = useState(null); // 'seller' | 'delivery' | null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sellerData, setSellerData] = useState({
    shopName: '', panNumber: '', shopStreet: '', shopCity: '', shopDistrict: '', shopPhone: '',
  });
  const [deliveryData, setDeliveryData] = useState({
    vehicleType: '', citizenshipNumber: '',
  });

  const roles = user?.roles || [user?.role];
  const isCustomer = roles.includes('customer');
  const isSeller = roles.includes('seller');
  const isDelivery = roles.includes('delivery');
  const pending = user?.pendingRoleRequest?.status === 'pending' ? user.pendingRoleRequest.role : null;

  const refreshUser = async (updatedUser) => {
    await login(updatedUser, token);
  };

  const canApplySeller = !isSeller && !isDelivery && !pending;
  const canApplyDelivery = !isDelivery && !isSeller && !pending;
  const canBecomeCustomer = !isCustomer;

  if (!canApplySeller && !canApplyDelivery && !canBecomeCustomer && !pending) {
    return null;
  }

  const applySeller = async () => {
    if (SELLER_FIELDS.some((f) => !sellerData[f])) {
      setError('Please fill all seller fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await API.post('/auth/apply-role', {
        role: 'seller',
        shopName: sellerData.shopName,
        panNumber: sellerData.panNumber,
        shopAddress: {
          street: sellerData.shopStreet,
          city: sellerData.shopCity,
          district: sellerData.shopDistrict,
          phone: sellerData.shopPhone,
        },
      });
      await refreshUser(data.user);
      setSuccess(data.message);
      setOpenForm(null);
    } catch (err) {
      setError(err.data?.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  const applyDelivery = async () => {
    if (DELIVERY_FIELDS.some((f) => !deliveryData[f])) {
      setError('Please fill all delivery fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await API.post('/auth/apply-role', {
        role: 'delivery',
        vehicleType: deliveryData.vehicleType,
        citizenshipNumber: deliveryData.citizenshipNumber,
      });
      await refreshUser(data.user);
      setSuccess(data.message);
      setOpenForm(null);
    } catch (err) {
      setError(err.data?.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  const becomeCustomer = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await API.post('/auth/add-customer-role');
      await refreshUser(data.user);
      setSuccess(data.message);
    } catch (err) {
      setError(err.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Grow with NepShop</Text>
      <Text style={styles.subtitle}>Expand what you can do with your account</Text>

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

      {pending ? (
        <>
          <View style={styles.pendingBadge}>
            <View style={styles.pendingDot} />
            <Text style={styles.pendingBadgeText}>
              {pending.charAt(0).toUpperCase() + pending.slice(1)} application — Pending admin approval
            </Text>
          </View>

          <View style={styles.officeBox}>
            <Text style={styles.officeTitle}>📋 Next step — Visit NepShop Office</Text>
            <Text style={styles.officeBody}>
              To complete your verification, please visit our office with the following documents:
            </Text>
            {pending === 'seller' && (
              <View style={styles.docList}>
                <Text style={styles.docItem}>• Citizenship card (original + photocopy)</Text>
                <Text style={styles.docItem}>• PAN registration certificate</Text>
                <Text style={styles.docItem}>• Business registration document</Text>
                <Text style={styles.docItem}>• Recent passport-size photo</Text>
              </View>
            )}
            {pending === 'delivery' && (
              <View style={styles.docList}>
                <Text style={styles.docItem}>• Citizenship card (original + photocopy)</Text>
                <Text style={styles.docItem}>• Driving license</Text>
                <Text style={styles.docItem}>• Vehicle registration document (bluebook)</Text>
                <Text style={styles.docItem}>• Recent passport-size photo</Text>
              </View>
            )}
            <View style={styles.officeAddressWrap}>
              <Text style={styles.officeAddressTitle}>📍 NepShop Office</Text>
              <Text style={styles.officeAddressLine}>Kathmandu, Bagmati Province, Nepal</Text>
              <Text style={styles.officeAddressLine}>Office hours: Sun – Fri, 10:00 AM – 5:00 PM</Text>
            </View>
          </View>

          <Text style={styles.footNote}>
            You will receive an email notification once your account is approved. Meanwhile, you can keep shopping.
          </Text>
        </>
      ) : (
        <View style={styles.actions}>
          {canApplySeller && openForm !== 'seller' && (
            <Pressable
              style={styles.optionButton}
              onPress={() => { setOpenForm('seller'); setError(''); setSuccess(''); }}
            >
              <Text style={styles.optionGlyph}>🏪</Text>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Become a Seller</Text>
                <Text style={styles.optionBody}>Start selling your products on NepShop</Text>
              </View>
              <Text style={styles.optionArrow}>→</Text>
            </Pressable>
          )}

          {openForm === 'seller' && (
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>🏪 Seller Application</Text>
                <Pressable onPress={() => setOpenForm(null)} hitSlop={8}>
                  <Text style={styles.formClose}>✕</Text>
                </Pressable>
              </View>

              <FormField label="Shop / business name" value={sellerData.shopName} onChangeText={(v) => setSellerData({ ...sellerData, shopName: v })} placeholder="My Nepal Store" />
              <FormField label="PAN / registration number" value={sellerData.panNumber} onChangeText={(v) => setSellerData({ ...sellerData, panNumber: v })} placeholder="PAN or Reg. no." />
              <FormField label="Shop street address" value={sellerData.shopStreet} onChangeText={(v) => setSellerData({ ...sellerData, shopStreet: v })} placeholder="e.g. New Road, Shop no. 5" />
              <View style={styles.row}>
                <View style={styles.half}>
                  <FormField label="City" value={sellerData.shopCity} onChangeText={(v) => setSellerData({ ...sellerData, shopCity: v })} placeholder="Kathmandu" />
                </View>
                <View style={styles.half}>
                  <Text style={styles.fieldLabel}>District</Text>
                  <Dropdown
                    value={sellerData.shopDistrict}
                    onChange={(v) => setSellerData({ ...sellerData, shopDistrict: v })}
                    options={DISTRICTS}
                    placeholder="Select"
                  />
                </View>
              </View>
              <FormField label="Shop contact number" value={sellerData.shopPhone} onChangeText={(v) => setSellerData({ ...sellerData, shopPhone: v })} placeholder="Shop phone for delivery agent" keyboardType="phone-pad" />

              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>ℹ️ Your application will require admin approval. You'll keep shopping while it's reviewed.</Text>
              </View>

              <Pressable style={[styles.submitButton, loading && styles.submitButtonDisabled]} onPress={applySeller} disabled={loading}>
                <Text style={styles.submitButtonText}>{loading ? 'Submitting...' : 'Submit Seller Application'}</Text>
              </Pressable>
            </View>
          )}

          {canApplyDelivery && openForm !== 'delivery' && (
            <Pressable
              style={styles.optionButton}
              onPress={() => { setOpenForm('delivery'); setError(''); setSuccess(''); }}
            >
              <Text style={styles.optionGlyph}>🚚</Text>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Become a Delivery Agent</Text>
                <Text style={styles.optionBody}>Earn by delivering orders across Nepal</Text>
              </View>
              <Text style={styles.optionArrow}>→</Text>
            </Pressable>
          )}

          {openForm === 'delivery' && (
            <View style={styles.formCard}>
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>🚚 Delivery Agent Application</Text>
                <Pressable onPress={() => setOpenForm(null)} hitSlop={8}>
                  <Text style={styles.formClose}>✕</Text>
                </Pressable>
              </View>

              <Text style={styles.fieldLabel}>Vehicle type</Text>
              <Dropdown
                value={deliveryData.vehicleType}
                onChange={(v) => setDeliveryData({ ...deliveryData, vehicleType: v })}
                options={VEHICLE_TYPES}
                placeholder="Select vehicle"
              />
              <FormField label="Citizenship / ID number" value={deliveryData.citizenshipNumber} onChangeText={(v) => setDeliveryData({ ...deliveryData, citizenshipNumber: v })} placeholder="Citizenship no." />

              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>ℹ️ Your application will require admin approval. You'll keep shopping while it's reviewed.</Text>
              </View>

              <Pressable style={[styles.submitButton, loading && styles.submitButtonDisabled]} onPress={applyDelivery} disabled={loading}>
                <Text style={styles.submitButtonText}>{loading ? 'Submitting...' : 'Submit Delivery Application'}</Text>
              </Pressable>
            </View>
          )}

          {canBecomeCustomer && (
            <Pressable style={[styles.optionButton, loading && styles.optionButtonDisabled]} onPress={becomeCustomer} disabled={loading}>
              <Text style={styles.optionGlyph}>🛍️</Text>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>Start Shopping as Customer</Text>
                <Text style={styles.optionBody}>Instantly enable shopping — no approval needed</Text>
              </View>
              <Text style={styles.optionArrow}>→</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function FormField({ label, value, onChangeText, placeholder, keyboardType }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.tabInactive}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  subtitle: { fontSize: 12.5, color: COLORS.textMuted, marginBottom: SPACING.lg },
  successBox: {
    backgroundColor: COLORS.successSoft,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  successText: { fontSize: 12.5, color: COLORS.success, fontWeight: '600' },
  errorBox: {
    backgroundColor: COLORS.dangerSoft,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
  },
  errorText: { fontSize: 12.5, color: COLORS.danger, fontWeight: '600' },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.accentSoft,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  pendingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  pendingBadgeText: { fontSize: 12.5, color: COLORS.accent, fontWeight: '600' },
  officeBox: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  officeTitle: { fontSize: 13, fontWeight: '700', color: COLORS.warning, marginBottom: SPACING.sm },
  officeBody: { fontSize: 12.5, color: COLORS.warning, marginBottom: SPACING.sm },
  docList: { gap: 3, marginBottom: SPACING.sm },
  docItem: { fontSize: 12.5, color: COLORS.warning },
  officeAddressWrap: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  officeAddressTitle: { fontSize: 11.5, fontWeight: '700', color: COLORS.warning },
  officeAddressLine: { fontSize: 11.5, color: COLORS.warning },
  footNote: { fontSize: 11, color: COLORS.tabInactive },
  actions: { gap: SPACING.sm + 2 },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.md,
  },
  optionButtonDisabled: { opacity: 0.6 },
  optionGlyph: { fontSize: 24 },
  optionTextWrap: { flex: 1 },
  optionTitle: { fontSize: 13.5, fontWeight: '600', color: COLORS.text },
  optionBody: { fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 },
  optionArrow: { fontSize: 16, color: COLORS.tabInactive },
  formCard: {
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: RADII.md,
    padding: SPACING.md,
    backgroundColor: COLORS.primarySoft,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  formTitle: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },
  formClose: { fontSize: 15, color: COLORS.tabInactive },
  row: { flexDirection: 'row', gap: SPACING.md },
  half: { flex: 1 },
  fieldWrap: { marginBottom: SPACING.sm + 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 5 },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 3,
    fontSize: 13.5,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  noticeBox: {
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  noticeText: { fontSize: 11.5, color: COLORS.warning },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.sm + 2,
    paddingVertical: SPACING.sm + 3,
    alignItems: 'center',
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
