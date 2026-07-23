import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import API from '../src/utils/api';
import { COLORS } from '../src/constants/colors';
import AuthHero from '../src/components/AuthHero';

// Mirrors frontend/src/pages/auth/ForgotPasswordPage.jsx's behaviour: collect
// email + role, POST /auth/forgot-password with { email, role }, then show a
// non-enumerating "check your email" state. The backend replies with the same
// message whether or not the account exists (see forgotPassword in
// backend/controllers/authController.js), so the wording here never confirms
// an email is registered.
//
// Roles are limited to what the mobile app actually supports — customer and
// delivery. Web additionally offers seller and admin, but seller login on
// mobile is "coming soon" (see login.js) and admin isn't offered at all, so
// copying all four would let people request a reset for a mode they can't use
// in this app. The reset itself is completed via the link in the email, which
// opens the web reset page in a browser — in-app completion is intentionally
// out of scope.
const RESET_ROLES = [
  { key: 'customer', label: 'Customer', icon: '🛍️' },
  { key: 'delivery', label: 'Delivery', icon: '🚚' },
];

export default function ForgotPasswordScreen() {
  const [role, setRole] = useState('customer');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await API.post('/auth/forgot-password', { email, role, client: 'app' });
      setSent(true);
    } catch (err) {
      setError(err.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.flex} edges={['bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <AuthHero eyebrow="Account recovery">
              Forgot your{'\n'}
              <Text style={{ color: COLORS.accentLight }}>password?</Text>
            </AuthHero>

            {/* ── Form card ── */}
            <View style={styles.card}>
              {sent ? (
                /* Success state — deliberately non-enumerating wording */
                <View style={styles.successWrap}>
                  <View style={styles.successBadge}>
                    <Ionicons name="mail-outline" size={30} color={COLORS.primary} />
                  </View>
                  <Text style={styles.title}>Check your email</Text>
                  <Text style={styles.successText}>
                    If an account with <Text style={styles.successEmail}>{email}</Text> exists,
                    we've sent a password reset link.
                  </Text>
                  <Text style={styles.successHint}>
                    Open the link in your email to choose a new password — it opens in your
                    browser. The link expires in 15 minutes. Check your spam folder if you
                    don't see it.
                  </Text>

                  <Pressable
                    style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
                    onPress={() => router.replace('/login')}
                  >
                    <Text style={styles.submitButtonText}>Back to Sign in</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryRow}
                    onPress={() => { setSent(false); setEmail(''); setError(''); }}
                    hitSlop={6}
                  >
                    <Text style={styles.secondaryText}>
                      Try a different <Text style={styles.secondaryLink}>email</Text>
                    </Text>
                  </Pressable>
                </View>
              ) : (
                /* Form state */
                <>
                  <Text style={styles.title}>Reset your password</Text>
                  <Text style={styles.subtitle}>
                    Enter your email and we'll send you a reset link.
                  </Text>

                  <View style={styles.roleTabs}>
                    {RESET_ROLES.map((r) => (
                      <Pressable
                        key={r.key}
                        style={[styles.roleTab, role === r.key && styles.roleTabActive]}
                        onPress={() => setRole(r.key)}
                      >
                        <Text style={styles.roleTabIcon}>{r.icon}</Text>
                        <Text style={[styles.roleTabText, role === r.key && styles.roleTabTextActive]}>
                          {r.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={styles.label}>Email</Text>
                  <TextInput
                    style={[styles.input, emailFocused && styles.inputFocused]}
                    placeholder="you@example.com"
                    placeholderTextColor={COLORS.tabInactive}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(''); }}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                  />

                  {error ? <Text style={styles.error}>{error}</Text> : null}

                  <Pressable
                    style={({ pressed }) => [
                      styles.submitButton,
                      pressed && styles.submitButtonPressed,
                    ]}
                    onPress={handleSubmit}
                    disabled={loading}
                  >
                    <Text style={styles.submitButtonText}>
                      {loading ? 'Sending…' : 'Send reset link'}
                    </Text>
                  </Pressable>

                  <Pressable style={styles.secondaryRow} onPress={() => router.replace('/login')} hitSlop={6}>
                    <Text style={styles.secondaryText}>
                      Remember your password? <Text style={styles.secondaryLink}>Sign in</Text>
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
    marginBottom: 20,
  },
  roleTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 20,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 9,
  },
  roleTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  roleTabIcon: {
    fontSize: 14,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  roleTabTextActive: {
    color: COLORS.primary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inputFocused: {
    borderColor: COLORS.primary,
  },
  error: {
    color: COLORS.danger,
    fontSize: 13,
    marginBottom: 12,
    marginTop: -6,
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  submitButtonPressed: {
    opacity: 0.9,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  secondaryLink: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  // ── Success state ──
  successWrap: {
    alignItems: 'center',
    paddingTop: 8,
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  successEmail: {
    color: COLORS.text,
    fontWeight: '700',
  },
  successHint: {
    fontSize: 12.5,
    color: COLORS.tabInactive,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 22,
  },
});
