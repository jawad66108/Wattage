import React, { useCallback, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, FlatList, Switch, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect, router } from "expo-router";
import TaskCard from "../components/TaskCard";
import { listTasks, saveTask, deleteTask, markTaskDone, getSetting } from "../core/db";
import { generateId } from "../core/id";
import { isProEntitled } from "../core/purchases";
import type { Task } from "../core/scheduler";

const FREE_TASK_LIMIT = 8; // keeps the free tier usable but nudges toward Pro for heavy users

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [durationText, setDurationText] = useState("30");
  const [requiresMains, setRequiresMains] = useState(false);
  const [isPro, setIsPro] = useState(false);

  const load = useCallback(async () => {
    const [all, pro] = await Promise.all([listTasks({ includeDone: true }), isProEntitled().catch(() => false)]);
    setTasks(all);
    setIsPro(pro);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAdd() {
    const duration = Number(durationText);
    if (!title.trim() || !Number.isFinite(duration) || duration <= 0) return;

    if (!isPro && tasks.length >= FREE_TASK_LIMIT) {
      router.push("/paywall");
      return;
    }

    await saveTask({
      id: generateId("task_"),
      title: title.trim(),
      durationMinutes: duration,
      requiresMainsPower: requiresMains,
    });
    setTitle("");
    setDurationText("30");
    setRequiresMains(false);
    load();
  }

  async function handleToggleDone(task: Task) {
    // We don't track `done` on the Task type itself (scheduler shouldn't
    // know about completion), so we re-fetch after toggling in storage.
    await markTaskDone(task.id, true);
    load();
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={tasks}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TaskCard task={item} onToggleDone={() => handleToggleDone(item)} />}
        ListEmptyComponent={<Text style={styles.empty}>No tasks yet — add your first one below.</Text>}
      />

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Task name"
          placeholderTextColor="#5A6472"
          value={title}
          onChangeText={setTitle}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.durationInput]}
            placeholder="30"
            placeholderTextColor="#5A6472"
            value={durationText}
            onChangeText={setDurationText}
            keyboardType="number-pad"
          />
          <Text style={styles.minLabel}>min</Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Needs mains power</Text>
            <Switch
              value={requiresMains}
              onValueChange={setRequiresMains}
              trackColor={{ true: "#F2B705", false: "#2A3340" }}
            />
          </View>
        </View>

        <Pressable onPress={handleAdd} style={styles.addBtn}>
          <Text style={styles.addBtnText}>Add task</Text>
        </Pressable>

        {!isPro && (
          <Text style={styles.limitNote}>
            Free plan: {Math.min(tasks.length, FREE_TASK_LIMIT)}/{FREE_TASK_LIMIT} tasks.{" "}
            <Text style={styles.limitLink} onPress={() => router.push("/paywall")}>
              Go Pro for unlimited.
            </Text>
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F14" },
  list: { flex: 1 },
  listContent: { padding: 20, paddingBottom: 12 },
  empty: { color: "#8A94A6", textAlign: "center", marginTop: 40 },
  form: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#1B2430",
    backgroundColor: "#0B0F14",
  },
  input: {
    backgroundColor: "#131A24",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F5F7FA",
    fontSize: 15,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  durationInput: { width: 60, textAlign: "center" },
  minLabel: { color: "#8A94A6", fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" },
  switchLabel: { color: "#8A94A6", fontSize: 13 },
  addBtn: { marginTop: 12, backgroundColor: "#F2B705", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  addBtnText: { color: "#0B0F14", fontWeight: "700" },
  limitNote: { marginTop: 10, fontSize: 12, color: "#8A94A6", textAlign: "center" },
  limitLink: { color: "#F2B705", fontWeight: "600" },
});
