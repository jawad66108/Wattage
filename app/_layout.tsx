import React, { useEffect, useState } from "react";
import { Stack, Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { initPurchases } from "../core/purchases";
import { getSetting } from "../core/db";

/**
 * app/_layout.tsx
 *
 * Root layout: boots RevenueCat, checks whether onboarding (setting the
 * user's outage schedule for the first time) has been completed, and
 * routes accordingly. Expo Router's file-based routing means each file
 * under app/ is a screen — this is the RN equivalent of a root App.tsx +
 * navigator setup in bare React Navigation, but wired by folder structure
 * instead of manual route config.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    (async () => {
      // Purchases is a Pro-tier extra. If it fails (bad key, no network,
      // Expo Go limits), the free app must still open, so never let it
      // block startup.
      try {
        await initPurchases();
      } catch (e) {
        console.warn(
          "[startup] RevenueCat init failed; continuing without it:",
          e,
        );
      }
      try {
        const onboarded = await getSetting("onboarding_complete");
        setNeedsOnboarding(onboarded !== "true");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#F2B705" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0B0F14" },
          headerTintColor: "#F5F7FA",
        }}
      >
        <Stack.Screen name="index" options={{ title: "Today" }} />
        <Stack.Screen name="tasks" options={{ title: "Tasks" }} />
        <Stack.Screen
          name="onboarding"
          options={{ title: "Set up your area", headerBackVisible: false }}
        />
        <Stack.Screen
          name="paywall"
          options={{ title: "Wattage Pro", presentation: "modal" }}
        />
      </Stack>
      {needsOnboarding && <Redirect href="/onboarding" />}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: "#0B0F14",
    alignItems: "center",
    justifyContent: "center",
  },
});
