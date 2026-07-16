// Deep indigo primary, orange accent — the same identity as
// frontend/src/pages/auth/AuthPage.jsx's indigo-900 hero / orange-500 accent,
// now applied app-wide rather than just the login screen.
export const COLORS = {
  primary: '#3730A3',
  primaryDark: '#1E1B4B',
  primarySoft: '#EEF2FF',
  accent: '#F97316',
  accentLight: '#FB923C',
  accentSoft: '#FFEDD5',
  background: '#FFFFFF',
  surface: '#F5F5F7',
  card: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  tabInactive: '#9CA3AF',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  heroText: '#C7D2FE',
  glowIndigo: 'rgba(99, 102, 241, 0.35)',
  glowOrange: 'rgba(249, 115, 22, 0.25)',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#D97706',
  warningSoft: '#FEF3C7',
  star: '#FBBF24',
};

// One spacing scale, used instead of scattering magic numbers through
// screen styles.
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

// One radius scale — chips/badges use `pill`, cards use `md`/`lg`, hero
// panels and bottom sheets use `xl`.
export const RADII = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

// Shared shadow presets (iOS shadow* + Android elevation together).
export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  floating: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  stickyBar: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
};
