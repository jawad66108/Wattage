/**
 * core/notifications.ts
 *
 * Local (device-scheduled) notifications warning the user before an
 * outage starts, e.g. "Power cuts in 15 minutes — plug in your laptop."
 * These are scheduled entirely on-device via expo-notifications; no
 * server or push service involved, consistent with the offline-first
 * design.
 *
 * Expo Go note: as of SDK 53, Expo Go's Android build no longer includes
 * expo-notifications' native module, and touching it there throws and
 * can crash whatever screen imported this file. That's a real EAS/dev
 * build limitation this app will never hit (dev builds and the
 * production APK both include the native module), but it shouldn't
 * crash your Expo Go dev loop while you're iterating on everything else.
 * So: detect Expo Go at runtime and no-op instead of crashing.
 */
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type { OutageWindow } from "./scheduler";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Platform.OS === "web";

// Conditionally require rather than statically import, so the native
// module is never touched at all under Expo Go — a static `import` would
// still evaluate the module and could throw before we get a chance to
// check `isExpoGo`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Notifications: typeof import("expo-notifications") | null = isExpoGo
  ? null
  : (require("expo-notifications") as typeof import("expo-notifications"));

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} else if (__DEV__) {
  console.warn(
    "[notifications] Running in Expo Go, where expo-notifications' native module isn't available on " +
      "Android since SDK 53. Outage warnings are disabled here — use a dev build " +
      "(`npx expo run:android` or an EAS dev build) to test them for real.",
  );
}

/** Requests permission; returns whether it was granted. Always false in Expo Go. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

const WARNING_LEAD_MINUTES = 15;

/**
 * Cancels any previously-scheduled outage warnings and schedules fresh
 * ones for today, `WARNING_LEAD_MINUTES` before each outage window
 * starts. Call this whenever the user edits their outage schedule.
 * Silently does nothing in Expo Go (see module note above) so the rest
 * of the save flow (area name, outage windows, onboarding flag) still
 * completes normally.
 */
export async function rescheduleOutageWarnings(
  windows: OutageWindow[],
): Promise<void> {
  if (!Notifications) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const granted = await ensureNotificationPermission();
  if (!granted) return;

  const now = new Date();

  for (const w of windows) {
    const warnAt = new Date(now);
    warnAt.setHours(0, w.startMin - WARNING_LEAD_MINUTES, 0, 0);

    // Skip windows whose warning time has already passed today.
    if (warnAt.getTime() <= now.getTime()) continue;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Power cut coming up",
        body: w.label
          ? `${w.label} starts in ${WARNING_LEAD_MINUTES} minutes. Save your work and plug in.`
          : `A scheduled outage starts in ${WARNING_LEAD_MINUTES} minutes. Save your work and plug in.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: warnAt,
      },
    });
  }
}
