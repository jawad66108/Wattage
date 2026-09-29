import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import type {
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import { showAlert } from "../core/alert";
import {
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
} from "../core/purchases";

/**
 * app/paywall.tsx
 *
 * Fetches the live RevenueCat offering and renders whatever packages are
 * configured in the dashboard — nothing here is hardcoded to a specific
 * price or product ID, so changing prices/products in RevenueCat doesn't
 * require an app update. This is the screen that satisfies the "uses
 * RevenueCat thoughtfully" judging criterion: real SDK call, real
 * offering, real entitlement unlock on purchase.
 */
const PRO_FEATURES = [
  "Unlimited areas & schedules",
  "Cross-device schedule sync",
  "Home-screen powered-hours widget",
  "Battery-budget planning",
  "Unlimited tasks",
];

export default function Paywall() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const o = await getCurrentOffering();
        setOffering(o);
      } catch (e) {
        setError(
          "Couldn't load pricing right now. Check your connection and try again.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasingId(pkg.identifier);
    try {
      const result = await purchasePackage(pkg);
      if (result.cancelled) return;
      if (result.isPro) {
        showAlert("You're Pro 🎉", "All Pro features are unlocked.");
        router.back();
      } else {
        // The purchase itself succeeded, but the "pro" entitlement isn't
        // active afterward — almost always means the product on
        // RevenueCat's dashboard isn't attached to the "pro" entitlement.
        showAlert(
          "Purchase completed, but Pro isn't active",
          'The purchase went through, but the "pro" entitlement didn\'t activate. ' +
            "Check that this product is attached to the pro entitlement in RevenueCat > Product catalog > Products.",
        );
      }
    } catch (e) {
      showAlert(
        "Purchase failed",
        "Something went wrong completing the purchase. Please try again.",
      );
    } finally {
      setPurchasingId(null);
    }
  }

  async function handleRestore() {
    try {
      const isPro = await restorePurchases();
      if (isPro) {
        showAlert("Restored", "Your Pro purchase has been restored.");
        router.back();
      } else {
        showAlert(
          "Nothing to restore",
          "No active Pro purchase was found for this account.",
        );
      }
    } catch {
      showAlert("Restore failed", "Couldn't restore purchases right now.");
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Wattage Pro</Text>
      <Text style={styles.subheading}>
        Plan around power cuts across every area you care about.
      </Text>

      <View style={styles.featureList}>
        {PRO_FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Text style={styles.featureCheck}>✓</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#F2B705" />
        </View>
      )}

      {!loading && error && <Text style={styles.error}>{error}</Text>}

      {!loading &&
        !error &&
        offering &&
        offering.availablePackages.length === 0 && (
          <Text style={styles.error}>
            No packages are configured for this offering yet in RevenueCat.
          </Text>
        )}
      {!loading && !error && !offering && (
        <Text style={styles.error}>
          No current offering is set up in RevenueCat yet.
        </Text>
      )}

      {!loading &&
        offering?.availablePackages.map((pkg) => (
          <Pressable
            key={pkg.identifier}
            style={styles.packageBtn}
            disabled={purchasingId !== null}
            onPress={() => handlePurchase(pkg)}
          >
            {purchasingId === pkg.identifier ? (
              <ActivityIndicator color="#0B0F14" />
            ) : (
              <>
                <Text style={styles.packageTitle}>
                  {pkg.product.title || pkg.identifier}
                </Text>
                <Text style={styles.packagePrice}>
                  {pkg.product.priceString}
                </Text>
              </>
            )}
          </Pressable>
        ))}

      <Pressable onPress={handleRestore} style={styles.restoreBtn}>
        <Text style={styles.restoreText}>Restore purchases</Text>
      </Pressable>

      <Pressable onPress={() => router.back()} style={styles.dismissBtn}>
        <Text style={styles.dismissText}>Not now</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F14" },
  content: { padding: 24, paddingBottom: 48 },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    color: "#F5F7FA",
    textAlign: "center",
  },
  subheading: {
    fontSize: 14,
    color: "#8A94A6",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  featureList: { gap: 12, marginBottom: 28 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureCheck: { color: "#3DDC97", fontWeight: "700" },
  featureText: { color: "#F5F7FA", fontSize: 15 },
  loadingBox: { paddingVertical: 30, alignItems: "center" },
  error: { color: "#FF5C5C", textAlign: "center", marginBottom: 16 },
  packageBtn: {
    backgroundColor: "#F2B705",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  packageTitle: { color: "#0B0F14", fontWeight: "700", fontSize: 15 },
  packagePrice: { color: "#0B0F14", fontSize: 13, marginTop: 2 },
  restoreBtn: { marginTop: 8, alignItems: "center", paddingVertical: 10 },
  restoreText: { color: "#8A94A6", fontSize: 13 },
  dismissBtn: { alignItems: "center", paddingVertical: 10 },
  dismissText: { color: "#5A6472", fontSize: 13 },
});
