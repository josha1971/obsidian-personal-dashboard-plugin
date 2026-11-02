import { TFile, WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_LOOKBACK } from "../constants";
import { daysBetween, friendlyDate, formatShort, isoDate, parseISODate, startOfDay } from "../dates";
import { chip, iconButton, sectionCard } from "../ui";
import { tallyOutcomes } from "../lookback";

export async function letterExcerpt(plugin: DashboardPlugin, file: TFile, max = 420): Promise<string> {
  const text = (await plugin.app.vault.cachedRead(file)).replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "..." : text;
}

export class LookbackView extends DashView {
  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_LOOKBACK; }
  getDisplayText() { return "Look back"; }
  getIcon() { return "history"; }

  protected async render(isCurrent: () => boolean): Promise<void> {
    const today = startOfDay(new Date());
    const todayIso = isoDate(today);
    const letters = this.plugin.getLetters();
    const decisions = this.plugin.getDecisions();
    const arrived = letters.filter((l) => l.deliver <= todayIso);
    const sealed = letters.filter((l) => l.deliver > todayIso);
    const excerpts = new Map<string, string>();
    for (const l of arrived) excerpts.set(l.file.path, await letterExcerpt(this.plugin, l.file));
    if (!isCurrent()) return;

    const el = this.contentEl;
    el.empty();
    this.renderNav(el);
    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: "Letters to future you, and a log of decisions to check later" });
    t.createEl("h1", { cls: "pd-title", text: "Look back" });
    const act = head.createDiv({ cls: "pd-actions" });
    iconButton(act, "mail", "Write to future me", () => this.plugin.openLetterModal());
    iconButton(act, "flag", "Log a decision", () => this.plugin.openDecisionModal());

    const cols = el.createDiv({ cls: "pd-writecols pd-evencols" });
    const left = cols.createDiv({ cls: "pd-writemain" });
    const right = cols.createDiv({ cls: "pd-writeside" });

    // Letters
    const lc = sectionCard(left, "Letters", letters.length ? `${arrived.length} arrived · ${sealed.length} sealed` : "", "pd-tone-gold");
    if (!letters.length) lc.body.createDiv({ cls: "pd-empty", text: "None yet. Write one and pick the day it should come back." });
    for (const l of arrived.filter((x) => !x.kept)) {
      const box = lc.body.createDiv({ cls: "pd-letter" });
      box.createDiv({ text: `A letter has arrived · written ${friendlyDate(l.written, today)}`, cls: "pd-kicker" });
      box.createDiv({ text: excerpts.get(l.file.path) ?? "", cls: "pd-quote" });
      const row = box.createDiv({ cls: "pd-actions" });
      iconButton(row, "arrow-right", "Read it", () => void this.plugin.openFile(l.file));
      iconButton(row, "reply", "Reply to past me", () => this.plugin.openLetterModal(l.file));
      const keep = row.createEl("button", { text: "Keep", cls: "pd-link" });
      setTooltip(keep, "Hides it from Home. Sets kept: true on that one note, with Undo", { delay: 300 });
      keep.addEventListener("click", () => void this.plugin.keepLetter(l.file));
    }
    for (const l of sealed) {
      const days = daysBetween(today, parseISODate(l.deliver) ?? today);
      const row = lc.body.createDiv({ cls: "pd-logrow" });
      chip(row, "sealed", "is-type");
      row.createSpan({ text: `Arrives ${formatShort(l.deliver)} ${(parseISODate(l.deliver) ?? today).getFullYear()}`, cls: "pd-logrow-name" });
      row.createSpan({ text: `in ${days} ${days === 1 ? "day" : "days"}`, cls: "pd-muted pd-logrow-date" });
    }
    const kept = arrived.filter((x) => x.kept);
    if (kept.length) {
      lc.body.createDiv({ text: "Kept", cls: "pd-group-title pd-subhead" });
      for (const l of kept) {
        const row = lc.body.createDiv({ cls: "pd-logrow" });
        row.createSpan({ text: l.file.basename, cls: "pd-logrow-name" }).addEventListener("click", () => void this.plugin.openFile(l.file));
        row.createSpan({ text: `arrived ${friendlyDate(l.deliver, today)}`, cls: "pd-muted pd-logrow-date" });
      }
    }

    // Decisions
    const due = decisions.filter((d) => d.status !== "reviewed" && d.lookback && d.lookback <= todayIso);
    const waiting = decisions.filter((d) => d.status !== "reviewed" && !(d.lookback && d.lookback <= todayIso));
    const reviewed = decisions.filter((d) => d.status === "reviewed");
    const tally = tallyOutcomes(reviewed.map((d) => d.outcome ?? "").filter(Boolean));
    const sub = tally.reviewed ? `${tally.right} of ${tally.reviewed} turned out right` : decisions.length ? `${decisions.length}` : "";
    const dc = sectionCard(right, "Decisions", sub, "pd-tone-red");
    if (!decisions.length) dc.body.createDiv({ cls: "pd-empty", text: "None yet. Log a decision and you'll be asked how it went." });

    const decRow = (parent: HTMLElement, d: (typeof decisions)[number], action?: () => void) => {
      const row = parent.createDiv({ cls: "pd-logrow" });
      row.createSpan({ text: d.file.basename, cls: "pd-logrow-name" }).addEventListener("click", () => void this.plugin.openFile(d.file));
      if (d.outcome) chip(row, d.outcome, d.outcome === "Right call" ? "is-type" : d.outcome === "Wrong call" ? "is-overdue" : "");
      if (action) { const b = row.createEl("button", { text: "Look back", cls: "pd-btn mod-cta" }); b.addEventListener("click", action); }
      row.createSpan({ text: d.status === "reviewed" ? `decided ${friendlyDate(d.decided, today)}` : `look back ${friendlyDate(d.lookback, today)}`, cls: "pd-muted pd-logrow-date" });
    };
    if (due.length) { dc.body.createDiv({ text: "Ready to look back on", cls: "pd-group-title pd-subhead" }); for (const d of due) decRow(dc.body, d, () => void this.plugin.openLookBack(d.file)); }
    if (waiting.length) { dc.body.createDiv({ text: "Waiting", cls: "pd-group-title pd-subhead" }); for (const d of waiting) decRow(dc.body, d); }
    if (reviewed.length) { dc.body.createDiv({ text: "Looked back on", cls: "pd-group-title pd-subhead" }); for (const d of reviewed.reverse()) decRow(dc.body, d); }
  }
}
