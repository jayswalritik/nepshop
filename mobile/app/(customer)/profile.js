import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import ScreenHeader from '../../src/components/ScreenHeader';
import RoleUpgrade from '../../src/components/RoleUpgrade';
import { COLORS, RADII, SHADOWS, SPACING } from '../../src/constants/colors';

// Pushed hidden route (mobile/src/navigation/roleNavConfig.js's
// hiddenRoutes), reached from the Account tab's "Edit Profile" row — mirrors
// frontend/src/pages/customer/ProfilePage.jsx: avatar card (initials only —
// web has no photo upload, so neither does this), editable First/Last
// name + Phone, read-only Email ("cannot be changed", same as web — web
// never allows email change so mobile doesn't either), "Grow with NepShop"
// role-upgrade (<RoleUpgrade/>, same placement as web — between the edit
// form and Account Details), then Account Details (roles/status/member
// since). No password-change UI: web's ProfilePage has none either —
// nothing to mirror.
//
// Same PUT /auth/customer/profile endpoint and validation (non-empty
// first/last/phone — web has no format regex, backend has none either, so
// nothing stricter is added here) as web. On success, AuthContext's
// updateProfile() persists the returned user via the same login()
// mechanism web's `login(data.user, token)` uses — same SecureStore keys
// the rest of the app already reads, so the new name shows in Account/
// header immediately without needing a focus-refetch (this screen doesn't
// display server state that could go stale from elsewhere — it edits the
// same in-memory `user` the whole app already keeps live).
const validate = (form) => {
  const errs = {};
  if (!form.firstName.trim()) errs.firstName = 'First name is required';
  if (!form.lastName.trim()) errs.lastName = 'Last name is required';
  if (!form.phone.trim()) errs.phone = 'Phone is required';
  return errs;
};

export default function ProfileScreen() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
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
      await updateProfile({ firstName: form.firstName, lastName: form.lastName, phone: form.phone });
      setSuccess('Profile updated successfully!');
    } catch (err) {
      setError(err.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase();
  const roles = (user?.roles && user.roles.length ? user.roles : [user?.role]).join(', ');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Profile" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar card */}
        <View style={styles.card}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || '?'}</Text>
            </View>
            <Text style={styles.name}>{user?.firstName} {user?.lastName}</Text>
            <Text style={styles.email}>{user?.email}</Text>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>✓ Active Customer</Text>
            </View>
          </View>
        </View>

        {/* Edit form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <Text style={styles.cardSubtitle}>Update your profile details</Text>

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
              <TextInput
                style={[styles.input, errors.firstName && styles.inputError]}
                value={form.firstName}
                onChangeText={(v) => handleChange('firstName', v)}
                placeholderTextColor={COLORS.tabInactive}
              />
              {errors.firstName ? <Text style={styles.fieldError}>{errors.firstName}</Text> : null}
            </View>
            <View style={styles.fieldHalf}>
              <Text style={styles.label}>Last name</Text>
              <TextInput
                style={[styles.input, errors.lastName && styles.inputError]}
                value={form.lastName}
                onChangeText={(v) => handleChange('lastName', v)}
                placeholderTextColor={COLORS.tabInactive}
              />
              {errors.lastName ? <Text style={styles.fieldError}>{errors.lastName}</Text> : null}
            </View>
          </View>

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

          <Pressable
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.saveButtonRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.saveButtonText}>Saving...</Text>
              </View>
            ) : (
              <Text style={styles.saveButtonText}>💾 Save Profile</Text>
            )}
          </Pressable>
        </View>

        <RoleUpgrade />

        {/* Account details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Account Type</Text>
            <Text style={styles.detailValue}>{roles}</Text>
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
  avatarWrap: { alignItems: 'center' },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm + 2,
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: COLORS.primary },
  name: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  email: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  statusPill: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.successSoft,
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  statusPillText: { fontSize: 11, fontWeight: '600', color: COLORS.success },
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm + 2,
  },
  detailRowDivider: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.surface,
  },
  detailLabel: { fontSize: 13, color: COLORS.textMuted },
  detailValue: { fontSize: 13, fontWeight: '600', color: COLORS.text, textTransform: 'capitalize' },
  detailValueActive: { color: COLORS.success },
});
