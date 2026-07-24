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
import { COLORS, RADII, SPACING } from '../src/constants/colors';
import AuthHero from '../src/components/AuthHero';
import Dropdown from '../src/components/Dropdown';
import { DISTRICTS } from '../src/constants/districts';

// Full role parity with frontend/src/pages/auth/AuthPage.jsx's signup form —
// same three roles, same fields, same payload shape per role (see the
// conditional spread in handleSignup, mirroring AuthPage.jsx's handleSignup
// payload construction), same POST /auth/register endpoint, same
// role-specific success states.
// Contact rules — identical to the backend (backend/utils/contactValidation.js):
// phone is exactly 10 digits starting 98/97; email is a standard-format check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(98|97)\d{8}$/;
const PHONE_MSG = 'Phone number must be exactly 10 digits and start with 98 or 97.';
const SHOP_PHONE_MSG = 'Shop contact number must be exactly 10 digits and start with 98 or 97.';

// AuthPage.jsx's `roles` array (role tabs on the auth screen).
const ROLES = [
  { key: 'customer', label: 'Customer', icon: '🛍️' },
  { key: 'seller', label: 'Seller', icon: '🏪' },
  { key: 'delivery', label: 'Delivery', icon: '🚚' },
];

// AuthPage.jsx's vehicleType <select> options.
const VEHICLE_TYPES = ['Motorcycle', 'Scooter', 'Bicycle', 'Van / Car'];

// Document checklists from AuthPage.jsx's seller/delivery success screen
// ("Step 3 — Visit NepShop Office").
const OFFICE_DOCS = {
  seller: [
    'Citizenship card (original + photocopy)',
    'PAN registration certificate',
    'Business registration document',
    'Recent passport-size photo',
  ],
  delivery: [
    'Citizenship card (original + photocopy)',
    'Driving license',
    'Vehicle registration document (bluebook)',
    'Recent passport-size photo',
  ],
};

export default function SignupScreen() {
  const [role, setRole] = useState('customer');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Seller-only fields
  const [shopName, setShopName] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [shopStreet, setShopStreet] = useState('');
  const [shopCity, setShopCity] = useState('');
  const [shopDistrict, setShopDistrict] = useState('');
  const [shopPhone, setShopPhone] = useState('');

  // Delivery-only fields
  const [vehicleType, setVehicleType] = useState('');
  const [citizenshipNumber, setCitizenshipNumber] = useState('');

  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  const [successMessage, setSuccessMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  const changeRole = (r) => {
    setRole(r);
    setErrors({});
    setApiError('');
  };

  // Mirrors AuthPage.jsx's validate() for currentMode === 'signup'.
  const validate = () => {
    const e = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    if (!phone.trim()) e.phone = 'Phone number is required';
    else if (!PHONE_RE.test(phone.trim())) e.phone = PHONE_MSG;

    if (role === 'seller') {
      if (!shopName.trim()) e.shopName = 'Shop name is required';
      if (!panNumber.trim()) e.panNumber = 'PAN number is required';
      if (!shopStreet.trim()) e.shopStreet = 'Shop street address is required';
      if (!shopCity.trim()) e.shopCity = 'City is required';
      if (!shopDistrict) e.shopDistrict = 'District is required';
      if (!shopPhone.trim()) e.shopPhone = 'Shop contact number is required';
      else if (!PHONE_RE.test(shopPhone.trim())) e.shopPhone = SHOP_PHONE_MSG;
    }
    if (role === 'delivery') {
      if (!vehicleType) e.vehicleType = 'Vehicle type is required';
      if (!citizenshipNumber.trim()) e.citizenshipNumber = 'Citizenship number is required';
    }

    if (!email || !EMAIL_RE.test(email.trim())) e.email = 'Please enter a valid email address';
    if (!password || password.length < 8) e.password = 'Password must be at least 8 characters';
    else if (!/[A-Z]/.test(password)) e.password = 'Password must contain at least one uppercase letter';
    else if (!/[0-9]/.test(password)) e.password = 'Password must contain at least one number';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match';
    return e;
  };

  const handleSignup = async () => {
    const newErrors = validate();
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setApiError('');
    setLoading(true);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
        ...(role === 'seller' && {
          shopName: shopName.trim(),
          panNumber: panNumber.trim(),
          shopAddress: {
            street: shopStreet.trim(),
            city: shopCity.trim(),
            district: shopDistrict,
            phone: shopPhone.trim(),
          },
        }),
        ...(role === 'delivery' && {
          vehicleType,
          citizenshipNumber: citizenshipNumber.trim(),
        }),
      };
      const { data } = await API.post('/auth/register', payload);
      setSuccessMessage(data.message);
    } catch (err) {
      setApiError(err.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMsg('');
    try {
      await API.post('/auth/resend-verification', { email: email.trim() });
      setResendMsg('A new verification link has been sent. Please check your inbox.');
    } catch {
      setResendMsg('Could not resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  if (successMessage) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
            <AuthHero eyebrow="Almost there">
              One last step{'\n'}
              <Text style={{ color: COLORS.accentLight }}>to get started.</Text>
            </AuthHero>

            {role === 'customer' ? (
              <CustomerSuccess
                message={successMessage}
                resendMsg={resendMsg}
                resending={resending}
                onResend={handleResend}
              />
            ) : (
              <ApplicationSuccess role={role} message={successMessage} />
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

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
          <AuthHero eyebrow="Join Nepal's Marketplace">
            Create your{'\n'}
            <Text style={{ color: COLORS.accentLight }}>NepShop account.</Text>
          </AuthHero>

          <View style={styles.card}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Join NepShop as a customer, seller, or delivery agent</Text>

            <View style={styles.roleTabs}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.key}
                  style={[styles.roleTab, role === r.key && styles.roleTabActive]}
                  onPress={() => changeRole(r.key)}
                >
                  <Text style={styles.roleTabIcon}>{r.icon}</Text>
                  <Text style={[styles.roleTabText, role === r.key && styles.roleTabTextActive]}>
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {role !== 'customer' && (
              <View style={styles.noticeBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} style={styles.noticeIcon} />
                <Text style={[styles.noticeText, { color: COLORS.primary }]}>
                  {role === 'seller'
                    ? 'Your seller account will require admin approval before you can start selling.'
                    : 'Your delivery agent account will require admin approval before activation.'}
                </Text>
              </View>
            )}

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  style={[styles.input, errors.firstName && styles.inputError]}
                  placeholder="Ritik"
                  placeholderTextColor={COLORS.tabInactive}
                  value={firstName}
                  onChangeText={setFirstName}
                />
                {errors.firstName && <Text style={styles.fieldError}>{errors.firstName}</Text>}
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  style={[styles.input, errors.lastName && styles.inputError]}
                  placeholder="Jayswal"
                  placeholderTextColor={COLORS.tabInactive}
                  value={lastName}
                  onChangeText={setLastName}
                />
                {errors.lastName && <Text style={styles.fieldError}>{errors.lastName}</Text>}
              </View>
            </View>

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={[styles.input, errors.phone && styles.inputError]}
              placeholder="98XXXXXXXX"
              placeholderTextColor={COLORS.tabInactive}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
            {errors.phone && <Text style={styles.fieldError}>{errors.phone}</Text>}

            {role === 'seller' && (
              <>
                <Text style={styles.label}>Shop / business name</Text>
                <TextInput
                  style={[styles.input, errors.shopName && styles.inputError]}
                  placeholder="My Nepal Store"
                  placeholderTextColor={COLORS.tabInactive}
                  value={shopName}
                  onChangeText={setShopName}
                />
                {errors.shopName && <Text style={styles.fieldError}>{errors.shopName}</Text>}

                <Text style={styles.label}>PAN / registration number</Text>
                <TextInput
                  style={[styles.input, errors.panNumber && styles.inputError]}
                  placeholder="PAN or Reg. no."
                  placeholderTextColor={COLORS.tabInactive}
                  value={panNumber}
                  onChangeText={setPanNumber}
                />
                {errors.panNumber && <Text style={styles.fieldError}>{errors.panNumber}</Text>}

                <Text style={styles.label}>Shop street address</Text>
                <TextInput
                  style={[styles.input, errors.shopStreet && styles.inputError]}
                  placeholder="e.g. New Road, Shop no. 5"
                  placeholderTextColor={COLORS.tabInactive}
                  value={shopStreet}
                  onChangeText={setShopStreet}
                />
                {errors.shopStreet && <Text style={styles.fieldError}>{errors.shopStreet}</Text>}

                <View style={styles.row}>
                  <View style={styles.half}>
                    <Text style={styles.label}>City</Text>
                    <TextInput
                      style={[styles.input, errors.shopCity && styles.inputError]}
                      placeholder="e.g. Kathmandu"
                      placeholderTextColor={COLORS.tabInactive}
                      value={shopCity}
                      onChangeText={setShopCity}
                    />
                    {errors.shopCity && <Text style={styles.fieldError}>{errors.shopCity}</Text>}
                  </View>
                  <View style={styles.half}>
                    <Text style={styles.label}>District</Text>
                    <Dropdown
                      value={shopDistrict}
                      onChange={setShopDistrict}
                      options={DISTRICTS}
                      placeholder="Select district"
                      error={errors.shopDistrict}
                    />
                  </View>
                </View>
                {errors.shopDistrict && <Text style={styles.fieldError}>{errors.shopDistrict}</Text>}

                <Text style={styles.label}>Shop contact number</Text>
                <TextInput
                  style={[styles.input, errors.shopPhone && styles.inputError]}
                  placeholder="Shop phone for delivery agent"
                  placeholderTextColor={COLORS.tabInactive}
                  value={shopPhone}
                  onChangeText={setShopPhone}
                />
                {errors.shopPhone && <Text style={styles.fieldError}>{errors.shopPhone}</Text>}
              </>
            )}

            {role === 'delivery' && (
              <>
                <Text style={styles.label}>Vehicle type</Text>
                <ChipPicker value={vehicleType} onChange={setVehicleType} options={VEHICLE_TYPES} />
                {errors.vehicleType && <Text style={styles.fieldError}>{errors.vehicleType}</Text>}

                <Text style={styles.label}>Citizenship / ID number</Text>
                <TextInput
                  style={[styles.input, errors.citizenshipNumber && styles.inputError]}
                  placeholder="Citizenship no."
                  placeholderTextColor={COLORS.tabInactive}
                  value={citizenshipNumber}
                  onChangeText={setCitizenshipNumber}
                />
                {errors.citizenshipNumber && <Text style={styles.fieldError}>{errors.citizenshipNumber}</Text>}
              </>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.tabInactive}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}

            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput, errors.password && styles.inputError]}
                placeholder="Min. 8 chars, 1 uppercase, 1 number"
                placeholderTextColor={COLORS.tabInactive}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
              />
              <Pressable style={styles.eyeButton} hitSlop={10} onPress={() => setShowPassword((v) => !v)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.textMuted} />
              </Pressable>
            </View>
            {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}

            <Text style={styles.label}>Confirm password</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput, errors.confirmPassword && styles.inputError]}
                placeholder="Re-enter your password"
                placeholderTextColor={COLORS.tabInactive}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
              <Pressable style={styles.eyeButton} hitSlop={10} onPress={() => setShowConfirmPassword((v) => !v)}>
                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color={COLORS.textMuted} />
              </Pressable>
            </View>
            {errors.confirmPassword && <Text style={styles.fieldError}>{errors.confirmPassword}</Text>}

            {apiError ? <Text style={styles.error}>{apiError}</Text> : null}

            <Pressable
              style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
              onPress={handleSignup}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading
                  ? 'Creating account…'
                  : role === 'customer' ? 'Create account'
                  : role === 'seller' ? 'Apply as seller'
                  : 'Apply as delivery agent'}
              </Text>
            </Pressable>

            <Pressable style={styles.signupRow} onPress={() => router.back()} hitSlop={6}>
              <Text style={styles.signupText}>
                Already have an account? <Text style={styles.signupLink}>Sign in</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// Customer success — kept from the previous build: "verify email, then log
// in" with a working resend, matching AuthPage.jsx's customer success branch.
function CustomerSuccess({ message, resendMsg, resending, onResend }) {
  return (
    <View style={styles.card}>
      <View style={styles.successIconWrap}>
        <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
      </View>
      <Text style={styles.successTitle}>Account created!</Text>
      <Text style={styles.successMessage}>{message}</Text>

      <View style={styles.noticeBox}>
        <Ionicons name="mail-outline" size={16} color={COLORS.warning} style={styles.noticeIcon} />
        <Text style={styles.noticeText}>
          Please check your email and click the verification link to activate your account, then sign in.
        </Text>
      </View>

      {resendMsg ? (
        <Text style={styles.resendDone}>{resendMsg}</Text>
      ) : (
        <Pressable onPress={onResend} disabled={resending} hitSlop={6} style={styles.resendRow}>
          <Text style={styles.resendLink}>
            {resending ? 'Sending…' : "Didn't get it? Resend verification email"}
          </Text>
        </Pressable>
      )}

      <Pressable style={styles.submitButton} onPress={() => router.replace('/login')}>
        <Text style={styles.submitButtonText}>Go to Sign in</Text>
      </Pressable>
    </View>
  );
}

// Seller/delivery success — mirrors AuthPage.jsx's 3-step application state
// (verify email / pending admin approval / visit office with documents),
// restyled for mobile. No resend button here — the web doesn't show one on
// this branch either, only on the login page's unverified-login notice.
function ApplicationSuccess({ role, message }) {
  return (
    <View style={styles.card}>
      <View style={styles.successIconWrap}>
        <Ionicons name="hourglass-outline" size={52} color={COLORS.warning} />
      </View>
      <Text style={styles.successTitle}>Application submitted!</Text>
      <Text style={styles.successMessage}>{message}</Text>

      <View style={styles.noticeBox}>
        <Ionicons name="mail-outline" size={16} color={COLORS.warning} style={styles.noticeIcon} />
        <Text style={styles.noticeText}>
          Step 1 — Verify your email. We've sent a verification link to your email. Please click it to
          confirm your address — this is required before your account can be activated.
        </Text>
      </View>

      <View style={styles.pendingPill}>
        <View style={styles.pendingDot} />
        <Text style={styles.pendingPillText}>Step 2 — Pending admin approval</Text>
      </View>

      <View style={styles.noticeBox}>
        <View style={styles.noticeTextWrap}>
          <Text style={[styles.noticeText, styles.noticeTextBold]}>
            Step 3 — Visit NepShop Office
          </Text>
          <Text style={styles.noticeText}>
            To complete your verification, please visit our office with the following documents:
          </Text>
          {OFFICE_DOCS[role].map((doc) => (
            <Text key={doc} style={styles.docItem}>• {doc}</Text>
          ))}
          <View style={styles.officeInfo}>
            <Text style={styles.officeInfoTitle}>📍 NepShop Office</Text>
            <Text style={styles.officeInfoText}>Kathmandu, Bagmati Province, Nepal</Text>
            <Text style={styles.officeInfoText}>Office hours: Sun – Fri, 10:00 AM – 5:00 PM</Text>
          </View>
        </View>
      </View>

      <Text style={styles.footerNote}>
        You will receive an email notification once your account is approved.
      </Text>

      <Pressable style={styles.submitButton} onPress={() => router.replace('/login')}>
        <Text style={styles.submitButtonText}>Back to Sign in</Text>
      </Pressable>
    </View>
  );
}

// Inline replacement for the web's vehicle-type <select> — a wrapping row
// of pill chips (only 4 short options, so this reads fine without a modal).
// District now uses the real Dropdown component instead (11 options).
function ChipPicker({ value, onChange, options }) {
  return (
    <View style={styles.chipPicker}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          style={[styles.pickerChip, value === opt && styles.pickerChipActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.pickerChipText, value === opt && styles.pickerChipTextActive]}>
            {opt}
          </Text>
        </Pressable>
      ))}
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
    borderTopLeftRadius: RADII.xl + 4,
    borderTopRightRadius: RADII.xl + 4,
    marginTop: -24,
    paddingHorizontal: SPACING.xl + 4,
    paddingTop: SPACING.xl + 8,
    paddingBottom: SPACING.xxl + 4,
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
    marginBottom: SPACING.lg,
  },
  roleTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: 4,
    gap: 4,
    marginBottom: SPACING.md,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.sm + 1,
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
    fontSize: 13,
  },
  roleTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  roleTabTextActive: {
    color: COLORS.primary,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  half: {
    flex: 1,
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
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.md,
    marginBottom: 6,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  fieldError: {
    color: COLORS.danger,
    fontSize: 12,
    marginBottom: SPACING.sm,
  },
  chipPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs + 2,
    marginBottom: 6,
  },
  pickerChip: {
    paddingHorizontal: SPACING.md - 2,
    paddingVertical: SPACING.sm - 1,
    borderRadius: RADII.pill,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pickerChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  pickerChipTextActive: {
    color: '#fff',
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
    bottom: 6,
    justifyContent: 'center',
  },
  error: {
    color: COLORS.danger,
    fontSize: 13,
    marginBottom: SPACING.md,
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.md,
    paddingVertical: SPACING.md + 3,
    alignItems: 'center',
    marginTop: SPACING.sm,
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
  signupRow: {
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  signupText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  signupLink: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  successIconWrap: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  successMessage: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  noticeBox: {
    flexDirection: 'row',
    gap: SPACING.sm,
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md - 2,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeTextWrap: {
    flex: 1,
    gap: 4,
  },
  noticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#92400E',
  },
  noticeTextBold: {
    fontWeight: '700',
    color: '#78350F',
  },
  docItem: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#92400E',
  },
  officeInfo: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  officeInfoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#78350F',
  },
  officeInfoText: {
    fontSize: 11.5,
    color: '#92400E',
  },
  pendingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs + 2,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: RADII.pill,
    paddingHorizontal: SPACING.md - 2,
    paddingVertical: SPACING.sm - 2,
    marginBottom: SPACING.md - 2,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  pendingPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  footerNote: {
    fontSize: 11.5,
    color: COLORS.tabInactive,
    marginBottom: SPACING.md,
  },
  resendRow: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  resendDone: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.success,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
});
