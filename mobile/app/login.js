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
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import API from '../src/utils/api';
import { homeRouteForRole } from '../src/navigation/roleNavConfig';
import { COLORS } from '../src/constants/colors';

// Same POST /auth/login endpoint the web AuthPage uses. The backend
// requires a `role` field (see backend/routes/authRoutes.js loginValidation)
// so, same as web's role tabs, the user picks which mode they're signing
// into — scoped here to the two roles the app supports.
const LOGIN_ROLES = [
  { key: 'customer', label: 'Customer', icon: '🛍️' },
  { key: 'delivery', label: 'Delivery', icon: '🚚' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [role, setRole] = useState('customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await API.post('/auth/login', { email, password, role });
      await login(data.user, data.token);
      const activeRole = data.user.activeRole || data.user.role;
      router.replace(homeRouteForRole(activeRole) || '/unsupported');
    } catch (err) {
      setError(err.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* ── Hero ── */}
          <LinearGradient
            colors={[COLORS.primaryDark, COLORS.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={[styles.glow, styles.glowOrange]} />
            <View style={[styles.glow, styles.glowIndigo]} />

            <View style={styles.logoRow}>
              <View style={styles.logoBadge}>
                <Text style={styles.logoBadgeText}>N</Text>
              </View>
              <Text style={styles.wordmark}>
                Nep<Text style={{ color: COLORS.accentLight }}>Shop</Text>
              </Text>
            </View>

            <Text style={styles.eyebrow}>Nepal's Smart Marketplace</Text>
            <Text style={styles.headline}>
              Buy, sell & deliver{'\n'}
              <Text style={{ color: COLORS.accentLight }}>smarter.</Text>
            </Text>
          </LinearGradient>

          {/* ── Form card ── */}
          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your NepShop account</Text>

            <View style={styles.roleTabs}>
              {LOGIN_ROLES.map((r) => (
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
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput, passwordFocused && styles.inputFocused]}
                placeholder="Your password"
                placeholderTextColor={COLORS.tabInactive}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <Pressable
                style={styles.eyeButton}
                hitSlop={10}
                onPress={() => setShowPassword((v) => !v)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>{loading ? 'Signing in…' : 'Sign in'}</Text>
            </Pressable>

            <View style={styles.trustRow}>
              <View style={styles.trustDot} />
              <Text style={styles.trustText}>Secure · HTTPS · JWT Auth</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  hero: {
    paddingTop: 72,
    paddingBottom: 56,
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  glowOrange: {
    backgroundColor: COLORS.glowOrange,
    top: -60,
    right: -60,
  },
  glowIndigo: {
    backgroundColor: COLORS.glowIndigo,
    bottom: -80,
    left: -60,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 28,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  wordmark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  eyebrow: {
    color: COLORS.accentLight,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  headline: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
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
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 46,
  },
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 16,
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 18,
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
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  trustText: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
