import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { saveOutageWindow, setSetting } from "../core/db";
import { rescheduleOutageWarnings } from "../core/notifications";
import { generateId } from "../core/id";
import { showAlert } from "../core/alert";
import { parseClock, type OutageWindow } from "../core/scheduler";

/**
 * app/onboarding.tsx
 *
 * First-run flow: the user names their area and enters their outage
 * schedule manually. Deliberately NOT scraped from any utility source —
 * see README for why (single point of failure on a hackathon clock, and
 * most load-shedding schedules aren't published in a scrapeable form
 * anyway). Free tier = exactly one area, so this screen doesn't need an
 * area picker yet; that's a Pro feature (see app/paywall.tsx).
 */

interface DraftWindow {
  id: string;
  startHHMM: string; // "HH:MM" 24h, kept as text while editing
  endHHMM: string;
  label: string;
}

export default function Onboarding() {
  const [areaName, setAreaName] = useState("");
  const [windows, setWindows] = useState<DraftWindow[]>([
    {
      id: generateId("ow_"),
      startHHMM: "18:00",
      endHHMM: "20:00",
      label: "Evening outage",
    },
  ]);
  const [saving, setSaving] = useState(false);

  function addWindow() {
    setWindows((prev) => [
      ...prev,
      { id: generateId("ow_"), startHHMM: "", endHHMM: "", label: "" },
    ]);
  }

  function removeWindow(id: string) {
    setWindows((prev) => prev.filter((w) => w.id !== id));
  }

  function updateWindow(id: string, patch: Partial<DraftWindow>) {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    );
  }

  async function handleSave() {
    if (!areaName.trim()) {
      showAlert(
        "Name your area",
        "Give this schedule a name, e.g. your feeder/grid area.",
      );
      return;
    }

    const parsed: OutageWindow[] = [];
    for (const w of windows) {
      const startMin = parseClock(w.startHHMM);
      const endMin = parseClock(w.endHHMM);
      if (startMin === null || endMin === null || endMin <= startMin) {
        showAlert(
          "Check your times",
          `"${w.label || "Untitled window"}" needs a valid start and end time (end after start), like 18:00–20:00 (5, 5:30 and 5pm also work).`,
        );
        return;
      }
      parsed.push({ id: w.id, startMin, endMin, label: w.label || undefined });
    }

    setSaving(true);
    try {
      await setSetting("area_name", areaName.trim());
      for (const w of parsed) {
        await saveOutageWindow(w);
      }
      await rescheduleOutageWarnings(parsed);
      await setSetting("onboarding_complete", "true");
      router.replace("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Set up your area</Text>
      <Text style={styles.subheading}>
        Enter your load-shedding schedule manually — the times your area's mains
        power goes out. You can edit this any time.
      </Text>

      <Text style={styles.label}>Area name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Wah Cantt — Feeder 3"
        placeholderTextColor="#5A6472"
        value={areaName}
        onChangeText={setAreaName}
      />

      <Text style={[styles.label, { marginTop: 24 }]}>
        Outage windows (today)
      </Text>
      {windows.map((w) => (
        <View key={w.id} style={styles.windowRow}>
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="18:00"
            placeholderTextColor="#5A6472"
            value={w.startHHMM}
            onChangeText={(t) => updateWindow(w.id, { startHHMM: t })}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.dash}>–</Text>
          <TextInput
            style={[styles.input, styles.timeInput]}
            placeholder="20:00"
            placeholderTextColor="#5A6472"
            value={w.endHHMM}
            onChangeText={(t) => updateWindow(w.id, { endHHMM: t })}
            keyboardType="numbers-and-punctuation"
          />
          <TextInput
            style={[styles.input, styles.labelInput]}
            placeholder="Label (optional)"
            placeholderTextColor="#5A6472"
            value={w.label}
            onChangeText={(t) => updateWindow(w.id, { label: t })}
          />
          <Pressable
            onPress={() => removeWindow(w.id)}
            style={styles.removeBtn}
          >
            <Text style={styles.removeBtnText}>✕</Text>
          </Pressable>
        </View>
      ))}

      <Pressable onPress={addWindow} style={styles.addBtn}>
        <Text style={styles.addBtnText}>+ Add another window</Text>
      </Pressable>

      <Pressable onPress={handleSave} disabled={saving} style={styles.saveBtn}>
        <Text style={styles.saveBtnText}>
          {saving ? "Saving…" : "Save & continue"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F14" },
  content: { padding: 20, paddingBottom: 60 },
  heading: { fontSize: 24, fontWeight: "700", color: "#F5F7FA" },
  subheading: { fontSize: 14, color: "#8A94A6", marginTop: 8, lineHeight: 20 },
  label: {
    fontSize: 13,
    color: "#8A94A6",
    marginTop: 16,
    marginBottom: 6,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#131A24",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F5F7FA",
    fontSize: 15,
  },
  windowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  timeInput: { width: 72, textAlign: "center" },
  dash: { color: "#8A94A6" },
  labelInput: { flex: 1 },
  removeBtn: { padding: 8 },
  removeBtnText: { color: "#FF5C5C", fontSize: 16 },
  addBtn: { marginTop: 4, paddingVertical: 10 },
  addBtnText: { color: "#F2B705", fontSize: 14, fontWeight: "600" },
  saveBtn: {
    marginTop: 28,
    backgroundColor: "#F2B705",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { color: "#0B0F14", fontSize: 16, fontWeight: "700" },
});
