export type Priority = "high" | "medium" | "low";

/** "1h30m" -> 90, "45" -> 45, "15m" -> 15. Undefined when it is not a duration. */
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

export type CapturePosition = "top" | "bottom";

/**
 * Adds a line to a note's text. "top" puts it first, after any frontmatter
 * and a leading "# Title" heading, so the newest line is the first thing you see.
 */
export function insertCaptureLine(data: string, line: string, position: CapturePosition): string {
  if (!data.trim()) return line + "\n";
  if (position === "bottom") return data.replace(/\n*$/, "\n") + line + "\n";
  const fm = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(data);
  let at = fm ? fm[0].length : 0;
  const h1 = /^(?:[ \t]*\r?\n)*#[ \t]+[^\n]*(?:\r?\n|$)/.exec(data.slice(at));
  if (h1) {
    at += h1[0].length;
    const blank = /^(?:[ \t]*\r?\n)+/.exec(data.slice(at));
    if (blank) at += blank[0].length;
  }
  const head = data.slice(0, at);
  const sep = head && !head.endsWith("\n") ? "\n" : "";
  return head + sep + line + "\n" + data.slice(at);
}
