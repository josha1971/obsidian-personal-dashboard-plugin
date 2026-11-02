export interface ChooseItem {
  name: string;
  rating?: number;
  /** YYYY-MM-DD of the log. */
  date: string;
  status?: string;
  /** Values of the fields the user can filter by, e.g. { kind: ["Restaurant"], cuisine: ["Italian"] }. */
  facets: Record<string, string[]>;
  path: string;
}

export type Source = "favorites" | "unrated";

export interface ChooseOptions {
  source: Source;
  minRating: number;
  /** Do not suggest something logged more recently than this many days (favorites only). */
  avoidDays: number;
  todayMs: number;
  filterKey?: string;
  filterValue?: string;
  rng: () => number;
  count: number;
}

export interface Suggestion {
  name: string;
  path: string;
  reason: string;
  rating?: number;
}

interface Group { name: string; path: string; ratings: number[]; last: string; statuses: string[]; facets: Record<string, string[]> }

const DONE = ["finished", "dropped", "watched", "read"];

/** Groups repeat logs of the same thing and returns weighted picks. */
export function choose(items: ChooseItem[], o: ChooseOptions): Suggestion[] {
  const groups = new Map<string, Group>();
  for (const it of items) {
    if (o.filterKey && o.filterValue) {
      const vals = (it.facets[o.filterKey] ?? []).map((v) => v.toLowerCase());
      if (!vals.includes(o.filterValue.toLowerCase())) continue;
    }
    const key = it.name.toLowerCase();
    const g = groups.get(key) ?? { name: it.name, path: it.path, ratings: [], last: "", statuses: [], facets: {} };
    if (it.rating !== undefined) g.ratings.push(it.rating);
    if (it.date > g.last) { g.last = it.date; g.path = it.path; }
    if (it.status) g.statuses.push(it.status.toLowerCase());
    g.facets = it.facets;
    groups.set(key, g);
  }

  const dayMs = 86400000;
  const scored: { g: Group; w: number; reason: string; rating?: number }[] = [];
  for (const g of groups.values()) {
    const lastMs = g.last ? new Date(g.last + "T00:00:00").getTime() : 0;
    const ago = lastMs ? Math.floor((o.todayMs - lastMs) / dayMs) : 9999;
    if (o.source === "favorites") {
      if (!g.ratings.length) continue;
      const avg = g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length;
      if (avg < o.minRating || ago < o.avoidDays) continue;
      const w = Math.pow(avg - o.minRating + 1, 2) * (1 + Math.log10(Math.max(1, ago)));
      const times = g.ratings.length > 1 ? ` across ${g.ratings.length} logs` : "";
      scored.push({ g, w, rating: Math.round(avg * 10) / 10, reason: `Rated ${Math.round(avg * 10) / 10}/10${times}, last ${ago < 60 ? `${ago} days ago` : `${Math.round(ago / 30)} months ago`}.` });
    } else {
      if (g.ratings.length) continue;
      if (g.statuses.some((s) => DONE.includes(s))) continue;
      const w = 1 + Math.log10(Math.max(1, ago));
      scored.push({ g, w, reason: `Not rated yet. Saved ${ago < 60 ? `${ago} days ago` : `${Math.round(ago / 30)} months ago`}.` });
    }
  }

  const out: Suggestion[] = [];
  const pool = [...scored];
  while (out.length < o.count && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = o.rng() * total;
    let idx = pool.findIndex((p) => (r -= p.w) < 0);
    if (idx < 0) idx = pool.length - 1;
    const [p] = pool.splice(idx, 1);
    out.push({ name: p.g.name, path: p.g.path, reason: p.reason, rating: p.rating });
  }
  return out;
}
