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

// DIAGNOSIS: the old channel id was 'default', already created with
// importance: MAX in this file's code — but Android PINS a channel's
// importance at the moment that channel id is first created on a given
// device install, and never re-reads it on subsequent
// setNotificationChannelAsync calls with the same id. If 'default' was ever
// created earlier at a lower importance on a test device (e.g. Expo's own
// auto-created default channel, or an earlier build before this file set
// MAX explicitly), every later call asking for MAX on that same id was
// silently ignored — that's why pushes were landing in the tray with no
// heads-up banner despite the code already requesting MAX. Only a NEW
// channel id gets a fresh pin. Old low-importance 'default' channels left
// on already-installed devices are harmless — nothing sends to them anymore
// once the backend's channelId (see backend/utils/notificationService.js)
// switches to this new id.
//
// MUST match backend/utils/notificationService.js's sendPush `channelId`
// field exactly — that's what actually routes a given push to this channel
// on the device; creating the channel here only makes it available/pinned.
const ANDROID_CHANNEL_ID = 'nepshop-high';

// Matches mobile/src/constants/colors.js's COLORS.accent — used only for
// the Android channel's LED light color, not imported as a style token
// since this file isn't a component.
const COLOR_ACCENT = '#F97316';

// Android 8+ requires a notification channel to exist before the OS's
// permission prompt (Android 13+) or any notification can be shown. Only
// ever called from registerForPushNotifications() below, after its own
// isExpoGo() early-return.
//
// Idempotent by construction: setNotificationChannelAsync with the same id
// is safe to call on every login/session-restore (as it already is) —
// Android either creates the channel once or is a no-op against the
// already-pinned one; it never duplicates or errors on repeat calls.
const ensureAndroidChannel = async () => {
  if (Platform.OS !== 'android') return;
  const Notifications = getNotifications();
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'High priority',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
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
