/**
 * core/purchases.ts
 *
 * RevenueCat integration. Everything Wattage's paywall needs funnels
 * through this module: SDK init, fetching the current offering, making
 * a purchase, restoring purchases, and checking entitlement status.
 *
 * ENTITLEMENT_ID must match the entitlement identifier you create in the
 * RevenueCat dashboard (Entitlements tab) — "pro" is just this project's
 * convention, rename it there and here together if you change it.
 *
 * API keys: never hardcode them. Set EXPO_PUBLIC_RC_ANDROID_KEY in a
 * local .env (gitignored) or via `eas secret:create`. RevenueCat public
 * SDK keys are safe to ship in a client build — that's how the SDK is
 * designed to work — but keep them out of the public repo history by
 * loading from env rather than committing the literal string.
 */
import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  LOG_LEVEL,
} from "react-native-purchases";

export const ENTITLEMENT_ID = "pro";

let initialized = false;

// Expo Go and web both lack the native store, so both use the Test Store key.
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  Platform.OS === "web";

/**
 * Call once, as early as possible (e.g. in app/_layout.tsx). Safe to call
 * multiple times — subsequent calls are no-ops.
 *
 * Key selection: RevenueCat's SDK refuses a real store key (goog_... /
 * appl_...) while running inside Expo Go — it only accepts a Test Store
 * key there (see https://rev.cat/sdk-test-store). So in Expo Go we use
 * EXPO_PUBLIC_RC_TEST_STORE_KEY; in a dev build or the real production
 * APK, we use the real per-platform key. This means the same .env works
 * whether you're iterating in Expo Go or running a real build — nothing
 * to swap by hand before shipping.
 */
export async function initPurchases(): Promise<void> {
  if (initialized) return;

  const apiKey = IS_EXPO_GO
    ? process.env.EXPO_PUBLIC_RC_TEST_STORE_KEY
    : Platform.OS === "android"
      ? process.env.EXPO_PUBLIC_RC_ANDROID_KEY
      : process.env.EXPO_PUBLIC_RC_IOS_KEY;

  if (!apiKey) {
    const missingVar = IS_EXPO_GO
      ? "EXPO_PUBLIC_RC_TEST_STORE_KEY"
      : "EXPO_PUBLIC_RC_ANDROID_KEY / EXPO_PUBLIC_RC_IOS_KEY";
    // Fails loudly in dev rather than silently no-op'ing, so a missing
    // key never gets mistaken for "the paywall has no offerings yet".
    console.warn(
      `[purchases] No RevenueCat API key found in ${missingVar}. ` +
        "The paywall will not be able to fetch offerings until this is set (see README > RevenueCat setup).",
    );
    return;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  try {
    Purchases.configure({ apiKey });
    initialized = true;
  } catch (e) {
    // Don't crash the app over a purchases misconfiguration; the paywall
    // will show its own error state instead.
    console.warn("[purchases] configure failed:", e);
  }
}

/** Fetches the current default offering (the paywall's product list). */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

/** True if the signed-in user currently has the "pro" entitlement active. */
export async function isProEntitled(
  customerInfo?: CustomerInfo,
): Promise<boolean> {
  const info = customerInfo ?? (await Purchases.getCustomerInfo());
  return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

/** Purchases a specific package from the current offering's list. */
export async function purchasePackage(
  pkg: NonNullable<PurchasesOffering["availablePackages"]>[number],
): Promise<{ success: boolean; isPro: boolean; cancelled?: boolean }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, isPro: await isProEntitled(customerInfo) };
  } catch (e: any) {
    if (e?.userCancelled) {
      return { success: false, isPro: false, cancelled: true };
    }
    throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  const customerInfo = await Purchases.restorePurchases();
  return isProEntitled(customerInfo);
}

/** Subscribe to entitlement changes (e.g. to keep a screen's gate live-updated). */
export function onCustomerInfoUpdate(
  callback: (isPro: boolean) => void,
): () => void {
  const listener = (info: CustomerInfo) => {
    callback(info.entitlements.active[ENTITLEMENT_ID] !== undefined);
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => Purchases.removeCustomerInfoUpdateListener(listener);
}
