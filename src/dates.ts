/** Small local-time date helpers. Everything works in the user's local time zone. */

export const pad = (n: number): string => String(n).padStart(2, "0");

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoDateTime(d: Date): string {
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

/**
 * Turns a short date word into an ISO date, or null if it is not one.
 * today, tomorrow/tmr, a weekday (next one after today), nextweek (next Monday),
 * +3d, +2w, or a full 2026-11-05.
 */
export function parseDateToken(token: string, today: Date): string | null {
  const t = token.toLowerCase();
  if (t === "today" || t === "tod") return isoDate(today);
  if (t === "tomorrow" || t === "tmr" || t === "tom") return isoDate(addDays(today, 1));
  if (t === "nextweek") return isoDate(addDays(today, ((1 - today.getDay() + 7) % 7) || 7));
  if (t in WEEKDAY_ALIASES) {
    return isoDate(addDays(today, ((WEEKDAY_ALIASES[t] - today.getDay() + 7) % 7) || 7));
  }
  const rel = /^\+(\d{1,3})([dw])$/.exec(t);
  if (rel) return isoDate(addDays(today, +rel[1] * (rel[2] === "w" ? 7 : 1)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && parseISODate(t)) return t;
  return null;
}

/** "Today", "Tomorrow", "Fri 6 Nov", or "3 days ago". */
export function friendlyDate(iso: string, today: Date): string {
  const d = parseISODate(iso);
  if (!d) return iso;
  const diff = daysBetween(today, d);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0 && diff > -14) return `${-diff} days ago`;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (diff > 1 && diff < 7) return `${WEEKDAYS[d.getDay()]} ${base}`;
  return d.getFullYear() === today.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** ISO week number, 1 to 53. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** The ISO week-based year (differs from the calendar year around New Year). */
export function isoWeekYear(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return t.getUTCFullYear();
}

export function formatShort(iso: string): string {
  const d = parseISODate(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : iso;
}

/** Adds calendar months, clamping to the end of a shorter month (31 Jan + 1 month = 28 Feb). */
export function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

/** "just now", "5 min ago", "3 hours ago", "Yesterday", "4 days ago", or a date like "12 Mar". */
export function timeAgo(ms: number, now: Date = new Date()): string {
  const mins = Math.floor((now.getTime() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  const days = daysBetween(new Date(ms), now);
  if (days === 0) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  if (days === 1) return "Yesterday";
  return friendlyDate(isoDate(new Date(ms)), now);
}
