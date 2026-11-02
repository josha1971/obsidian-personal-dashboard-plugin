export interface GardenCandidate {
  path: string;
  /** File modified time, ms. */
  mtime: number;
  /** File size in bytes. */
  size: number;
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded random generator, so the same day gives the same notes. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GardenOptions {
  nowMs: number;
  todayIso: string;
  /** Not edited for at least this many days. */
  days: number;
  count: number;
  /** Same seed, same notes. Change it to shuffle. */
  seed: string;
  /** path -> ISO date it comes back, or "never". */
  snoozed: Record<string, string>;
  /** Skip tiny notes. */
  minSize?: number;
}

export function pickGarden(cands: GardenCandidate[], o: GardenOptions): GardenCandidate[] {
  const cutoff = o.nowMs - o.days * 86400000;
  const pool = cands.filter((c) => {
    if (c.mtime > cutoff || c.size < (o.minSize ?? 200)) return false;
    const s = o.snoozed[c.path];
    return !s || (s !== "never" && s <= o.todayIso);
  });
  pool.sort((a, b) => a.path.localeCompare(b.path));
  const rng = mulberry32(hashSeed(o.seed));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, o.count);
}
