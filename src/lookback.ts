import { isoDate, isoDateTime } from "./dates";
import { buildNoteText, raw, wikilink } from "./notes";
import { safeFileName } from "./logs";

export const OUTCOMES = ["Right call", "Mixed", "Wrong call", "Too early to say"] as const;
export type Outcome = (typeof OUTCOMES)[number];

interface Opts { now: Date; categoryProperty: string; category: string }

export function buildLetterNote(text: string, deliver: string, opts: Opts, replyTo?: string): { filename: string; content: string } {
  const content = buildNoteText(
    [
      ["created", raw(isoDateTime(opts.now))],
      [opts.categoryProperty, [wikilink(opts.category)]],
      ["deliver", raw(deliver)],
      ["reply-to", replyTo ? wikilink(replyTo) : undefined],
    ],
    text,
  );
  return { filename: `Letter to future me ${isoDate(opts.now)}.md`, content };
}

export interface DecisionInput {
  title: string;
  decision: string;
  why: string;
  expect: string;
  confidence?: number;
  lookback: string;
}

export function buildDecisionNote(d: DecisionInput, opts: Opts): { filename: string; content: string } {
  const parts: string[] = [];
  if (d.decision.trim()) parts.push("## The decision", "", d.decision.trim(), "");
  if (d.why.trim()) parts.push("## Why", "", d.why.trim(), "");
  if (d.expect.trim()) parts.push("## What I expect", "", d.expect.trim(), "");
  const content = buildNoteText(
    [
      ["created", raw(isoDateTime(opts.now))],
      [opts.categoryProperty, [wikilink(opts.category)]],
      ["status", "open"],
      ["decided", raw(isoDate(opts.now))],
      ["lookback", raw(d.lookback)],
      ["confidence", d.confidence],
    ],
    parts.join("\n"),
  );
  return { filename: `${safeFileName(d.title) || `Decision ${isoDate(opts.now)}`}.md`, content };
}

/** The section added to a decision note when you look back on it. */
export function lookBackSection(date: string, outcome: Outcome, text: string): string {
  const body = text.trim();
  return `\n## Looking back (${date})\n\n**${outcome}.**${body ? ` ${body}` : ""}\n`;
}

/** Tallies reviewed decisions by outcome. */
export function tallyOutcomes(outcomes: string[]): { counts: Record<string, number>; reviewed: number; right: number } {
  const counts: Record<string, number> = {};
  for (const o of outcomes) counts[o] = (counts[o] ?? 0) + 1;
  const reviewed = outcomes.length;
  return { counts, reviewed, right: counts["Right call"] ?? 0 };
}
