import { TFile, WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_GARDEN } from "../constants";
import { addDays, daysBetween, isoDate } from "../dates";
import { chip, iconButton, sectionCard } from "../ui";

export function ago(ms: number): string {
  const days = daysBetween(new Date(ms), new Date());
  if (days < 45) return `${days} days ago`;
  if (days < 700) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

export class GardenView extends DashView {
  private shuffle = 0;
  private recall = false;
  private revealed = new Set<string>();

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_GARDEN; }
  getDisplayText() { return "Garden"; }
  getIcon() { return "sprout"; }

  protected async render(isCurrent: () => boolean): Promise<void> {
    const s = this.plugin.settings;
    const { picks, waiting } = this.plugin.gardenToday(s.gardenCount, this.shuffle);
    const excerpts = new Map<string, string>();
    for (const f of picks) {
      const raw = await this.app.vault.cachedRead(f);
      const text = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/^#+\s.*$/m, "").replace(/\s+/g, " ").trim();
      excerpts.set(f.path, text.length > 320 ? text.slice(0, 320) + "..." : text);
    }
    if (!isCurrent()) return;

    const el = this.contentEl;
    el.empty();
    this.renderNav(el);
    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: `${waiting} ${waiting === 1 ? "note" : "notes"} untouched for ${s.gardenDays}+ days` });
    t.createEl("h1", { cls: "pd-title", text: "Garden" });
    const act = head.createDiv({ cls: "pd-actions" });
    const mode = act.createDiv({ cls: "pd-seg" });
    for (const [recall, label, tip] of [[false, "Read", "See a bit of each note"], [true, "Recall", "See only the title first and try to remember what it says"]] as [boolean, string, string][]) {
      const b = mode.createEl("button", { text: label, cls: "pd-seg-btn" });
      b.toggleClass("is-active", this.recall === recall);
      setTooltip(b, tip, { delay: 300 });
      b.addEventListener("click", () => { this.recall = recall; void this.refresh(); });
    }
    const shuf = iconButton(act, "shuffle", "Show others", () => { this.shuffle++; this.revealed.clear(); void this.refresh(); });
    setTooltip(shuf, "Same notes all day, until you shuffle", { delay: 300 });

    if (!picks.length) {
      el.createDiv({ cls: "pd-empty", text: waiting ? "Nothing to show right now." : "Nothing has been left alone for long enough yet. Notes you have not edited for a while will appear here." });
      return;
    }
    const grid = el.createDiv({ cls: "pd-gardengrid" });
    for (const f of picks) this.card(grid, f, excerpts.get(f.path) ?? "");
  }

  private card(parent: HTMLElement, f: TFile, excerpt: string): void {
    const cache = this.app.metadataCache.getFileCache(f);
    const { card, body } = sectionCard(parent, f.basename, "", "pd-gardencard");
    const meta = body.createDiv({ cls: "pd-task-meta" });
    meta.createSpan({ text: `edited ${ago(f.stat.mtime)}`, cls: "pd-muted" });
    if (f.parent && !f.parent.isRoot()) meta.createSpan({ text: f.parent.name, cls: "pd-muted" });
    for (const tag of (cache?.tags ?? []).slice(0, 3)) chip(meta, tag.tag, "is-tag");

    const shown = !this.recall || this.revealed.has(f.path);
    if (shown) body.createDiv({ text: excerpt || "(empty note)", cls: "pd-excerpt pd-gardentext" });
    else {
      body.createDiv({ text: "What do you remember about this one?", cls: "pd-muted pd-gardentext" });
      const r = body.createEl("button", { text: "Reveal", cls: "pd-btn" });
      r.addEventListener("click", () => { this.revealed.add(f.path); void this.refresh(); });
    }
    const row = body.createDiv({ cls: "pd-actions pd-cardactions" });
    iconButton(row, "arrow-right", "Open", () => void this.plugin.openFile(f), "mod-cta");
    const later = row.createEl("button", { text: "Later", cls: "pd-link" });
    setTooltip(later, "Hide for 30 days. Only this plugin's settings change", { delay: 300 });
    later.addEventListener("click", () => void this.plugin.snoozeGarden(f, isoDate(addDays(new Date(), 30))));
    const never = row.createEl("button", { text: "Not for the garden", cls: "pd-link" });
    setTooltip(never, "Never bring this note back. Undo is offered", { delay: 300 });
    never.addEventListener("click", () => void this.plugin.snoozeGarden(f, "never"));
    void card;
  }
}
