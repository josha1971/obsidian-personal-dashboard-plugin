export type Metric = "count" | "rating" | "spend";

export interface ExploreEntry {
  /** YYYY-MM-DD */
  date: string;
  rating?: number;
  cost?: number;
  /** The values it is split by (a note can have several). Empty means "(none)". */
  split: string[];
}

export interface Ranking { name: string; count: number; avgRating: number | null; spend: number }

export interface Explored {
  months: string[];
  series: string[];
  /** series -> month -> value (null when there is nothing to show) */
  cells: Record<string, Record<string, number | null>>;
  ranking: Ranking[];
  overall: number | null;
}

/** YYYY-MM keys, oldest first, ending at the month of `end`. */
export function monthKeys(end: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function value(es: ExploreEntry[], metric: Metric): number | null {
  if (!es.length) return null;
  if (metric === "count") return es.length;
  if (metric === "spend") {
    const costs = es.filter((e) => e.cost !== undefined);
    return costs.length ? costs.reduce((s, e) => s + (e.cost ?? 0), 0) : null;
  }
  const rated = es.filter((e) => e.rating !== undefined);
  return rated.length ? Math.round((rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length) * 10) / 10 : null;
}

export function explore(entries: ExploreEntry[], months: string[], metric: Metric, maxSeries = 6): Explored {
  const inMonths = entries.filter((e) => months.includes(e.date.slice(0, 7)));
  const bySplit = new Map<string, ExploreEntry[]>();
  for (const e of inMonths) {
    for (const key of e.split.length ? e.split : ["(none)"]) {
      if (!bySplit.has(key)) bySplit.set(key, []);
      bySplit.get(key)!.push(e);
    }
  }
  const ordered = [...bySplit.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const top = ordered.slice(0, maxSeries);
  const rest = ordered.slice(maxSeries).flatMap(([, v]) => v);
  const groups: [string, ExploreEntry[]][] = rest.length ? [...top, ["Other", rest]] : top;

  const cells: Explored["cells"] = {};
  for (const [name, es] of groups) {
    cells[name] = {};
    for (const m of months) cells[name][m] = value(es.filter((e) => e.date.startsWith(m)), metric);
  }
  const ranking: Ranking[] = ordered.map(([name, es]) => {
    const rated = es.filter((e) => e.rating !== undefined);
    return {
      name,
      count: es.length,
      avgRating: rated.length ? Math.round((rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
      spend: es.reduce((s, e) => s + (e.cost ?? 0), 0),
    };
  });
  ranking.sort((a, b) => (b.avgRating ?? -1) - (a.avgRating ?? -1) || b.count - a.count);
  return { months, series: groups.map(([n]) => n), cells, ranking, overall: value(inMonths, metric) };
}
