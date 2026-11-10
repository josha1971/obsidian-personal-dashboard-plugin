import { Notice, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_LIBRARY } from "../constants";
import { addDays, friendlyDate, isoDate, parseISODate, startOfDay, MONTHS } from "../dates";
import { asList, isExcluded, linkTarget, noteDate } from "../store";
import { chip, undoNotice } from "../ui";

type Layout = "list" | "board" | "calendar";
type Fm = Record<string, unknown>;
export interface LibNote { file: TFile; fm: Fm; date: string }

export interface LibraryState {
  category: string;
  groupKey: string;
  dateKey: string;
  layout: Layout;
  search: string;
  monthOffset: number;
}

export const NONE = "No value";

export function libraryNotes(plugin: DashboardPlugin): LibNote[] {
  const app = plugin.app;
  const out: LibNote[] = [];
  const sealed = plugin.sealedPaths();
  for (const file of app.vault.getMarkdownFiles()) {
    if (isExcluded(file, plugin.settings) || file.path === plugin.settings.inboxPath || sealed.has(file.path)) continue;
    const fm = (app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Fm;
    out.push({ file, fm, date: noteDate(fm, file) });
  }
  return out;
}

export function valuesOf(n: LibNote, key: string): string[] {
  const v = asList(n.fm[key]).map(linkTarget).filter(Boolean);
  return v.length ? v : [NONE];
}

export function noteCategory(plugin: DashboardPlugin, n: LibNote): string | undefined {
  return [...asList(n.fm[plugin.settings.categoryProperty]), ...asList(n.fm["categories"])].map(linkTarget).find(Boolean);
}

export class LibraryView extends DashView {
  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_LIBRARY; }
  getDisplayText() { return "Library"; }
  getIcon() { return "library"; }

  private get st(): LibraryState { return this.plugin.libraryState; }

  protected async render(): Promise<void> {
    const all = libraryNotes(this.plugin);
    const st = this.st;
    const keys = [...new Set(all.flatMap((n) => Object.keys(n.fm)))].filter((k) => k !== "position").sort();
    const cats = new Map<string, number>();
    for (const n of all) { const c = noteCategory(this.plugin, n); if (c) cats.set(c, (cats.get(c) ?? 0) + 1); }
    if (!st.groupKey || !keys.includes(st.groupKey)) st.groupKey = [this.plugin.settings.categoryProperty, "category", "type", "status"].find((k) => keys.includes(k)) ?? keys[0] ?? "";
    const dateKeys = keys.filter((k) => all.some((n) => parseISODate(String(n.fm[k] ?? "")) !== null));
    if (!st.dateKey || !dateKeys.includes(st.dateKey)) st.dateKey = dateKeys.includes("date") ? "date" : dateKeys.includes("created") ? "created" : dateKeys[0] ?? "";

    const q = st.search.trim().toLowerCase();
    const notes = all.filter((n) => (!st.category || noteCategory(this.plugin, n) === st.category) && (!q || n.file.basename.toLowerCase().includes(q)));

    const el = this.contentEl;
    el.empty();
    this.renderNav(el);
    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: `${notes.length} ${notes.length === 1 ? "note" : "notes"}` });
    t.createEl("h1", { cls: "pd-title", text: "Library" });

    const bar = el.createDiv({ cls: "pd-controls" });
    const ctl = (label: string, build: (w: HTMLElement) => void) => { const w = bar.createDiv({ cls: "pd-control" }); w.createSpan({ text: label, cls: "pd-control-label" }); build(w); };
    ctl("Layout", (w) => {
      const seg = w.createDiv({ cls: "pd-seg" });
      for (const [v, label, icon] of [["list", "List", "list"], ["board", "Board", "layout-grid"], ["calendar", "Calendar", "calendar"]] as [Layout, string, string][]) {
        const b = seg.createEl("button", { cls: "pd-seg-btn" });
        setIcon(b.createSpan({ cls: "pd-btn-icon" }), icon);
        b.createSpan({ text: label });
        b.toggleClass("is-active", st.layout === v);
        b.addEventListener("click", () => { st.layout = v; this.plugin.persistLibrary(); void this.refresh(); });
      }
    });
    ctl("Category", (w) => {
      const sel = w.createEl("select", { cls: "dropdown" });
      sel.createEl("option", { value: "", text: "All notes" });
      for (const [c, n] of [...cats.entries()].sort()) sel.createEl("option", { value: c, text: `${c} (${n})` });
      sel.value = st.category;
      sel.addEventListener("change", () => { st.category = sel.value; this.plugin.persistLibrary(); void this.refresh(); });
    });
    if (st.layout !== "calendar") {
      ctl("Group by", (w) => {
        const sel = w.createEl("select", { cls: "dropdown" });
        setTooltip(sel, "Any property in your vault", { delay: 300 });
        for (const k of keys) sel.createEl("option", { value: k, text: k });
        sel.value = st.groupKey;
        sel.addEventListener("change", () => { st.groupKey = sel.value; this.plugin.persistLibrary(); void this.refresh(); });
      });
    } else {
      ctl("Date property", (w) => {
        const sel = w.createEl("select", { cls: "dropdown" });
        for (const k of dateKeys) sel.createEl("option", { value: k, text: k });
        sel.value = st.dateKey;
        sel.addEventListener("change", () => { st.dateKey = sel.value; this.plugin.persistLibrary(); void this.refresh(); });
      });
    }
    const search = bar.createEl("input", { type: "text", cls: "pd-input pd-search", attr: { placeholder: "Filter by name" } });
    search.value = st.search;
    search.addEventListener("input", () => { st.search = search.value; window.clearTimeout(this.typing); this.typing = window.setTimeout(() => void this.refresh(), 250); });

    const body = el.createDiv({ cls: "pd-library" });
    if (!notes.length) { body.createDiv({ cls: "pd-empty", text: "No notes match." }); return; }
    if (st.layout === "calendar") this.calendar(body, notes);
    else this.groups(body, notes, all, st.layout === "board");
  }

  private typing = 0;

  private openOverview(f: TFile): void {
    void this.plugin.navigate(this.leaf, "overview", { path: f.path });
  }

  private card(parent: HTMLElement, n: LibNote, draggable: boolean): HTMLElement {
    const c = parent.createDiv({ cls: "pd-libcard" });
    const title = c.createDiv({ text: n.file.basename, cls: "pd-logname-title is-clickable" });
    title.addEventListener("click", () => this.openOverview(n.file));
    setTooltip(title, "See this note with everything linked to it", { delay: 400 });
    const meta = c.createDiv({ cls: "pd-task-meta" });
    const cat = noteCategory(this.plugin, n);
    if (cat && cat !== this.st.category) chip(meta, cat, "is-type");
    meta.createSpan({ text: friendlyDate(n.date, new Date()), cls: "pd-muted" });
    const open = meta.createEl("button", { cls: "pd-star", attr: { "aria-label": "Open in Obsidian" } });
    setIcon(open, "arrow-up-right");
    open.addEventListener("click", (e) => { e.stopPropagation(); void this.plugin.openFile(n.file); });
    if (draggable) {
      c.draggable = true;
      c.addEventListener("dragstart", (e) => { e.dataTransfer?.setData("text/plain", n.file.path); c.addClass("is-dragging"); });
      c.addEventListener("dragend", () => c.removeClass("is-dragging"));
    }
    return c;
  }

  private groups(parent: HTMLElement, notes: LibNote[], all: LibNote[], board: boolean): void {
    const key = this.st.groupKey;
    const groups = new Map<string, LibNote[]>();
    for (const n of notes) for (const v of valuesOf(n, key)) { if (!groups.has(v)) groups.set(v, []); groups.get(v)!.push(n); }
    const names = [...groups.keys()].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)));
    const wrap = parent.createDiv({ cls: board ? "pd-board" : "pd-grouped" });
    for (const name of names) {
      const col = wrap.createDiv({ cls: board ? "pd-boardcol" : "pd-group" });
      const h = col.createDiv({ cls: "pd-group-head" });
      h.createSpan({ text: name, cls: "pd-group-title" });
      h.createSpan({ text: String(groups.get(name)!.length), cls: "pd-muted" });
      const list = col.createDiv({ cls: "pd-boardlist" });
      for (const n of groups.get(name)!.sort((a, b) => b.date.localeCompare(a.date))) this.card(list, n, board);
      if (board) {
        col.addEventListener("dragover", (e) => { e.preventDefault(); col.addClass("is-over"); });
        col.addEventListener("dragleave", () => col.removeClass("is-over"));
        col.addEventListener("drop", (e) => {
          e.preventDefault();
          col.removeClass("is-over");
          const path = e.dataTransfer?.getData("text/plain");
          const note = all.find((x) => x.file.path === path);
          if (note) void this.move(note, key, name, all);
        });
      }
    }
  }

  /** Dragging a card sets one property on that one note. Undo puts it back. */
  private async move(n: LibNote, key: string, to: string, all: LibNote[]): Promise<void> {
    const old = n.fm[key];
    if (Array.isArray(old) && old.length > 1) { new Notice("This note has several values for that property. Change it in the note itself."); return; }
    if (valuesOf(n, key).includes(to)) return;
    const sample = all.map((x) => x.fm[key]).flat().find((v) => v !== undefined && v !== null && v !== "");
    const link = String(Array.isArray(old) ? old[0] ?? "" : old ?? sample ?? "").startsWith("[[");
    const value = link ? `[[${to}]]` : to;
    const next = Array.isArray(old) ? [value] : value;
    await this.app.fileManager.processFrontMatter(n.file, (fm) => { if (to === NONE) delete fm[key]; else fm[key] = next; });
    undoNotice(`Moved ${n.file.basename} to ${to}.`, async () => {
      await this.app.fileManager.processFrontMatter(n.file, (fm) => { if (old === undefined) delete fm[key]; else fm[key] = old; });
    });
  }

  private calendar(parent: HTMLElement, notes: LibNote[]): void {
    const st = this.st;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() + st.monthOffset, 1);
    const bar = parent.createDiv({ cls: "pd-actions pd-calbar" });
    const prev = bar.createEl("button", { text: "<", cls: "pd-btn" });
    const label = bar.createSpan({ text: `${MONTHS[first.getMonth()]} ${first.getFullYear()}`, cls: "pd-group-title" });
    const next = bar.createEl("button", { text: ">", cls: "pd-btn" });
    const today = bar.createEl("button", { text: "Today", cls: "pd-link" });
    prev.addEventListener("click", () => { st.monthOffset--; void this.refresh(); });
    next.addEventListener("click", () => { st.monthOffset++; void this.refresh(); });
    today.addEventListener("click", () => { st.monthOffset = 0; void this.refresh(); });
    void label;

    const byDay = new Map<string, LibNote[]>();
    for (const n of notes) {
      const raw = st.dateKey ? String(n.fm[st.dateKey] ?? "") : "";
      const d = parseISODate(raw) ? raw.slice(0, 10) : n.date;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(n);
    }
    const grid = parent.createDiv({ cls: "pd-cal" });
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) grid.createDiv({ text: d, cls: "pd-cal-dow" });
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const todayIso = isoDate(startOfDay(now));
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i);
      if (i >= 35 && day.getMonth() !== first.getMonth()) break;
      const iso = isoDate(day);
      const cell = grid.createDiv({ cls: "pd-cal-cell" });
      if (day.getMonth() !== first.getMonth()) cell.addClass("is-other");
      if (iso === todayIso) cell.addClass("is-today");
      cell.createDiv({ text: String(day.getDate()), cls: "pd-cal-num" });
      const list = byDay.get(iso) ?? [];
      for (const n of list.slice(0, 3)) {
        const item = cell.createDiv({ text: n.file.basename, cls: "pd-cal-item is-clickable" });
        item.addEventListener("click", () => this.openOverview(n.file));
        setTooltip(item, n.file.basename, { delay: 300 });
      }
      if (list.length > 3) cell.createDiv({ text: `+${list.length - 3} more`, cls: "pd-muted pd-cal-more" });
    }
  }
}
