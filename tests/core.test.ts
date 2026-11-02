import { describe, expect, it } from "vitest";
import { parseCapture, formatCaptureLine, parseDuration, formatDuration } from "../src/parser";
import { parseTaskLine, toggleLine } from "../src/tasks";
import { parseDateToken, isoWeek, friendlyDate } from "../src/dates";
import { DEFAULT_LOG_TYPES, buildLogNote, parseLogTypes, yamlString } from "../src/logs";

// Monday 2 November 2026
const today = new Date(2026, 10, 2, 9, 30);

describe("dates", () => {
  it("parses date words", () => {
    expect(parseDateToken("tomorrow", today)).toBe("2026-11-03");
    expect(parseDateToken("fri", today)).toBe("2026-11-06");
    expect(parseDateToken("mon", today)).toBe("2026-11-09");
    expect(parseDateToken("nextweek", today)).toBe("2026-11-09");
    expect(parseDateToken("+2w", today)).toBe("2026-11-16");
    expect(parseDateToken("2026-12-25", today)).toBe("2026-12-25");
    expect(parseDateToken("banana", today)).toBeNull();
  });
  it("computes week and friendly names", () => {
    expect(isoWeek(today)).toBe(45);
    expect(friendlyDate("2026-11-06", today)).toBe("Fri 6 Nov");
    expect(friendlyDate("2026-10-30", today)).toBe("3 days ago");
  });
});

describe("capture parser", () => {
  it("reads the example from the brief", () => {
    const p = parseCapture("call Sam ~15m !low @fri", today);
    expect(p).toMatchObject({ text: "call Sam", duration: 15, priority: "low", due: "2026-11-06", isTask: true });
  });
  it("treats plain text as a note", () => {
    const p = parseCapture("what if the stall sold jam too #idea", today);
    expect(p.isTask).toBe(false);
    expect(p.tags).toEqual(["idea"]);
    expect(formatCaptureLine(p, today)).toBe("- 2026-11-02 09:30 what if the stall sold jam too #idea");
  });
  it("handles durations", () => {
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("45")).toBe(45);
    expect(formatDuration(90)).toBe("1h30m");
  });
  it("leaves unknown @words alone", () => {
    const p = parseCapture("email @work team", today);
    expect(p.text).toBe("email @work team");
    expect(p.isTask).toBe(false);
  });
  it("task mode forces a task and note mode ignores markers", () => {
    expect(parseCapture("buy milk", today, "task").isTask).toBe(true);
    expect(parseCapture("call Sam ~15m", today, "note").text).toBe("call Sam ~15m");
  });
  it("formats a task line that parses back", () => {
    const line = formatCaptureLine(parseCapture("call Sam ~15m !low @fri", today), today);
    expect(line).toBe("- [ ] call Sam ~15m ➕ 2026-11-02 🔽 📅 2026-11-06");
    expect(parseTaskLine(line)).toMatchObject({ text: "call Sam", duration: 15, priority: "low", due: "2026-11-06", state: "open" });
  });
});

describe("tasks", () => {
  it("parses states and ignores non-tasks", () => {
    expect(parseTaskLine("- [x] done thing ✅ 2026-11-01")?.state).toBe("done");
    expect(parseTaskLine("  * [ ] nested #home")?.tags).toEqual(["home"]);
    expect(parseTaskLine("- not a task")).toBeNull();
  });
  it("toggles both ways", () => {
    const done = toggleLine("- [ ] a thing 📅 2026-11-05", today);
    expect(done).toBe("- [x] a thing 📅 2026-11-05 ✅ 2026-11-02");
    expect(toggleLine(done, today)).toBe("- [ ] a thing 📅 2026-11-05");
    expect(toggleLine("- [ ] crlf\r", today)).toBe("- [x] crlf ✅ 2026-11-02\r");
  });
});

describe("log notes", () => {
  const place = DEFAULT_LOG_TYPES.find((t) => t.id === "place")!;
  it("builds frontmatter in a stable order", () => {
    const n = buildLogNote(place, "Pine & Plum", { kind: "Restaurant", area: "Old Town", rating: 9, why: "Handmade pasta: the best", cost: 48, people: ["Ines"], date: "2026-11-02" }, "Order the gnocchi.", { now: today, categoryProperty: "category" });
    expect(n.filename).toBe("Pine & Plum.md");
    expect(n.content).toBe(
      [
        "---", "created: 2026-11-02T09:30:00", "category:", '  - "[[Places]]"',
        "kind: Restaurant", "area: Old Town", "rating: 9", 'why: "Handmade pasta: the best"', "cost: 48",
        "people:", '  - "[[Ines]]"', "date: 2026-11-02", "---", "Order the gnocchi.", "",
      ].join("\n"),
    );
  });
  it("titles thoughts by timestamp", () => {
    const thought = DEFAULT_LOG_TYPES.find((t) => t.id === "thought")!;
    expect(buildLogNote(thought, "", {}, "idea", { now: today, categoryProperty: "category" }).filename).toBe("Thought 2026-11-02 0930.md");
  });
  it("sanitises names and quotes risky yaml", () => {
    expect(buildLogNote(place, "A/B: C?", {}, "", { now: today, categoryProperty: "category" }).filename).toBe("A B C.md");
    expect(yamlString("2026")).toBe('"2026"');
    expect(yamlString("plain")).toBe("plain");
  });
  it("validates user log types", () => {
    expect(parseLogTypes(JSON.stringify(DEFAULT_LOG_TYPES)).types).toHaveLength(DEFAULT_LOG_TYPES.length);
    expect(parseLogTypes("[]").error).toBeTruthy();
    expect(parseLogTypes("nope").error).toMatch(/JSON/);
  });
});
