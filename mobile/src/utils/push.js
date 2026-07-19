import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { setPushToken } from './notifications';

// ROOT CAUSE (this crash, confirmed from device call stack): expo-notifications
// itself runs a side-effect module at IMPORT time — TokenAutoRegistration.fx.js
// registers a push-token listener as soon as the package is loaded, which
// calls the package's internal warnOfExpoGoPushUsage() unconditionally
// (console.error on Android → LogBox red screen). This fires from the mere
// `import * as Notifications from 'expo-notifications'` line itself, before
// any of our own code runs — so no call-site guard inside this file or
// NotificationTapRouter.js could ever have prevented it; the previous fix
// (gating individual function calls behind isExpoGo()) addressed the wrong
// layer.
//
// Fix: no static import of expo-notifications anywhere in the app. This file
// is the only place that may load it, and only via require() called from
// inside a code path already behind `!isExpoGo()` — so in Expo Go, the
// module's require() line itself is never reached and the package's
// side-effect file never runs. Metro still statically bundles the module
// (require() calls are analyzable at build time); what changes is only
// *when* it executes, not whether it's included in the bundle.
//
// isRunningInExpoGo() (from the 'expo' package) is the same function
// expo-notifications' own warnOfExpoGoPushUsage() trusts internally — it
// checks the native ExpoGo module's actual presence rather than reading a
// manifest field, so it can't drift out of sync with what expo-notifications
// itself is about to do. Constants-based checks kept OR'd in as pure
// defense-in-depth (they can only add true positives, never mask a real
// Expo Go session).
export const isExpoGo = () =>
  isRunningInExpoGo() ||
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

// Lazy accessor — the ONLY place expo-notifications is required anywhere in
// this app. Every call site (in this file and in NotificationTapRouter.js)
// calls this only from inside a branch already gated by `!isExpoGo()`.
// require() is cached by Node/Metro's module registry after the first real
// call, so this stays cheap on repeat use in a non-Expo-Go build.
export const getNotifications = () => require('expo-notifications');

const ANDROID_CHANNEL_ID = 'default';

// Matches mobile/src/constants/colors.js's COLORS.accent — used only for
// the Android channel's LED light color, not imported as a style token
// since this file isn't a component.
const COLOR_ACCENT = '#F97316';

// Android 8+ requires a notification channel to exist before the OS's
// permission prompt (Android 13+) or any notification can be shown. Only
// ever called from registerForPushNotifications() below, after its own
// isExpoGo() early-return.
const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  const Notifications = getNotifications();
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: COLOR_ACCENT,
  });
};

// Sets the foreground notification handler — banner + list, no in-app
// sound/badge management (nothing in this app tracks an app-icon badge
// count). Only ever called from registerForPushNotifications() below, after
// its own isExpoGo() early-return — never at module load, unlike the
// previous version, precisely so requiring expo-notifications never happens
// in Expo Go.
const configureForegroundHandler = () => {
  getNotifications().setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

// Called on successful login/session-restore (mobile/src/context/
// AuthContext.js). Never throws — permission prompts, missing projectId, or
// a flaky push service are all log-and-continue, same posture as the
// backend's own sendPush (backend/utils/notificationService.js).
export const registerForPushNotifications = async () => {
  try {
    if (isExpoGo()) {
      console.log('[push] running in Expo Go — skipping all expo-notifications usage');
      return;
    }

    configureForegroundHandler();
    await ensureAndroidChannel();

    const Notifications = getNotifications();
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[push] permission not granted — skipping token registration');
      return;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log('[push] no EAS projectId configured — skipping token registration');
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    await setPushToken(expoPushToken);
    console.log('[push] token registered');
  } catch (err) {
    console.log(`[push] registration failed — ${err.message}`);
  }
};
