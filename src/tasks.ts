import { isoDate } from "./dates";
import { Priority, parseDuration } from "./parser";

export type TaskState = "open" | "done" | "cancelled";

export interface TaskInfo {
  state: TaskState;
  /** Display text with the date/priority/duration markers removed. */
  text: string;
  due?: string;
  scheduled?: string;
  doneDate?: string;
  created?: string;
  priority?: Priority;
  /** Minutes. */
  duration?: number;
  tags: string[];
}

const TASK_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";

function grabDate(body: string, emoji: string): string | undefined {
  return new RegExp(`${emoji}\\s*${DATE}`, "u").exec(body)?.[1];
}

/** Parses a markdown checkbox line, or returns null when the line is not a task. */
export function parseTaskLine(line: string): TaskInfo | null {
  const m = TASK_RE.exec(line.replace(/\r$/, ""));
  if (!m) return null;
  const mark = m[2];
  const body = m[3];
  const state: TaskState = mark === " " || mark === "/" ? "open" : mark === "-" ? "cancelled" : "done";

  let priority: Priority | undefined;
  if (/[🔺⏫]/u.test(body)) priority = "high";
  else if (/🔼/u.test(body)) priority = "medium";
  else if (/[🔽⏬]/u.test(body)) priority = "low";

  const dur = /(^|\s)~(\d+h(?:\d+m?)?|\d+m?)(?=\s|$)/i.exec(body);
  const tags = [...body.matchAll(/(?:^|\s)#([\p{L}\d_/-]+)/gu)].filter((t) => /\D/.test(t[1])).map((t) => t[1]);

  const text = body
    .replace(new RegExp(`[📅⏳🛫✅➕❌]\\s*${DATE}`, "gu"), "")
    .replace(/[🔺⏫🔼🔽⏬]/gu, "")
    .replace(/(^|\s)~(\d+h(?:\d+m?)?|\d+m?)(?=\s|$)/gi, "$1")
    .replace(/\s\^[\w-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    state,
    text,
    due: grabDate(body, "📅"),
    scheduled: grabDate(body, "⏳"),
    doneDate: grabDate(body, "✅"),
    created: grabDate(body, "➕"),
    priority,
    duration: dur ? parseDuration(dur[2]) : undefined,
    tags,
  };
}

/** Flips a task line between open and done, adding or removing the done date. */
export function toggleLine(line: string, today: Date): string {
  const cr = line.endsWith("\r") ? "\r" : "";
  const bare = line.replace(/\r$/, "");
  const m = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\].*)$/.exec(bare);
  if (!m) return line;
  const wasOpen = m[2] === " " || m[2] === "/";
  if (wasOpen) return `${m[1]}x${m[3]} ✅ ${isoDate(today)}${cr}`;
  return `${m[1]} ${m[3].replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/u, "")}${cr}`;
}
