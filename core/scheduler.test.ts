import {
  buildDayTimeline,
  formatClock,
  parseClock,
  mergeOutageWindows,
  scheduleTasks,
  type OutageWindow,
  type Task,
} from "./scheduler";

describe("mergeOutageWindows", () => {
  it("merges overlapping windows", () => {
    const windows: OutageWindow[] = [
      { id: "a", startMin: 60, endMin: 180 },
      { id: "b", startMin: 150, endMin: 200 },
    ];
    expect(mergeOutageWindows(windows)).toEqual([
      { id: "a", startMin: 60, endMin: 200 },
    ]);
  });

  it("merges adjacent (touching) windows", () => {
    const windows: OutageWindow[] = [
      { id: "a", startMin: 60, endMin: 120 },
      { id: "b", startMin: 120, endMin: 180 },
    ];
    expect(mergeOutageWindows(windows)).toEqual([
      { id: "a", startMin: 60, endMin: 180 },
    ]);
  });

  it("leaves non-overlapping windows separate and sorted", () => {
    const windows: OutageWindow[] = [
      { id: "b", startMin: 500, endMin: 540 },
      { id: "a", startMin: 60, endMin: 120 },
    ];
    const result = mergeOutageWindows(windows);
    expect(result.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("drops zero-length or invalid windows", () => {
    const windows: OutageWindow[] = [{ id: "a", startMin: 100, endMin: 100 }];
    expect(mergeOutageWindows(windows)).toEqual([]);
  });
});

describe("buildDayTimeline", () => {
  it("returns a single mains interval when there are no outages", () => {
    expect(buildDayTimeline([])).toEqual([
      { startMin: 0, endMin: 1440, powerSource: "mains" },
    ]);
  });

  it("splits the day around one outage window", () => {
    const timeline = buildDayTimeline([
      { id: "a", startMin: 600, endMin: 660 },
    ]);
    expect(timeline).toEqual([
      { startMin: 0, endMin: 600, powerSource: "mains" },
      { startMin: 600, endMin: 660, powerSource: "battery" },
      { startMin: 660, endMin: 1440, powerSource: "mains" },
    ]);
  });

  it("handles an outage starting exactly at midnight", () => {
    const timeline = buildDayTimeline([{ id: "a", startMin: 0, endMin: 120 }]);
    expect(timeline[0]).toEqual({
      startMin: 0,
      endMin: 120,
      powerSource: "battery",
    });
  });
});

describe("scheduleTasks", () => {
  it("places a mains-only task into a powered interval", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Iron clothes",
        durationMinutes: 30,
        requiresMainsPower: true,
      },
    ];
    const outages: OutageWindow[] = [{ id: "o1", startMin: 0, endMin: 480 }]; // powered from 8am
    const { placed, unplaced } = scheduleTasks(tasks, outages);
    expect(unplaced).toEqual([]);
    expect(placed).toHaveLength(1);
    expect(placed[0].startMin).toBe(480);
    expect(placed[0].powerSource).toBe("mains");
  });

  it("places a battery-capable task even during an outage", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Read on laptop",
        durationMinutes: 60,
        requiresMainsPower: false,
      },
    ];
    const outages: OutageWindow[] = [{ id: "o1", startMin: 0, endMin: 1440 }]; // outage all day
    const { placed, unplaced } = scheduleTasks(tasks, outages);
    expect(unplaced).toEqual([]);
    expect(placed[0].powerSource).toBe("battery");
    expect(placed[0].startMin).toBe(0);
  });

  it("marks a mains-only task unplaceable when power never returns in the allowed window", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Desktop render job",
        durationMinutes: 60,
        requiresMainsPower: true,
        notAfterMin: 480,
      },
    ];
    const outages: OutageWindow[] = [{ id: "o1", startMin: 0, endMin: 1440 }];
    const { placed, unplaced } = scheduleTasks(tasks, outages);
    expect(placed).toEqual([]);
    expect(unplaced).toHaveLength(1);
    expect(unplaced[0].reason).toMatch(/powered/i);
  });

  it("respects priority ordering: lower number goes first when slots are scarce", () => {
    const tasks: Task[] = [
      {
        id: "low",
        title: "Low priority",
        durationMinutes: 60,
        requiresMainsPower: true,
        priority: 5,
      },
      {
        id: "high",
        title: "High priority",
        durationMinutes: 60,
        requiresMainsPower: true,
        priority: 1,
      },
    ];
    // Only one 60-minute mains slot exists in the whole day.
    const outages: OutageWindow[] = [{ id: "o1", startMin: 60, endMin: 1440 }]; // mains only 0-60
    const { placed, unplaced } = scheduleTasks(tasks, outages);
    expect(placed).toHaveLength(1);
    expect(placed[0].taskId).toBe("high");
    expect(unplaced[0].taskId).toBe("low");
  });

  it("splits leftover free time correctly after placing a task in the middle of an interval", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Mid-block task",
        durationMinutes: 30,
        requiresMainsPower: true,
        notBeforeMin: 100,
        notAfterMin: 130,
      },
      {
        id: "t2",
        title: "Early task",
        durationMinutes: 50,
        requiresMainsPower: true,
      },
    ];
    const outages: OutageWindow[] = [];
    const { placed, unplaced } = scheduleTasks(tasks, outages);
    expect(unplaced).toEqual([]);
    // Higher-duration tiebreak with equal default priority: t1 (30) vs t2 (50) -> t2 placed first at time 0
    const t2 = placed.find((p) => p.taskId === "t2")!;
    const t1 = placed.find((p) => p.taskId === "t1")!;
    expect(t2.startMin).toBe(0);
    expect(t1.startMin).toBe(100);
  });

  it("rejects a task whose duration exceeds its own allowed window", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Too long",
        durationMinutes: 120,
        requiresMainsPower: false,
        notBeforeMin: 0,
        notAfterMin: 60,
      },
    ];
    const { placed, unplaced } = scheduleTasks(tasks, []);
    expect(placed).toEqual([]);
    expect(unplaced[0].reason).toMatch(/shorter than the task/i);
  });
});

describe("formatClock", () => {
  it.each([
    [0, "12:00 AM"],
    [60, "1:00 AM"],
    [720, "12:00 PM"],
    [750, "12:30 PM"],
    [1439, "11:59 PM"],
  ])("formats %i minutes as %s", (min, expected) => {
    expect(formatClock(min)).toBe(expected);
  });
});

describe("parseClock", () => {
  it.each([
    ["5", 300],
    ["05", 300],
    ["5:30", 330],
    ["17:45", 1065],
    ["5pm", 1020],
    ["5:30 PM", 1050],
    ["12am", 0],
    ["12pm", 720],
    ["24:00", 1440],
    ["  6 ", 360],
  ])("parses %p as %i minutes", (input, expected) => {
    expect(parseClock(input)).toBe(expected);
  });

  it.each(["", "abc", "25", "24:30", "5:75", "13pm", "0am", "5:3"])(
    "rejects %p",
    (input) => {
      expect(parseClock(input)).toBeNull();
    },
  );
});

describe("scheduleTasks: planning from now", () => {
  it("does not place anything before nowMin", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Study",
        durationMinutes: 60,
        requiresMainsPower: true,
      },
    ];
    const { placed } = scheduleTasks(tasks, [], 900); // 3:00 PM
    expect(placed[0].startMin).toBe(900);
  });

  it("reports 'rest of today' when the day is nearly over", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Study",
        durationMinutes: 120,
        requiresMainsPower: true,
      },
    ];
    const { placed, unplaced } = scheduleTasks(tasks, [], 1380); // 11:00 PM
    expect(placed).toEqual([]);
    expect(unplaced[0].reason).toMatch(/rest of today/i);
  });

  it("still reports a too-short window correctly, independent of nowMin", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Too long",
        durationMinutes: 120,
        requiresMainsPower: false,
        notBeforeMin: 0,
        notAfterMin: 60,
      },
    ];
    const { unplaced } = scheduleTasks(tasks, [], 30);
    expect(unplaced[0].reason).toMatch(/shorter than the task/i);
  });
});

describe("scheduleTasks: battery work prefers outages", () => {
  it("puts a battery-capable task into the outage and leaves mains free", () => {
    const tasks: Task[] = [
      {
        id: "battery",
        title: "Read notes",
        durationMinutes: 60,
        requiresMainsPower: false,
      },
      {
        id: "mains",
        title: "Desktop work",
        durationMinutes: 60,
        requiresMainsPower: true,
      },
    ];
    const outages: OutageWindow[] = [{ id: "o1", startMin: 600, endMin: 720 }]; // 10am-12pm outage
    const { placed, unplaced } = scheduleTasks(tasks, outages);
    expect(unplaced).toEqual([]);
    const battery = placed.find((p) => p.taskId === "battery")!;
    const mains = placed.find((p) => p.taskId === "mains")!;
    expect(battery.powerSource).toBe("battery");
    expect(battery.startMin).toBeGreaterThanOrEqual(600);
    expect(mains.powerSource).toBe("mains");
  });

  it("falls back to mains time when no outage slot fits", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        title: "Long read",
        durationMinutes: 180,
        requiresMainsPower: false,
      },
    ];
    const outages: OutageWindow[] = [{ id: "o1", startMin: 600, endMin: 660 }]; // only 1h outage
    const { placed } = scheduleTasks(tasks, outages);
    expect(placed[0].powerSource).toBe("mains");
  });
});
