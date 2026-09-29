/**
 * components/TaskCard.tsx
 *
 * A single task row, used in both the "today" plan (shows placed time)
 * and the tasks list (shows unscheduled tasks awaiting placement).
 */
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import type { Task } from "../core/scheduler";
import { formatClock } from "../core/scheduler";

interface Props {
  task: Task;
  /** If placed, show the scheduled time range. If unplaced, show why not. */
  placement?: { startMin: number; endMin: number } | null;
  unplacedReason?: string | null;
  onToggleDone?: () => void;
  onPress?: () => void;
  done?: boolean;
}

export default function TaskCard({ task, placement, unplacedReason, onToggleDone, onPress, done }: Props) {
  return (
    <Pressable onPress={onPress} style={[styles.card, done && styles.cardDone]}>
      <Pressable onPress={onToggleDone} hitSlop={12} style={[styles.checkbox, done && styles.checkboxDone]}>
        {done && <View style={styles.checkboxDot} />}
      </Pressable>

      <View style={styles.body}>
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={1}>
          {task.title}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.badge, task.requiresMainsPower ? styles.badgeMains : styles.badgeBattery]}>
            <Text style={styles.badgeText}>{task.requiresMainsPower ? "Needs mains" : "Battery OK"}</Text>
          </View>
          <Text style={styles.duration}>{task.durationMinutes} min</Text>
        </View>

        {placement && (
          <Text style={styles.scheduled}>
            {formatClock(placement.startMin)} – {formatClock(placement.endMin)}
          </Text>
        )}
        {unplacedReason && <Text style={styles.warning}>⚠ {unplacedReason}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#131A24",
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginBottom: 8,
  },
  cardDone: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#8A94A6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxDone: {
    borderColor: "#3DDC97",
    backgroundColor: "#3DDC97",
  },
  checkboxDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0B0F14",
  },
  body: {
    flex: 1,
  },
  title: {
    color: "#F5F7FA",
    fontSize: 16,
    fontWeight: "600",
  },
  titleDone: {
    textDecorationLine: "line-through",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeMains: {
    backgroundColor: "#F2B70533",
  },
  badgeBattery: {
    backgroundColor: "#3DDC9733",
  },
  badgeText: {
    fontSize: 11,
    color: "#F5F7FA",
    fontWeight: "500",
  },
  duration: {
    fontSize: 12,
    color: "#8A94A6",
  },
  scheduled: {
    marginTop: 6,
    fontSize: 13,
    color: "#3DDC97",
  },
  warning: {
    marginTop: 6,
    fontSize: 13,
    color: "#FF5C5C",
  },
});
