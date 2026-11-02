import { addDays, formatShort, isoDate, isoWeek, isoWeekYear, pad, startOfDay } from "./dates";
import { buildNoteText, raw, wikilink } from "./notes";
import { safeFileName } from "./logs";

export interface WeekRange {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Sunday, YYYY-MM-DD. */
  end: string;
  /** e.g. 2026-W45 */
  key: string;
  week: number;
  label: string;
}

/** The Monday-to-Sunday week containing d, moved by `offset` weeks. */
export function weekRange(d: Date, offset = 0): WeekRange {
  const day = startOfDay(d);
  const monday = addDays(day, -((day.getDay() + 6) % 7) + offset * 7);
  const sunday = addDays(monday, 6);
  const week = isoWeek(monday);
  return {
    start: isoDate(monday),
    end: isoDate(sunday),
    week,
    key: `${isoWeekYear(monday)}-W${pad(week)}`,
    label: `${formatShort(isoDate(monday))} to ${formatShort(isoDate(sunday))}`,
  };
}

export const inRange = (iso: string | undefined, r: WeekRange): boolean => !!iso && iso >= r.start && iso <= r.end;

export interface ReviewData {
  tasksDone: string[];
  captured: number;
  notesCreated: number;
  words: number;
  logged: { name: string; type: string; rating?: number }[];
  decisions: string[];
  letters: number;
}

export interface ReviewAnswers {
  wentWell: string;
  didnt: string;
  focus: string;
}

export function buildReviewNote(
  range: WeekRange,
  data: ReviewData,
  answers: ReviewAnswers,
  opts: { now: Date; categoryProperty: string; category: string },
): { filename: string; content: string } {
  const byType = new Map<string, number>();
  for (const l of data.logged) byType.set(l.type, (byType.get(l.type) ?? 0) + 1);
  const rated = data.logged.filter((l) => l.rating !== undefined);
  const avg = rated.length ? (rated.reduce((s, l) => s + (l.rating ?? 0), 0) / rated.length).toFixed(1) : null;

  const lines: string[] = ["## The week in numbers", ""];
  lines.push(`- ${data.tasksDone.length} ${data.tasksDone.length === 1 ? "task" : "tasks"} completed`);
  lines.push(`- ${data.captured} ${data.captured === 1 ? "thing" : "things"} captured`);
  lines.push(`- ${data.notesCreated} ${data.notesCreated === 1 ? "note" : "notes"} created`);
  if (data.words) lines.push(`- ${data.words} words written`);
  if (data.logged.length) {
    const parts = [...byType.entries()].map(([t, n]) => `${n} ${t.toLowerCase()}`).join(", ");
    lines.push(`- ${data.logged.length} logged (${parts})${avg ? `, average rating ${avg}` : ""}`);
  }
  if (data.logged.length) {
    lines.push("", "## Logged", "");
    for (const l of data.logged) lines.push(`- ${wikilink(l.name)} (${l.type}${l.rating !== undefined ? `, ${l.rating}/10` : ""})`);
  }
  if (data.tasksDone.length) {
    lines.push("", "## Done", "");
    for (const t of data.tasksDone) lines.push(`- ${t}`);
  }
  if (data.decisions.length) {
    lines.push("", "## Decisions made", "");
    for (const t of data.decisions) lines.push(`- ${wikilink(t)}`);
  }
  const ans = (title: string, text: string) => lines.push("", `## ${title}`, "", text.trim() || "");
  ans("What went well", answers.wentWell);
  ans("What didn't", answers.didnt);
  ans("Focus for next week", answers.focus);

  const content = buildNoteText(
    [
      ["created", raw(`${isoDate(opts.now)}T${pad(opts.now.getHours())}:${pad(opts.now.getMinutes())}:${pad(opts.now.getSeconds())}`)],
      [opts.categoryProperty, [wikilink(opts.category)]],
      ["week", range.key],
      ["start", raw(range.start)],
      ["end", raw(range.end)],
    ],
    lines.join("\n"),
  );
  return { filename: `${safeFileName(`Weekly review ${range.key}`)}.md`, content };
}
