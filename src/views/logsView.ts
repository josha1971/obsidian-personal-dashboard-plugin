import { WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_LOGS } from "../constants";
import { addDays, friendlyDate, isoDate, startOfDay } from "../dates";
import { LogEntry } from "../store";
import { chip, iconButton, starButton } from "../ui";
import { isFlagged } from "../favorites";

type Range = "30" | "90" | "180" | "365" | "all";
type Sort = "newest" | "oldest" | "rating" | "name";

export class LogsView extends DashView {
  private entries: LogEntry[] = [];
  private typeId = "all";
  private range: Range = "365";
  private sort: Sort = "newest";
  private search = "";
  private listEl?: HTMLElement;
  private summaryEl?: HTMLElement;
  private excerpts = new Map<string, { mtime: number; text: string }>();

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
    super(leaf, plugin);
  }
  getViewType() { return VIEW_LOGS; }
  getDisplayText() { return "Logs"; }
  getIcon() { return "library"; }

  setType(id: string): void {
    this.typeId = id;
    void this.refresh();
  }

  protected async render(isCurrent: () => boolean): Promise<void> {
    this.entries = this.plugin.getLogs();
    if (!isCurrent()) return;
    const el = this.contentEl;
    el.empty();

    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: "Everything you've logged, in one place" });
    t.createEl("h1", { cls: "pd-title", text: "Logs" });
    iconButton(head, "plus", "Log something", () => this.plugin.openLogModal(this.typeId === "all" ? undefined : this.typeId), "mod-cta");

    // Type chips
    const types = el.createDiv({ cls: "pd-chips pd-typefilter" });
    const typeBtn = (id: string, label: string, icon?: string) => {
      const b = types.createEl("button", { cls: "pd-pick" });
      if (icon) setIcon(b.createSpan({ cls: "pd-btn-icon" }), icon);
      b.createSpan({ text: label });
      b.toggleClass("is-active", this.typeId === id);
      b.addEventListener("click", () => {
        this.typeId = id;
        types.querySelectorAll(".pd-pick").forEach((x) => x.removeClass("is-active"));
        b.addClass("is-active");
        this.renderList();
      });
    };
    typeBtn("all", "All kinds");
    for (const ty of this.plugin.settings.logTypes) typeBtn(ty.id, ty.label, ty.icon);

    // Range, sort, search
    const bar = el.createDiv({ cls: "pd-controls" });
    const range = bar.createDiv({ cls: "pd-control" });
    range.createSpan({ text: "Last", cls: "pd-control-label" });
    const seg = range.createDiv({ cls: "pd-seg" });
    const ranges: [Range, string][] = [["30", "1 mo"], ["90", "3 mo"], ["180", "6 mo"], ["365", "12 mo"], ["all", "All"]];
    for (const [v, label] of ranges) {
      const b = seg.createEl("button", { text: label, cls: "pd-seg-btn" });
      b.toggleClass("is-active", this.range === v);
      b.addEventListener("click", () => {
        this.range = v;
        seg.querySelectorAll(".pd-seg-btn").forEach((x, i) => x.toggleClass("is-active", ranges[i][0] === v));
        this.renderList();
      });
    }
    const sortWrap = bar.createDiv({ cls: "pd-control" });
    sortWrap.createSpan({ text: "Sort", cls: "pd-control-label" });
    const sel = sortWrap.createEl("select", { cls: "dropdown" });
    setTooltip(sel, "Order of the list", { delay: 300 });
    for (const [v, label] of [["newest", "Newest first"], ["oldest", "Oldest first"], ["rating", "Highest rated"], ["name", "Name"]]) sel.createEl("option", { value: v, text: label });
    sel.value = this.sort;
    sel.addEventListener("change", () => { this.sort = sel.value as Sort; this.renderList(); });
    const search = bar.createEl("input", { type: "text", cls: "pd-input pd-search", attr: { placeholder: "Search names, details and notes" } });
    search.value = this.search;
    search.addEventListener("input", () => { this.search = search.value; this.renderList(); });

    this.summaryEl = el.createDiv({ cls: "pd-muted pd-summary" });
    this.listEl = el.createDiv({ cls: "pd-loglist" });
    this.renderList();
    void this.preloadExcerpts();
  }

  /** Reads every log note once so searching also finds words inside the notes. */
  private async preloadExcerpts(): Promise<void> {
    let loaded = false;
    for (const e of this.entries) {
      const hit = this.excerpts.get(e.file.path);
      if (hit && hit.mtime === e.file.stat.mtime) continue;
      const raw = await this.plugin.app.vault.cachedRead(e.file);
      this.excerpts.set(e.file.path, { mtime: e.file.stat.mtime, text: raw.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/\s+/g, " ").trim().slice(0, 400) });
      loaded = true;
    }
    if (loaded && this.search.trim() && this.listEl?.isConnected) this.renderList();
  }

  private filtered(): LogEntry[] {
    const q = this.search.trim().toLowerCase();
    const cutoff = this.range === "all" ? null : isoDate(addDays(startOfDay(new Date()), -Number(this.range)));
    return this.entries.filter((e) => {
      if (this.typeId !== "all" && e.type.id !== this.typeId) return false;
      if (cutoff && e.date < cutoff) return false;
      if (q) {
        const cached = this.excerpts.get(e.file.path)?.text ?? "";
        const hay = `${e.file.basename} ${e.detail} ${e.type.label} ${cached}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  private renderList(): void {
    if (!this.listEl || !this.summaryEl) return;
    const items = this.filtered();
    const rated = items.filter((e) => e.rating !== undefined);
    const avg = rated.length ? (rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length).toFixed(1) : null;
    this.summaryEl.setText(`${items.length} ${items.length === 1 ? "log" : "logs"}${avg ? ` · average rating ${avg}` : ""}`);

    const sorters: Record<Sort, (a: LogEntry, b: LogEntry) => number> = {
      newest: (a, b) => b.date.localeCompare(a.date) || b.file.stat.ctime - a.file.stat.ctime,
      oldest: (a, b) => a.date.localeCompare(b.date) || a.file.stat.ctime - b.file.stat.ctime,
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.date.localeCompare(a.date),
      name: (a, b) => a.file.basename.localeCompare(b.file.basename),
    };
    items.sort(sorters[this.sort]);

    const list = this.listEl;
    list.empty();
    if (!items.length) {
      list.createDiv({ cls: "pd-empty", text: this.entries.length ? "Nothing matches these filters." : "No logs yet. Press Log something, or add a category link like category: [[Books]] to a note." });
      return;
    }

    const today = new Date();
    const table = list.createEl("table", { cls: "pd-table" });
    const hr = table.createEl("thead").createEl("tr");
    for (const h of ["When", "Name", "Kind", "Details", "Rating", ""]) hr.createEl("th", { text: h, cls: h === "Details" ? "pd-col-detail" : "" });
    const body = table.createEl("tbody");
    const wantExcerpts: { cell: HTMLElement; e: LogEntry }[] = [];

    for (const e of items.slice(0, 300)) {
      const tr = body.createEl("tr", { cls: "pd-logrow-tr" });
      tr.createEl("td", { text: friendlyDate(e.date, today), cls: "pd-muted pd-nowrap" });
      const name = tr.createEl("td", { cls: "pd-logname" });
      name.createDiv({ text: e.file.basename, cls: "pd-logname-title" });
      const ex = name.createDiv({ cls: "pd-excerpt" });
      wantExcerpts.push({ cell: ex, e });
      const kind = tr.createEl("td");
      chip(kind, e.type.label, "is-type");
      tr.createEl("td", { text: e.detail, cls: "pd-muted pd-col-detail" });
      const rt = tr.createEl("td", { cls: "pd-nowrap" });
      if (e.rating !== undefined) chip(rt, `${e.rating}/10`, "is-rating");
      starButton(tr.createEl("td", { cls: "pd-nowrap" }), e.file, isFlagged(e.fm[this.plugin.settings.favoriteProperty]), this.plugin);
      tr.addEventListener("click", () => void this.plugin.openFile(e.file));
      setTooltip(tr, "Open this note", { delay: 600 });
    }
    if (items.length > 300) list.createDiv({ cls: "pd-muted pd-summary", text: `Showing the first 300. Narrow the filters to see the rest.` });
    void this.fillExcerpts(wantExcerpts);
  }

  /** The first lines of each note, so a thought or a review can be read without opening it. */
  private async fillExcerpts(rows: { cell: HTMLElement; e: LogEntry }[]): Promise<void> {
    let needsRefilter = false;
    for (const { cell, e } of rows) {
      let hit = this.excerpts.get(e.file.path);
      if (!hit || hit.mtime !== e.file.stat.mtime) {
        const raw = await this.plugin.app.vault.cachedRead(e.file);
        const text = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/\s+/g, " ").trim().slice(0, 400);
        hit = { mtime: e.file.stat.mtime, text };
        this.excerpts.set(e.file.path, hit);
        if (this.search.trim()) needsRefilter = true;
      }
      if (cell.isConnected) cell.setText(hit.text.length > 180 ? hit.text.slice(0, 180) + "…" : hit.text);
    }
    if (needsRefilter) this.renderList();
  }
}
