export interface DayItem {
  path: string;
  /** Created time, ms. */
  created: number;
  /** Last modified time, ms. */
  modified: number;
}

export interface DayHit {
  path: string;
  year: number;
  kind: "created" | "modified" | "both";
}

/**
 * Files created or last modified on today's month and day in an earlier year.
 * Newest year first.
 */
export function onThisDay(items: DayItem[], today: Date): DayHit[] {
  const month = today.getMonth();
  const day = today.getDate();
  const thisYear = today.getFullYear();
  const hits = new Map<string, DayHit>();
  const add = (path: string, ms: number, kind: "created" | "modified") => {
    const d = new Date(ms);
    if (d.getMonth() !== month || d.getDate() !== day || d.getFullYear() >= thisYear) return;
    const key = `${path}|${d.getFullYear()}`;
    const cur = hits.get(key);
    if (!cur) hits.set(key, { path, year: d.getFullYear(), kind });
    else if (cur.kind !== kind) cur.kind = "both";
  };
  for (const it of items) {
    add(it.path, it.created, "created");
    add(it.path, it.modified, "modified");
  }
  return [...hits.values()].sort((a, b) => b.year - a.year || a.path.localeCompare(b.path));
}
