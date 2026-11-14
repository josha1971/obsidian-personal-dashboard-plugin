import { describe, expect, it } from "vitest";
import { insertCaptureLine, parseCapture, formatCaptureLine, parseDuration, formatDuration } from "../src/parser";
import { parseTaskLine, toggleLine } from "../src/tasks";
import { parseDateToken, isoWeek, friendlyDate } from "../src/dates";
import { isFlagged } from "../src/favorites";
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
  it("adds the date after a typed thought title", () => {
    const thought = DEFAULT_LOG_TYPES.find((t) => t.id === "thought")!;
    expect(buildLogNote(thought, "Pour-over ratio", {}, "idea", { now: today, categoryProperty: "category" }).filename).toBe("Pour-over ratio 2026-11-02 0930.md");
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

describe("insertCaptureLine", () => {
  it("adds to the bottom", () => {
    expect(insertCaptureLine("- a\n", "- new", "bottom")).toBe("- a\n- new\n");
    expect(insertCaptureLine("", "- new", "bottom")).toBe("- new\n");
  });
  it("adds to the top of a plain note", () => {
    expect(insertCaptureLine("- a\n- b\n", "- new", "top")).toBe("- new\n- a\n- b\n");
    expect(insertCaptureLine("", "- new", "top")).toBe("- new\n");
  });
  it("goes below frontmatter and a leading title", () => {
    const data = "---\ntags: x\n---\n# Random notes\n\n- a\n";
    expect(insertCaptureLine(data, "- new", "top")).toBe("---\ntags: x\n---\n# Random notes\n\n- new\n- a\n");
    expect(insertCaptureLine("---\ntags: x\n---\n- a\n", "- new", "top")).toBe("---\ntags: x\n---\n- new\n- a\n");
  });
  it("does not treat a lower heading as the title", () => {
    expect(insertCaptureLine("## Today\n- a\n", "- new", "top")).toBe("- new\n## Today\n- a\n");
  });
});

describe("favorites", () => {
  it("reads yes-like values", () => {
    expect(isFlagged(true)).toBe(true);
    expect(isFlagged("true")).toBe(true);
    expect(isFlagged("Yes")).toBe(true);
    expect(isFlagged(false)).toBe(false);
    expect(isFlagged(undefined)).toBe(false);
    expect(isFlagged("no")).toBe(false);
  });
});

import { buildReviewNote, weekRange } from "../src/review";
describe("review", () => {
  it("finds the Monday to Sunday week", () => {
    expect(weekRange(today)).toMatchObject({ start: "2026-11-02", end: "2026-11-08", key: "2026-W45" });
    expect(weekRange(today, -1)).toMatchObject({ start: "2026-10-26", end: "2026-11-01", key: "2026-W44" });
    expect(weekRange(new Date(2027, 0, 1)).key).toBe("2026-W53");
  });
  it("builds a review note", () => {
    const r = weekRange(today, -1);
    const n = buildReviewNote(
      r,
      { tasksDone: ["call Sam"], captured: 4, notesCreated: 6, words: 0, logged: [{ name: "Pine & Plum", type: "Restaurant / bar", rating: 9 }], decisions: [], letters: 0 },
      { wentWell: "Shipped the stall sign.", didnt: "", focus: "Prices." },
      { now: today, categoryProperty: "category", category: "Reviews" },
    );
    expect(n.filename).toBe("Weekly review 2026-W44.md");
    expect(n.content).toContain('category:\n  - "[[Reviews]]"');
    expect(n.content).toContain("week: 2026-W44");
    expect(n.content).toContain("- [[Pine & Plum]] (Restaurant / bar, 9/10)");
    expect(n.content).toContain("## What went well\n\nShipped the stall sign.");
  });
});

import { addMonths } from "../src/dates";
import { buildDecisionNote, buildLetterNote, lookBackSection, tallyOutcomes } from "../src/lookback";
describe("look back", () => {
  const opts = { now: today, categoryProperty: "category", category: "Letters" };
  it("adds months safely", () => {
    expect(addMonths(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(addMonths(today, 6)).toEqual(new Date(2027, 4, 2));
  });
  it("builds a letter", () => {
    const n = buildLetterNote("Dear future me.", "2027-05-02", opts);
    expect(n.filename).toBe("Letter to future me 2026-11-02.md");
    expect(n.content).toBe('---\ncreated: 2026-11-02T09:30:00\ncategory:\n  - "[[Letters]]"\ndeliver: 2027-05-02\n---\nDear future me.\n');
    expect(buildLetterNote("x", "2027-05-02", opts, "Letter A").content).toContain('reply-to: "[[Letter A]]"');
  });
  it("builds a decision", () => {
    const n = buildDecisionNote({ title: "Raise stall prices by 10%", decision: "Raise them.", why: "Costs went up.", expect: "", confidence: 7, lookback: "2026-12-02" }, { ...opts, category: "Decisions" });
    expect(n.filename).toBe("Raise stall prices by 10%.md");
    expect(n.content).toContain("status: open");
    expect(n.content).toContain("lookback: 2026-12-02");
    expect(n.content).toContain("confidence: 7");
    expect(n.content).toContain("## The decision\n\nRaise them.");
    expect(n.content).not.toContain("What I expect");
  });
  it("writes the look-back section and tallies", () => {
    expect(lookBackSection("2026-12-02", "Right call", "Sales held.")).toBe("\n## Looking back (2026-12-02)\n\n**Right call.** Sales held.\n");
    expect(tallyOutcomes(["Right call", "Right call", "Mixed"])).toEqual({ counts: { "Right call": 2, Mixed: 1 }, reviewed: 3, right: 2 });
  });
});

import { pickGarden } from "../src/garden";
import { choose } from "../src/choose";
describe("garden", () => {
  const cands = Array.from({ length: 20 }, (_, i) => ({ path: `n${i}.md`, mtime: Date.now() - (i < 10 ? 300 : 5) * 86400000, size: 500 }));
  const base = { nowMs: Date.now(), todayIso: "2026-11-02", days: 120, count: 5, seed: "2026-11-02", snoozed: {} };
  it("picks only old notes, the same ones all day", () => {
    const a = pickGarden(cands, base);
    expect(a).toHaveLength(5);
    expect(a.every((c) => Number(c.path.slice(1, -3)) < 10)).toBe(true);
    expect(pickGarden(cands, base).map((c) => c.path)).toEqual(a.map((c) => c.path));
    expect(pickGarden(cands, { ...base, seed: "2026-11-02#1" }).map((c) => c.path)).not.toEqual(a.map((c) => c.path));
  });
  it("respects snoozes and tiny notes", () => {
    const snoozed = { "n0.md": "never", "n1.md": "2026-12-01", "n2.md": "2026-10-01" };
    const got = pickGarden([...cands, { path: "tiny.md", mtime: 0, size: 20 }], { ...base, count: 50, snoozed }).map((c) => c.path);
    expect(got).not.toContain("n0.md");
    expect(got).not.toContain("n1.md");
    expect(got).toContain("n2.md");
    expect(got).not.toContain("tiny.md");
  });
});
describe("choose for me", () => {
  const items = [
    { name: "Pine & Plum", rating: 9, date: "2026-09-01", facets: { cuisine: ["Italian"] }, path: "a.md" },
    { name: "Pine & Plum", rating: 9, date: "2026-10-01", facets: { cuisine: ["Italian"] }, path: "a2.md" },
    { name: "Noodle Bar", rating: 6, date: "2026-08-01", facets: { cuisine: ["Chinese"] }, path: "b.md" },
    { name: "Grill House", rating: 8, date: "2026-11-01", facets: { cuisine: ["Grill"] }, path: "c.md" },
    { name: "Taco Place", rating: 8, date: "2026-06-01", facets: { cuisine: ["Mexican"] }, path: "d.md" },
  ];
  const o = { source: "favorites" as const, minRating: 8, avoidDays: 7, todayMs: new Date(2026, 10, 2).getTime(), rng: () => 0.1, count: 3 };
  it("suggests well-rated places not visited lately, grouping repeats", () => {
    const r = choose(items, o);
    expect(r.map((x) => x.name).sort()).toEqual(["Pine & Plum", "Taco Place"]);
    expect(r.find((x) => x.name === "Pine & Plum")!.reason).toContain("across 2 logs");
  });
  it("filters by a facet", () => {
    expect(choose(items, { ...o, filterKey: "cuisine", filterValue: "mexican" }).map((x) => x.name)).toEqual(["Taco Place"]);
  });
  it("finds unrated things", () => {
    const r = choose([{ name: "Dune", date: "2026-05-01", status: "Want to read", facets: {}, path: "x.md" }, { name: "Emma", rating: 7, date: "2026-01-01", facets: {}, path: "y.md" }, { name: "Ulysses", date: "2026-01-01", status: "Dropped", facets: {}, path: "z.md" }], { ...o, source: "unrated" });
    expect(r.map((x) => x.name)).toEqual(["Dune"]);
  });
});

import { explore, monthKeys } from "../src/explore";
describe("explore", () => {
  const es = [
    { date: "2026-10-03", rating: 9, cost: 40, split: ["Old Town"] },
    { date: "2026-10-20", rating: 7, cost: 20, split: ["Old Town"] },
    { date: "2026-09-05", rating: 6, cost: 30, split: ["Market Street"] },
    { date: "2025-01-05", rating: 1, split: ["Ancient"] },
  ];
  const months = monthKeys(new Date(2026, 10, 2), 3);
  it("builds month keys", () => expect(months).toEqual(["2026-09", "2026-10", "2026-11"]));
  it("aggregates by split and month, ignoring entries outside the months", () => {
    const r = explore(es, months, "rating");
    expect(r.cells["Old Town"]["2026-10"]).toBe(8);
    expect(r.cells["Old Town"]["2026-09"]).toBeNull();
    expect(r.series).not.toContain("Ancient");
    expect(explore(es, months, "spend").cells["Market Street"]["2026-09"]).toBe(30);
    expect(explore(es, months, "count").overall).toBe(3);
  });
  it("ranks by average rating", () => {
    expect(explore(es, months, "count").ranking.map((x) => x.name)).toEqual(["Old Town", "Market Street"]);
  });
});

import { buildQuickNote } from "../src/notes";
describe("quick note", () => {
  const o = { category: "Clipboard", categoryProperty: "category" };
  it("puts the date first, then a dash, then the title", () => {
    expect(buildQuickNote("Idea: pasta?", "Start.", today, o).filename).toBe("2026-11-02 - Idea pasta.md");
    expect(buildQuickNote("", "x", today, o).filename).toBe("2026-11-02 - Note.md");
  });
  it("files it under the clipboard category", () => {
    expect(buildQuickNote("Idea", "Start.", today, o).content).toBe('---\ncreated: 2026-11-02T09:30:00\ntags:\ncategory:\n  - "[[Clipboard]]"\n---\nStart.\n');
  });
});

import { timeAgo } from "../src/dates";
describe("timeAgo", () => {
  const now = new Date(2026, 10, 14, 15, 0);
  it("describes how long ago", () => {
    expect(timeAgo(now.getTime() - 20000, now)).toBe("just now");
    expect(timeAgo(now.getTime() - 5 * 60000, now)).toBe("5 min ago");
    expect(timeAgo(new Date(2026, 10, 14, 12, 0).getTime(), now)).toBe("3 hours ago");
    expect(timeAgo(new Date(2026, 10, 13, 20, 0).getTime(), now)).toBe("Yesterday");
    expect(timeAgo(new Date(2026, 10, 10, 9, 0).getTime(), now)).toBe("4 days ago");
  });
});
