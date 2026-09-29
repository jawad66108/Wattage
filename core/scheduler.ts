/**
 * core/scheduler.ts
 *
 * Pure, framework-free scheduling logic. No React Native imports here on
 * purpose — this file should be testable with plain `node`/`jest` and
 * reusable if the UI layer ever changes.
 *
 * Model:
 *  - A day is represented in minutes-from-midnight (0..1440) to avoid
 *    Date/timezone headaches. The UI layer converts to/from clock time.
 *  - An OutageWindow marks a period where mains power is OFF.
 *    "Powered hours" = the complement of outage windows within the day.
 *  - A Task needs `durationMinutes` of a contiguous block, and declares
 *    whether it `requiresMainsPower` (e.g. needs a desktop, iron, router-
 *    dependent work) or can run on `powerSource: "battery"` (laptop/phone
 *    on charge, already topped up).
 *  - The scheduler greedily places tasks (in priority order) into the
 *    earliest available slot that satisfies their power constraint,
 *    across the powered/unpowered timeline. Tasks that don't fit anywhere
 *    are returned as `unplaced` with a human-readable reason.
 */

export type PowerSource = "mains" | "battery";

/** An outage window: mains power is OFF from `startMin` to `endMin`. */
export interface OutageWindow {
  id: string;
  /** Minutes from midnight, 0-1439 */
  startMin: number;
  /** Minutes from midnight, 1-1440, must be > startMin (no overnight wrap in v1) */
  endMin: number;
  label?: string;
}

export interface Task {
  id: string;
  title: string;
  durationMinutes: number;
  /** true = must run during powered (mains) hours. false = can run on battery. */
  requiresMainsPower: boolean;
  /** 1 = highest priority, placed first. Defaults to 3 (normal). */
  priority?: number;
  /** Earliest the task may start, minutes from midnight. Defaults to 0. */
  notBeforeMin?: number;
  /** Latest the task may end by, minutes from midnight. Defaults to 1440. */
  notAfterMin?: number;
}

export interface PlacedBlock {
  taskId: string;
  title: string;
  startMin: number;
  endMin: number;
  powerSource: PowerSource;
}

export interface UnplacedTask {
  taskId: string;
  title: string;
  reason: string;
}

export interface ScheduleResult {
  placed: PlacedBlock[];
  unplaced: UnplacedTask[];
}

/** A free interval in the day, tagged with what power is available. */
interface FreeInterval {
  startMin: number;
  endMin: number;
  powerSource: PowerSource;
}

const DAY_START = 0;
const DAY_END = 24 * 60;

function clampWindow(w: OutageWindow): OutageWindow {
  const startMin = Math.max(DAY_START, Math.min(w.startMin, DAY_END));
  const endMin = Math.max(DAY_START, Math.min(w.endMin, DAY_END));
  return { ...w, startMin, endMin };
}

/**
 * Merge overlapping/adjacent outage windows so downstream logic never has
 * to reason about overlaps.
 */
export function mergeOutageWindows(windows: OutageWindow[]): OutageWindow[] {
  const cleaned = windows
    .map(clampWindow)
    .filter((w) => w.endMin > w.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const merged: OutageWindow[] = [];
  for (const w of cleaned) {
    const last = merged[merged.length - 1];
    if (last && w.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, w.endMin);
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

/**
 * Build the full-day timeline of free intervals, split into "mains"
 * (outside outage windows) and "battery" (inside outage windows — still
 * usable for battery-only tasks) segments.
 */
export function buildDayTimeline(
  outageWindows: OutageWindow[],
): FreeInterval[] {
  const merged = mergeOutageWindows(outageWindows);
  const timeline: FreeInterval[] = [];
  let cursor = DAY_START;

  for (const w of merged) {
    if (w.startMin > cursor) {
      timeline.push({
        startMin: cursor,
        endMin: w.startMin,
        powerSource: "mains",
      });
    }
    timeline.push({
      startMin: w.startMin,
      endMin: w.endMin,
      powerSource: "battery",
    });
    cursor = w.endMin;
  }
  if (cursor < DAY_END) {
    timeline.push({ startMin: cursor, endMin: DAY_END, powerSource: "mains" });
  }
  return timeline;
}

function sortTasksByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pa = a.priority ?? 3;
    const pb = b.priority ?? 3;
    if (pa !== pb) return pa - pb;
    // stable-ish tiebreak: longer tasks first, so short tasks can fill gaps later
    return b.durationMinutes - a.durationMinutes;
  });
}

/**
 * Places tasks into the day's free intervals.
 *
 * Rules:
 *  - A task with `requiresMainsPower: true` may ONLY be placed in a
 *    "mains" interval.
 *  - A task with `requiresMainsPower: false` may be placed in EITHER a
 *    "mains" or "battery" interval (battery-capable work can run any time).
 *  - Placement respects `notBeforeMin` / `notAfterMin` if given.
 *  - Greedy, priority-ordered, earliest-fit. This is a planner for a
 *    single person's day, not a bin-packing optimizer — greedy is the
 *    right level of complexity here and keeps the logic easy to explain
 *    on camera for the demo video.
 */
export function scheduleTasks(
  tasks: Task[],
  outageWindows: OutageWindow[],
  /** Only place work at or after this time (minutes from midnight). Pass the current time so the plan starts "now", not at midnight. */
  nowMin: number = DAY_START,
): ScheduleResult {
  const timeline = buildDayTimeline(outageWindows);
  // mutable copy of remaining free capacity per interval
  const free: FreeInterval[] = timeline.map((f) => ({ ...f }));

  const placed: PlacedBlock[] = [];
  const unplaced: UnplacedTask[] = [];

  for (const task of sortTasksByPriority(tasks)) {
    const ownNotBefore = task.notBeforeMin ?? DAY_START;
    const notBefore = Math.max(ownNotBefore, nowMin);
    const notAfter = task.notAfterMin ?? DAY_END;

    if (task.durationMinutes <= 0) {
      unplaced.push({
        taskId: task.id,
        title: task.title,
        reason: "Duration must be greater than 0 minutes.",
      });
      continue;
    }
    if (notAfter - ownNotBefore < task.durationMinutes) {
      unplaced.push({
        taskId: task.id,
        title: task.title,
        reason: "The allowed time window is shorter than the task itself.",
      });
      continue;
    }

    let bestIndex = -1;
    let bestStart = Infinity;
    let bestRank = Infinity;

    for (let i = 0; i < free.length; i++) {
      const interval = free[i];
      if (task.requiresMainsPower && interval.powerSource !== "mains") continue;

      const usableStart = Math.max(interval.startMin, notBefore);
      const usableEnd = Math.min(interval.endMin, notAfter);
      const usableLength = usableEnd - usableStart;

      // Battery-capable work prefers outage time (rank 0) so powered hours
      // stay free for tasks that genuinely need mains. Mains-only tasks
      // only ever see mains intervals, so their rank is always 0.
      const rank =
        !task.requiresMainsPower && interval.powerSource === "mains" ? 1 : 0;

      if (
        usableLength >= task.durationMinutes &&
        (rank < bestRank || (rank === bestRank && usableStart < bestStart))
      ) {
        bestRank = rank;
        bestStart = usableStart;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      const rest = nowMin > DAY_START ? " for the rest of today" : "";
      const reason = task.requiresMainsPower
        ? `No powered (mains) slot of this length is free${rest} during the allowed window.`
        : `No free slot of this length is available${rest} during the allowed window.`;
      unplaced.push({ taskId: task.id, title: task.title, reason });
      continue;
    }

    const interval = free[bestIndex];
    const start = bestStart;
    const end = start + task.durationMinutes;

    placed.push({
      taskId: task.id,
      title: task.title,
      startMin: start,
      endMin: end,
      powerSource: interval.powerSource,
    });

    // Split the interval: consume [start, end), keep leftovers on both sides.
    const leftover: FreeInterval[] = [];
    if (interval.startMin < start) {
      leftover.push({
        startMin: interval.startMin,
        endMin: start,
        powerSource: interval.powerSource,
      });
    }
    if (end < interval.endMin) {
      leftover.push({
        startMin: end,
        endMin: interval.endMin,
        powerSource: interval.powerSource,
      });
    }
    free.splice(bestIndex, 1, ...leftover);
  }

  placed.sort((a, b) => a.startMin - b.startMin);
  return { placed, unplaced };
}

/** Utility: format minutes-from-midnight as "H:MM AM/PM" for the UI. */
export function formatClock(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Forgiving clock parser for user-typed times. Returns minutes from
 * midnight, or null if it can't be understood. Accepts: "5", "05",
 * "5:30", "17:45", "5pm", "5:30 pm", "12am". "24:00" is allowed so an
 * outage can run to end of day.
 */
export function parseClock(input: string): number | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(input.trim());
  if (!match) return null;
  let h = Number(match[1]);
  const m = match[2] === undefined ? 0 : Number(match[2]);
  const period = match[3]?.toLowerCase();
  if (m > 59) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (period === "pm" ? 12 : 0);
  }
  if (h > 24 || (h === 24 && m !== 0)) return null;
  return h * 60 + m;
}
