import { isoDate, isoDateTime, pad } from "./dates";

export type FieldKind = "text" | "longtext" | "number" | "rating" | "date" | "choice" | "multi";

export interface LogField {
  key: string;
  label: string;
  kind: FieldKind;
  /** Fixed choices for "choice" fields. */
  options?: string[];
  /** Offer values already used in earlier logs of this type as one-tap chips. */
  suggest?: boolean;
  hint?: string;
  /** Save values as [[links]] (for "multi" and "text"). */
  link?: boolean;
  /** Only show this field once the named field has a value (used for "why"). */
  showIf?: string;
}

export interface LogType {
  id: string;
  label: string;
  /** Lucide icon name. */
  icon: string;
  /** Name of the category note this log belongs to, e.g. "Books" saves category: [[Books]]. */
  category: string;
  nameLabel: string;
  /** "timestamp" adds the date and time after the title you type ("Idea 2026-11-02 1432"). The title is optional. */
  titleMode?: "name" | "timestamp";
  titlePrefix?: string;
  tags?: string[];
  fields: LogField[];
  bodyLabel?: string;
  bodyRequired?: boolean;
}

export type LogValue = string | number | string[] | undefined;
export type LogValues = Record<string, LogValue>;

export interface BuiltNote {
  filename: string;
  content: string;
}

const WHEN: LogField = { key: "date", label: "When", kind: "date" };
const RATING: LogField = { key: "rating", label: "Rating", kind: "rating" };
const WHY: LogField = { key: "why", label: "Why", kind: "text", showIf: "rating", hint: "One line on the score" };
const WITH: LogField = { key: "people", label: "With", kind: "multi", suggest: true, link: true };

export const DEFAULT_LOG_TYPES: LogType[] = [
  {
    id: "book", label: "Book", icon: "book-open", category: "Books", nameLabel: "Title",
    fields: [
      { key: "author", label: "Author", kind: "text", suggest: true },
      { key: "status", label: "Status", kind: "choice", options: ["Want to read", "Reading", "Finished", "Dropped"] },
      RATING, WHY, WHEN,
    ],
    bodyLabel: "Thoughts",
  },
  {
    id: "film", label: "Film", icon: "film", category: "Movies", nameLabel: "Title",
    fields: [
      { key: "director", label: "Director", kind: "text", suggest: true },
      { key: "year", label: "Year", kind: "number" },
      WITH, RATING, WHY, WHEN,
    ],
    bodyLabel: "Thoughts",
  },
  {
    id: "tv", label: "TV", icon: "tv", category: "Shows", nameLabel: "Show",
    fields: [
      { key: "season", label: "Season / episode", kind: "text" },
      { key: "status", label: "Status", kind: "choice", options: ["Watching", "Finished", "Dropped"] },
      WITH, RATING, WHY, WHEN,
    ],
    bodyLabel: "Thoughts",
  },
  {
    id: "music", label: "Music", icon: "music", category: "Albums", nameLabel: "Title",
    fields: [
      { key: "artist", label: "Artist", kind: "text", suggest: true },
      { key: "kind", label: "Kind", kind: "choice", options: ["Album", "Song", "Playlist", "Live"] },
      RATING, WHY, WHEN,
    ],
    bodyLabel: "Thoughts",
  },
  {
    id: "place", label: "Restaurant / bar", icon: "utensils", category: "Places", nameLabel: "Name",
    fields: [
      { key: "kind", label: "Kind", kind: "choice", options: ["Restaurant", "Bar", "Cafe", "Takeaway"], suggest: true },
      { key: "area", label: "Area", kind: "text", suggest: true },
      { key: "cuisine", label: "Cuisine", kind: "text", suggest: true },
      RATING, WHY,
      { key: "cost", label: "Cost", kind: "number" },
      WITH, WHEN,
    ],
    bodyLabel: "What to order next time",
  },
  {
    id: "cooked", label: "Cooked", icon: "cooking-pot", category: "Recipes", nameLabel: "Dish",
    fields: [
      { key: "source", label: "Recipe from", kind: "text", suggest: true, hint: "Book, site or 'made it up'" },
      { key: "servings", label: "Servings", kind: "number" },
      RATING, WHY, WITH, WHEN,
    ],
    bodyLabel: "What I did / what to change",
  },
  {
    id: "drink", label: "Drink made", icon: "wine", category: "Drinks", nameLabel: "Drink",
    fields: [
      { key: "kind", label: "Kind", kind: "choice", options: ["Coffee", "Cocktail", "Tea", "Other"], suggest: true },
      { key: "method", label: "Method", kind: "text", suggest: true, hint: "Hario V60, shaken, ..." },
      RATING, WHY, WHEN,
    ],
    bodyLabel: "Recipe and notes",
  },
  {
    id: "thought", label: "Thought", icon: "message-circle", category: "Journal", nameLabel: "Title",
    titleMode: "timestamp", titlePrefix: "Thought",
    fields: [],
    bodyLabel: "What's on your mind?",
    bodyRequired: true,
  },
];

export const RATING_LABELS: Record<number, string> = {
  1: "Awful", 2: "Poor", 3: "Weak", 4: "Meh", 5: "Okay", 6: "Decent", 7: "Good", 8: "Great", 9: "Excellent", 10: "Perfect",
};

/** Characters Obsidian does not allow in a file name or that would break links. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Quotes a YAML string only when it needs it. */
export function yamlString(s: string): string {
  if (s === "") return '""';
  const risky =
    /^[[{!&*|>%@`'"#?:,-]/.test(s) ||
    /(^\s|\s$)/.test(s) ||
    /:(\s|$)/.test(s) ||
    /\s#/.test(s) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(s) ||
    /^[\d.+-][\d.:+-]*$/.test(s);
  return risky ? JSON.stringify(s) : s;
}

function asLink(v: string): string {
  return `[[${v.replace(/^\[\[|\]\]$/g, "")}]]`;
}

function isEmpty(v: LogValue): boolean {
  return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function scalar(field: LogField, v: string | number): string {
  if (typeof v === "number") return String(v);
  if (field.kind === "date") return v;
  return yamlString(field.link ? asLink(v) : v);
}

export function titleFor(type: LogType, name: string, now: Date): string {
  const base = safeFileName(name);
  if (type.titleMode === "timestamp") {
    // Whatever you type, with the date and time added: "Pour-over ratio 2026-11-02 1432".
    return `${base || type.titlePrefix || type.label} ${isoDate(now)} ${pad(now.getHours())}${pad(now.getMinutes())}`;
  }
  return base || `${type.label} ${isoDate(now)}`;
}

/**
 * Builds the note exactly as it will be saved. The same function drives the live
 * preview and the real save, so what you see is what you get.
 */
export function buildLogNote(
  type: LogType,
  name: string,
  values: LogValues,
  body: string,
  opts: { now: Date; categoryProperty: string },
): BuiltNote {
  const lines: string[] = ["---", `created: ${isoDateTime(opts.now)}`];
  if (type.tags?.length) {
    lines.push("tags:");
    for (const t of type.tags) lines.push(`  - ${yamlString(t)}`);
  }
  lines.push(`${opts.categoryProperty}:`, `  - ${JSON.stringify(asLink(type.category))}`);

  for (const f of type.fields) {
    const v = values[f.key];
    if (isEmpty(v)) continue;
    if (Array.isArray(v)) {
      lines.push(`${f.key}:`);
      for (const item of v) lines.push(`  - ${JSON.stringify(f.link ? asLink(item) : item)}`);
    } else {
      lines.push(`${f.key}: ${scalar(f, v as string | number)}`);
    }
  }
  lines.push("---");
  const trimmed = body.trim();
  const content = lines.join("\n") + "\n" + (trimmed ? `${trimmed}\n` : "");
  return { filename: `${titleFor(type, name, opts.now)}.md`, content };
}

export function parseLogTypes(json: string): { types?: LogType[]; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { error: `Not valid JSON: ${(e as Error).message}` };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { error: "Expected a non-empty list of log types." };
  const ids = new Set<string>();
  for (const [i, t] of raw.entries()) {
    const where = `Log type ${i + 1}`;
    if (!t || typeof t !== "object") return { error: `${where} is not an object.` };
    for (const k of ["id", "label", "category", "nameLabel"]) {
      if (typeof t[k] !== "string" || !t[k]) return { error: `${where} needs a "${k}".` };
    }
    if (ids.has(t.id)) return { error: `Two log types share the id "${t.id}".` };
    ids.add(t.id);
    if (!Array.isArray(t.fields)) return { error: `${where} (${t.id}) needs a "fields" list.` };
    for (const f of t.fields) {
      if (!f || typeof f.key !== "string" || typeof f.label !== "string" || typeof f.kind !== "string") {
        return { error: `A field in "${t.id}" needs key, label and kind.` };
      }
      if (!["text", "longtext", "number", "rating", "date", "choice", "multi"].includes(f.kind)) {
        return { error: `Field "${f.key}" in "${t.id}" has an unknown kind "${f.kind}".` };
      }
    }
  }
  return { types: raw as LogType[] };
}
