import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import PowerTimeline from "../components/PowerTimeline";
import TaskCard from "../components/TaskCard";
import {
  listOutageWindows,
  listTasks,
  getSetting,
  markTaskDone,
} from "../core/db";
import {
  scheduleTasks,
  type OutageWindow,
  type PlacedBlock,
  type Task,
  type UnplacedTask,
} from "../core/scheduler";

/**
 * app/index.tsx — "Today"
 *
 * The main screen: runs the scheduler against today's outage windows and
 * open tasks, then renders the PowerTimeline plus a placed/unplaced task
 * list. Re-runs whenever the screen regains focus (e.g. after adding a
 * task or editing the schedule), which is the RN-idiomatic equivalent of
 * a web app's route-change data refetch — `useFocusEffect` from Expo
 * Router stands in for that.
 */
export default function Today() {
  const [areaName, setAreaName] = useState<string | null>(null);
  const [outageWindows, setOutageWindows] = useState<OutageWindow[]>([]);
  const [placed, setPlaced] = useState<PlacedBlock[]>([]);
  const [unplaced, setUnplaced] = useState<UnplacedTask[]>([]);
  const [tasksById, setTasksById] = useState<Record<string, Task>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [area, windows, tasks] = await Promise.all([
      getSetting("area_name"),
      listOutageWindows(),
      listTasks(),
    ]);
    setAreaName(area);
    setOutageWindows(windows);

    const byId: Record<string, Task> = {};
    for (const t of tasks) byId[t.id] = t;
    setTasksById(byId);

    // Plan from now (rounded up to the next 5 minutes), not from midnight.
    const d = new Date();
    const planFrom = Math.min(
      Math.ceil((d.getHours() * 60 + d.getMinutes()) / 5) * 5,
      24 * 60,
    );
    const result = scheduleTasks(tasks, windows, planFrom);
    setPlaced(result.placed);
    setUnplaced(result.unplaced);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleToggleDone(taskId: string, currentlyDone: boolean) {
    await markTaskDone(taskId, !currentlyDone);
    load();
  }

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#F2B705"
        />
      }
    >
      <Text style={styles.areaLabel}>{areaName ?? "Your area"}</Text>
      <Text style={styles.heading}>Today's powered hours</Text>

      <PowerTimeline
        outageWindows={outageWindows}
        placedBlocks={placed}
        nowMin={nowMin}
      />

      {placed.length === 0 && unplaced.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No tasks yet</Text>
          <Text style={styles.emptyBody}>
            Add a task and Wattage will slot it into your next powered hours.
          </Text>
          <Pressable
            style={styles.emptyBtn}
            onPress={() => router.push("/tasks")}
          >
            <Text style={styles.emptyBtnText}>Add a task</Text>
          </Pressable>
        </View>
      )}

      {placed.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Scheduled</Text>
          {placed.map((b) => {
            const task = tasksById[b.taskId];
            if (!task) return null;
            return (
              <TaskCard
                key={b.taskId}
                task={task}
                placement={{ startMin: b.startMin, endMin: b.endMin }}
                onToggleDone={() => handleToggleDone(task.id, false)}
              />
            );
          })}
        </>
      )}

      {unplaced.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, styles.warningLabel]}>
            Couldn't fit today
          </Text>
          {unplaced.map((u) => {
            const task = tasksById[u.taskId];
            if (!task) return null;
            return (
              <TaskCard key={u.taskId} task={task} unplacedReason={u.reason} />
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0F14" },
  content: { padding: 20, paddingBottom: 60 },
  areaLabel: {
    fontSize: 13,
    color: "#F2B705",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: "#F5F7FA",
    marginTop: 4,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 13,
    color: "#8A94A6",
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 10,
  },
  warningLabel: { color: "#FF5C5C" },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyTitle: { color: "#F5F7FA", fontSize: 17, fontWeight: "600" },
  emptyBody: {
    color: "#8A94A6",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  emptyBtn: {
    marginTop: 12,
    backgroundColor: "#F2B705",
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyBtnText: { color: "#0B0F14", fontWeight: "700" },
});
