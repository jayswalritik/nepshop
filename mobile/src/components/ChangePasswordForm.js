import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import API from '../utils/api';
import { COLORS, RADII, SPACING } from '../constants/colors';

// Self-contained "Change Password" card, mounted on the customer and delivery
// profile screens (parity with web, where the form sits on the profile/
// settings pages — frontend/src/components/common/ChangePasswordForm.jsx).
// Takes no per-role props: it acts on the logged-in user via the role-agnostic,
// protected endpoint PUT /auth/change-password (the shared API util attaches
// the Bearer token automatically via setAuthToken).
//
// Client-side validation mirrors the web component (min 8 / ≥1 uppercase /
// ≥1 number / confirm matches / new differs from current) as a convenience
// only; the backend remains the validation authority, so a failed request
// always surfaces the server's message (e.g. a 401 clearly says the current
// password is incorrect). No data fetch on mount, so useFocusEffect is N/A.
export default function ChangePasswordForm() {
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  // Independent per-field visibility — revealing one field never reveals
  // the others. Matches the eye/eye-off toggle used on login.js / signup.js.
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
    setError('');
    setSuccess('');
  };

  const validate = () => {
    const errs = {};
    if (!form.currentPassword) errs.currentPassword = 'Current password is required';

    if (!form.newPassword || form.newPassword.length < 8)
      errs.newPassword = 'Password must be at least 8 characters';
    else if (!/[A-Z]/.test(form.newPassword))
      errs.newPassword = 'Password must contain at least one uppercase letter';
    else if (!/[0-9]/.test(form.newPassword))
      errs.newPassword = 'Password must contain at least one number';
    else if (form.newPassword === form.currentPassword)
      errs.newPassword = 'New password must be different from your current password';

    if (form.newPassword !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';

    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // Never send confirmPassword — the backend takes currentPassword +
      // newPassword only. The session intentionally stays valid: no logout,
      // no navigation, no AuthContext/token changes here.
      await API.put('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setSuccess('Password changed successfully!');
    } catch (err) {
      setError(err.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Change Password</Text>
      <Text style={styles.cardSubtitle}>
        Choose a strong password with at least 8 characters, one uppercase letter, and one number
      </Text>

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

      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Current password</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            style={[styles.input, styles.passwordInput, errors.currentPassword && styles.inputError]}
            value={form.currentPassword}
            onChangeText={(v) => handleChange('currentPassword', v)}
            placeholder="Enter your current password"
            placeholderTextColor={COLORS.tabInactive}
            secureTextEntry={!showCurrent}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.eyeButton} hitSlop={10} onPress={() => setShowCurrent((v) => !v)}>
            <Ionicons name={showCurrent ? 'eye-off' : 'eye'} size={20} color={COLORS.textMuted} />
          </Pressable>
        </View>
        {errors.currentPassword ? <Text style={styles.fieldError}>{errors.currentPassword}</Text> : null}
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.label}>New password</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            style={[styles.input, styles.passwordInput, errors.newPassword && styles.inputError]}
            value={form.newPassword}
            onChangeText={(v) => handleChange('newPassword', v)}
            placeholder="Min. 8 chars, 1 uppercase, 1 number"
            placeholderTextColor={COLORS.tabInactive}
            secureTextEntry={!showNew}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.eyeButton} hitSlop={10} onPress={() => setShowNew((v) => !v)}>
            <Ionicons name={showNew ? 'eye-off' : 'eye'} size={20} color={COLORS.textMuted} />
          </Pressable>
        </View>
        {errors.newPassword ? <Text style={styles.fieldError}>{errors.newPassword}</Text> : null}
      </View>

      <View style={styles.fieldWrap}>
        <Text style={styles.label}>Confirm new password</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            style={[styles.input, styles.passwordInput, errors.confirmPassword && styles.inputError]}
            value={form.confirmPassword}
            onChangeText={(v) => handleChange('confirmPassword', v)}
            placeholder="Repeat your new password"
            placeholderTextColor={COLORS.tabInactive}
            secureTextEntry={!showConfirm}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.eyeButton} hitSlop={10} onPress={() => setShowConfirm((v) => !v)}>
            <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color={COLORS.textMuted} />
          </Pressable>
        </View>
        {errors.confirmPassword ? <Text style={styles.fieldError}>{errors.confirmPassword}</Text> : null}
      </View>

      <Pressable
        style={[styles.saveButton, loading && styles.saveButtonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <View style={styles.saveButtonRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.saveButtonText}>Changing...</Text>
          </View>
        ) : (
          <Text style={styles.saveButtonText}>🔐 Change Password</Text>
        )}
      </Pressable>
    </View>
  );
}

// Mirrors the profile screens' card/input/banner/button tokens so the form
// reads as native on both. Values match app/(customer)/profile.js exactly.
const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
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
  // Eye toggle layout — matches login.js / signup.js. Their input carries a
  // bottom margin so their eyeButton uses bottom:16 to center; this form's
  // input has no bottom margin (spacing lives on fieldWrap), so bottom:0
  // centers the icon over the full input height.
  passwordWrapper: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 46 },
  eyeButton: { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' },
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
