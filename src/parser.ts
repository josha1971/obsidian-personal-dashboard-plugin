import { friendlyDate, isoDate, pad, parseDateToken } from "./dates";

export type Priority = "high" | "medium" | "low";
export type CaptureMode = "auto" | "task" | "note";

export interface ParsedCapture {
  /** The text with the control words (~15m !low @fri) removed. */
  text: string;
  tags: string[];
  due?: string;
  /** Minutes. */
  duration?: number;
  priority?: Priority;
  isTask: boolean;
}

export const PRIORITY_EMOJI: Record<Priority, string> = { high: "⏫", medium: "🔼", low: "🔽" };

const DURATION_RE = /(^|\s)~(\d+h(?:\d+m?)?|\d+m?)(?=\s|$)/gi;
const PRIORITY_RE = /(^|\s)!(high|medium|med|low|h|m|l|1|2|3)(?=\s|$)/gi;
const DATE_RE = /(^|\s)@(\S+)(?=\s|$)/g;
const TAG_RE = /(?:^|\s)#([\p{L}\d_/-]+)/gu;

export function parseDuration(s: string): number | undefined {
  const m = /^(?:(\d+)h)?(\d+)?m?$/i.exec(s.trim());
  if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
  const hours = m[1] ? +m[1] : 0;
  const mins = m[2] ? +m[2] : 0;
  const total = hours * 60 + mins;
  return total > 0 ? total : undefined;
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

function priorityFromWord(w: string): Priority {
  switch (w.toLowerCase()) {
    case "high": case "h": case "1": return "high";
    case "low": case "l": case "3": return "low";
    default: return "medium";
  }
}

/**
 * Reads a one-line capture. No AI, only rules:
 *   ~15m or ~1h30m  duration      !low !med !high (or !1 !2 !3)  priority
 *   @fri @tomorrow @+3d @2026-11-05  due date      #tag  tag (kept in the text)
 * In "note" mode nothing is interpreted. In "auto" mode it becomes a task when
 * any control word is used or it starts with "todo".
 */
export function parseCapture(input: string, today: Date, mode: CaptureMode = "auto"): ParsedCapture {
  let text = input.trim();
  const result: ParsedCapture = { text, tags: [], isTask: mode === "task" };
  if (mode === "note") {
    result.tags = collectTags(text);
    return result;
  }

  text = text.replace(DURATION_RE, (whole, lead: string, v: string) => {
    const d = parseDuration(v);
    if (d === undefined || result.duration !== undefined) return whole;
    result.duration = d;
    return lead;
  });
  text = text.replace(PRIORITY_RE, (whole, lead: string, v: string) => {
    if (result.priority) return whole;
    result.priority = priorityFromWord(v);
    return lead;
  });
  text = text.replace(DATE_RE, (whole, lead: string, v: string) => {
    if (result.due) return whole;
    const d = parseDateToken(v, today);
    if (!d) return whole;
    result.due = d;
    return lead;
  });
  const todo = /^(todo|task)(:|\s)\s*/i.exec(text);
  if (todo) {
    text = text.slice(todo[0].length);
    result.isTask = true;
  }

  result.text = text.replace(/\s+/g, " ").trim();
  result.tags = collectTags(result.text);
  if (result.due || result.duration || result.priority) result.isTask = true;
  return result;
}

function collectTags(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_RE)) if (/\D/.test(m[1])) tags.add(m[1]);
  return [...tags];
}

/** The exact line that is appended to the inbox note. */
export function formatCaptureLine(p: ParsedCapture, now: Date): string {
  if (!p.isTask) return `- ${isoDate(now)} ${pad(now.getHours())}:${pad(now.getMinutes())} ${p.text}`;
  const bits = [`- [ ] ${p.text}`];
  if (p.duration) bits.push(`~${formatDuration(p.duration)}`);
  bits.push(`➕ ${isoDate(now)}`);
  if (p.priority) bits.push(PRIORITY_EMOJI[p.priority]);
  if (p.due) bits.push(`📅 ${p.due}`);
  return bits.join(" ");
}

/** Plain words describing what the parser understood, for the live preview. */
export function describeCapture(p: ParsedCapture, today: Date): string[] {
  const out: string[] = [p.isTask ? "Task" : "Note"];
  if (p.due) out.push(`due ${friendlyDate(p.due, today)}`);
  if (p.duration) out.push(`about ${formatDuration(p.duration)}`);
  if (p.priority) out.push(`${p.priority} priority`);
  for (const t of p.tags) out.push(`#${t}`);
  return out;
}
