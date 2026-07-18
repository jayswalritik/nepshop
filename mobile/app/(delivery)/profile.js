import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import RoleUpgrade from '../../src/components/RoleUpgrade';
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
const PAYOUT_METHODS = [
  { key: 'bank', label: 'Bank Transfer', icon: '🏦' },
  { key: 'khalti', label: 'Khalti', icon: '💜' },
  { key: 'esewa', label: 'eSewa', icon: '💚' },
];

// firstName/lastName are locked (not user-editable), so they can never fail
// validation here — checking them would risk silently blocking a legitimate
// phone/payout-only save with no visible error, since neither field renders
// an error message anymore.
const validate = (form) => {
  const errs = {};
  if (!form.phone.trim()) errs.phone = 'Phone is required';
  return errs;
};

export default function DeliveryProfileScreen() {
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
    const errs = validate(form);
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Profile & Payout" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <RoleUpgrade />

        {/* Personal info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
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
          <Text style={styles.cardTitle}>Payout Details</Text>
          <Text style={styles.cardSubtitle}>How you want to receive your delivery earnings from NepShop</Text>

          <Text style={styles.label}>Preferred payout method</Text>
          <View style={styles.methodRow}>
            {PAYOUT_METHODS.map((m) => (
              <Pressable
                key={m.key}
                style={[styles.methodChip, form.preferredMethod === m.key && styles.methodChipActive]}
                onPress={() => handleChange('preferredMethod', m.key)}
              >
                <Text style={styles.methodChipIcon}>{m.icon}</Text>
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
                style={styles.input}
                value={form.khaltiNumber}
                onChangeText={(v) => handleChange('khaltiNumber', v)}
                placeholder="Khalti registered phone number"
                placeholderTextColor={COLORS.tabInactive}
                keyboardType="phone-pad"
              />
            </View>
          )}

          {form.preferredMethod === 'esewa' && (
            <View style={styles.fieldWrap}>
              <Text style={styles.label}>eSewa number</Text>
              <TextInput
                style={styles.input}
                value={form.esewaNumber}
                onChangeText={(v) => handleChange('esewaNumber', v)}
                placeholder="eSewa registered phone number"
                placeholderTextColor={COLORS.tabInactive}
                keyboardType="phone-pad"
              />
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
          <Text style={styles.cardTitle}>Account Information</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: 32 },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.card,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  cardSubtitle: { fontSize: 12.5, color: COLORS.textMuted, marginBottom: SPACING.lg },
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
  methodChipIcon: { fontSize: 16 },
  methodChipText: { fontSize: 11.5, fontWeight: '600', color: COLORS.textMuted },
  methodChipTextActive: { color: COLORS.primary },
  noticeBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
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
