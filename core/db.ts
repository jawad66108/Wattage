/**
 * core/db.web.ts
 *
 * Browser-only stand-in for core/db.ts. Metro picks this file instead of
 * db.ts when bundling for web (the ".web.ts" suffix), so expo-sqlite's
 * wasm setup is never needed. The real Android build still uses SQLite.
 *
 * This exists purely so you can preview and iterate on the UI in a
 * browser. Wattage itself is an Android app, and the submission is the APK.
 * Same exported functions and shapes as db.ts; data lives in localStorage.
 */
import type { OutageWindow, Task } from "./scheduler";

const KEYS = {
  windows: "wattage:outage_windows",
  tasks: "wattage:tasks",
  settings: "wattage:settings",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable: preview only, ignore
  }
}

// ---- Outage windows ---------------------------------------------------

export async function listOutageWindows(): Promise<OutageWindow[]> {
  return read<OutageWindow[]>(KEYS.windows, []).sort(
    (a, b) => a.startMin - b.startMin,
  );
}

export async function saveOutageWindow(window: OutageWindow): Promise<void> {
  const all = read<OutageWindow[]>(KEYS.windows, []).filter(
    (w) => w.id !== window.id,
  );
  all.push(window);
  write(KEYS.windows, all);
}

export async function deleteOutageWindow(id: string): Promise<void> {
  write(
    KEYS.windows,
    read<OutageWindow[]>(KEYS.windows, []).filter((w) => w.id !== id),
  );
}

// ---- Tasks ------------------------------------------------------------

interface StoredTask extends Task {
  createdAt: number;
  done: boolean;
}

export async function listTasks(opts?: {
  includeDone?: boolean;
}): Promise<Task[]> {
  const all = read<StoredTask[]>(KEYS.tasks, []).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const visible = opts?.includeDone ? all : all.filter((t) => !t.done);
  return visible.map(({ createdAt: _c, done: _d, ...task }) => task);
}

export async function saveTask(task: Task): Promise<void> {
  const all = read<StoredTask[]>(KEYS.tasks, []);
  const existing = all.find((t) => t.id === task.id);
  const next: StoredTask = {
    ...task,
    createdAt: existing?.createdAt ?? Date.now(),
    done: existing?.done ?? false,
  };
  write(KEYS.tasks, [...all.filter((t) => t.id !== task.id), next]);
}

export async function markTaskDone(id: string, done: boolean): Promise<void> {
  write(
    KEYS.tasks,
    read<StoredTask[]>(KEYS.tasks, []).map((t) =>
      t.id === id ? { ...t, done } : t,
    ),
  );
}

export async function deleteTask(id: string): Promise<void> {
  write(
    KEYS.tasks,
    read<StoredTask[]>(KEYS.tasks, []).filter((t) => t.id !== id),
  );
}

// ---- Settings ---------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  return read<Record<string, string>>(KEYS.settings, {})[key] ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  write(KEYS.settings, {
    ...read<Record<string, string>>(KEYS.settings, {}),
    [key]: value,
  });
}
