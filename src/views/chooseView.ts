import { WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_CHOOSE } from "../constants";
import { ChooseItem, Source, choose } from "../choose";
import { asList, linkTarget } from "../store";
import { chip, iconButton } from "../ui";
import type { LogType } from "../logs";

const TITLES: Record<string, string> = {
  place: "Dinner out", cooked: "Cook tonight", film: "Movie night", book: "What to read", drink: "A drink", tv: "What to watch", music: "What to listen to",
};

export class ChooseView extends DashView {
  private typeId = "place";
  private source: Source = "favorites";
  private minRating = 8;
  private filterKey = "";
  private filterValue = "";
  private roll = 0;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_CHOOSE; }
  getDisplayText() { return "Choose for me"; }
  getIcon() { return "dices"; }

  private types(): LogType[] {
    return this.plugin.settings.logTypes.filter((t) => t.titleMode !== "timestamp");
  }

  protected async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    this.renderNav(el);
    const types = this.types();
    if (!types.some((t) => t.id === this.typeId)) this.typeId = types[0]?.id ?? "";
    const type = types.find((t) => t.id === this.typeId);

    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: "Decided from your own ratings" });
    t.createEl("h1", { cls: "pd-title", text: "Choose for me" });

    const picker = el.createDiv({ cls: "pd-chips pd-typefilter" });
    for (const ty of types) {
      const b = picker.createEl("button", { text: TITLES[ty.id] ?? ty.label, cls: "pd-pick" });
      b.toggleClass("is-active", ty.id === this.typeId);
      b.addEventListener("click", () => { this.typeId = ty.id; this.filterKey = ""; this.filterValue = ""; this.roll = 0; void this.refresh(); });
    }
    if (!type) return;

    const items: ChooseItem[] = this.plugin.getLogs().filter((l) => l.type.id === type.id).map((l) => ({
      name: l.file.basename,
      rating: l.rating,
      date: l.date,
      status: typeof l.fm["status"] === "string" ? (l.fm["status"] as string) : undefined,
      path: l.file.path,
      facets: Object.fromEntries(type.fields.filter((f) => ["choice", "text", "multi"].includes(f.kind)).map((f) => [f.key, asList(l.fm[f.key]).map(linkTarget)])),
    }));

    const bar = el.createDiv({ cls: "pd-controls" });
    const src = bar.createDiv({ cls: "pd-control" });
    src.createSpan({ text: "Choose from", cls: "pd-control-label" });
    const seg = src.createDiv({ cls: "pd-seg" });
    for (const [v, label, tip] of [["favorites", "My favorites", "Well-rated things you haven't had lately"], ["unrated", "Not rated yet", "Things saved but not tried, like a book you want to read"]] as [Source, string, string][]) {
      const b = seg.createEl("button", { text: label, cls: "pd-seg-btn" });
      b.toggleClass("is-active", this.source === v);
      setTooltip(b, tip, { delay: 300 });
      b.addEventListener("click", () => { this.source = v; this.roll = 0; void this.refresh(); });
    }
    if (this.source === "favorites") {
      const w = bar.createDiv({ cls: "pd-control" });
      w.createSpan({ text: "Rated at least", cls: "pd-control-label" });
      const sel = w.createEl("select", { cls: "dropdown" });
      for (const n of [5, 6, 7, 8, 9]) sel.createEl("option", { value: String(n), text: `${n}/10` });
      sel.value = String(this.minRating);
      sel.addEventListener("change", () => { this.minRating = Number(sel.value); this.roll = 0; void this.refresh(); });
    }
    const facetFields = type.fields.filter((f) => ["choice", "text", "multi"].includes(f.kind) && f.key !== "why");
    if (facetFields.length) {
      const w = bar.createDiv({ cls: "pd-control" });
      w.createSpan({ text: "Narrow by", cls: "pd-control-label" });
      const k = w.createEl("select", { cls: "dropdown" });
      k.createEl("option", { value: "", text: "Anything" });
      for (const f of facetFields) k.createEl("option", { value: f.key, text: f.label });
      k.value = this.filterKey;
      k.addEventListener("change", () => { this.filterKey = k.value; this.filterValue = ""; void this.refresh(); });
      if (this.filterKey) {
        const values = [...new Set(items.flatMap((i) => i.facets[this.filterKey] ?? []))].sort();
        const v = bar.createDiv({ cls: "pd-control" });
        v.createSpan({ text: "is", cls: "pd-control-label" });
        const vs = v.createEl("select", { cls: "dropdown" });
        vs.createEl("option", { value: "", text: "Any" });
        for (const x of values) vs.createEl("option", { value: x, text: x });
        vs.value = this.filterValue;
        vs.addEventListener("change", () => { this.filterValue = vs.value; void this.refresh(); });
      }
    }

    const results = choose(items, {
      source: this.source, minRating: this.minRating, avoidDays: 14, todayMs: Date.now(),
      filterKey: this.filterKey || undefined, filterValue: this.filterValue || undefined,
      rng: seededRoll(`${type.id}${this.roll}${this.source}${this.filterValue}${new Date().toDateString()}`), count: 3,
    });

    const box = el.createDiv({ cls: "pd-choices" });
    if (!results.length) {
      box.createDiv({ cls: "pd-empty", text: items.length ? "Nothing matches. Try a lower rating or a wider filter." : `No ${type.label.toLowerCase()} logs yet. Log a few, with ratings, and this page can choose from them.` });
      return;
    }
    results.forEach((r, i) => {
      const card = box.createDiv({ cls: `pd-card pd-choice${i === 0 ? " is-top" : ""}` });
      card.createDiv({ cls: "pd-kicker", text: i === 0 ? "How about" : "Or" });
      const name = card.createEl("h3", { text: r.name, cls: "pd-next-title is-clickable" });
      const f = this.app.vault.getFileByPath(r.path);
      if (f) name.addEventListener("click", () => void this.plugin.openFile(f));
      const meta = card.createDiv({ cls: "pd-task-meta" });
      if (r.rating !== undefined) chip(meta, `${r.rating}/10`, "is-rating");
      meta.createSpan({ text: r.reason, cls: "pd-muted" });
    });
    iconButton(el, "dices", "Pick again", () => { this.roll++; void this.refresh(); }, "mod-cta");
  }
}

function seededRoll(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
