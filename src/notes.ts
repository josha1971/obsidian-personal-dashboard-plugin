import { isoDate, isoDateTime } from "./dates";
import { safeFileName, yamlString } from "./logs";

/** A value written as is (for dates, so they are not quoted). */
export interface Raw { raw: string }
export type FmValue = string | number | boolean | string[] | Raw | undefined;

export const raw = (s: string): Raw => ({ raw: s });
export const wikilink = (name: string): string => `[[${name.replace(/^\[\[|\]\]$/g, "")}]]`;

function isRaw(v: FmValue): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Builds a note: frontmatter then body. Empty values are left out. */
export function buildNoteText(entries: [string, FmValue][], body: string): string {
  const lines = ["---"];
  for (const [key, v] of entries) {
    if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) {
      lines.push(`${key}:`);
      for (const item of v) lines.push(`  - ${item.startsWith("[[") ? JSON.stringify(item) : yamlString(item)}`);
    } else if (isRaw(v)) lines.push(v.raw ? `${key}: ${v.raw}` : `${key}:`);
    else if (typeof v === "string") lines.push(`${key}: ${v.startsWith("[[") ? JSON.stringify(v) : yamlString(v)}`);
    else lines.push(`${key}: ${v}`);
  }
  lines.push("---");
  const text = body.trim();
  return lines.join("\n") + "\n" + (text ? text + "\n" : "");
}

export function wordCount(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

/**
 * A new note from Home. The date always goes first, then " - ", then your title:
 * "2026-11-10 - Market sign ideas". The properties match a usual template:
 * created, tags, category (the last two left empty to fill in).
 */
export function buildQuickNote(title: string, body: string, now: Date): { filename: string; content: string } {
  const base = safeFileName(title) || "Note";
  const content = buildNoteText([["created", raw(isoDateTime(now))], ["tags", raw("")], ["category", raw("")]], body);
  return { filename: `${isoDate(now)} - ${base}.md`, content };
}
