import { MarkdownRenderer, TFile, ViewStateResult, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_OVERVIEW } from "../constants";
import { friendlyDate } from "../dates";
import { asList, linkTarget } from "../store";
import { NONE, LibNote, libraryNotes, noteCategory, valuesOf } from "./libraryView";
import { chip, iconButton, sectionCard, starButton } from "../ui";
import { monthKeys } from "../explore";

const SKIP = new Set(["position", "created", "modified", "date", "tags"]);

export class OverviewView extends DashView {
  private path = "";
  private groupKey = "";
  private layout: "list" | "board" = "list";

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_OVERVIEW; }
  getDisplayText() { return "Note overview"; }
  getIcon() { return "layout-list"; }
  protected pageId() { return "library" as const; }

  getState(): Record<string, unknown> { return { path: this.path }; }
  async setState(state: { path?: string }, result: ViewStateResult): Promise<void> {
    if (state?.path && state.path !== this.path) { this.path = state.path; this.groupKey = ""; }
    await super.setState(state, result);
    await this.refresh();
  }

  protected async render(isCurrent: () => boolean): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.path);
    const el = this.contentEl;
    if (!(file instanceof TFile)) { el.empty(); this.renderNav(el); el.createDiv({ cls: "pd-empty", text: "Choose a note in the Library to see it here." }); return; }
    if (this.plugin.sealedPaths().has(file.path)) {
      el.empty();
      this.renderNav(el);
      el.createDiv({ cls: "pd-empty", text: "This is a sealed letter to future you. It can't be opened from the dashboard until its delivery date." });
      return;
    }
    const text = await this.app.vault.cachedRead(file);
    if (!isCurrent()) return;

    const all = libraryNotes(this.plugin);
    const self = all.find((n) => n.file.path === file.path) ?? { file, fm: (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>, date: friendlyDate("", new Date()) };
    const cat = noteCategory(this.plugin, self as LibNote);

    el.empty();
    this.renderNav(el);
    const back = el.createDiv({ cls: "pd-crumbs" });
    const bb = back.createEl("button", { cls: "pd-link" });
    setIcon(bb.createSpan({ cls: "pd-btn-icon" }), "arrow-left");
    bb.createSpan({ text: "Back to Library" });
    bb.addEventListener("click", () => void this.plugin.navigate(this.leaf, "library"));
    back.createSpan({ text: `Library › ${cat ?? "Notes"}`, cls: "pd-muted" });

    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: `${cat ?? "Note"} · ${friendlyDate((self as LibNote).date, new Date())}` });
    t.createEl("h1", { cls: "pd-title", text: file.basename });
    const act = head.createDiv({ cls: "pd-actions" });
    starButton(act, file, this.plugin.isFavorite(file), this.plugin);
    iconButton(act, "arrow-up-right", "Open in Obsidian", () => void this.plugin.openFile(file));

    const cols = el.createDiv({ cls: "pd-writecols" });
    const left = cols.createDiv({ cls: "pd-writemain" });
    const right = cols.createDiv({ cls: "pd-writeside" });

    // The note itself
    const nc = sectionCard(left, "Note", "", "pd-tone-green");
    const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    const md = nc.body.createDiv({ cls: "pd-note-md" });
    await MarkdownRenderer.render(this.app, body.length > 2500 ? body.slice(0, 2500) + "\n\n..." : body || "*Empty note*", md, file.path, this);
    nc.body.createDiv({ text: file.path, cls: "pd-muted pd-excerpt" });

    // Linked notes (backlinks)
    const resolved = this.app.metadataCache.resolvedLinks;
    const linked = all.filter((n) => n.file.path !== file.path && (resolved[n.file.path]?.[file.path] ?? 0) > 0);
    const lc = sectionCard(left, `Linked to ${file.basename}`, `${linked.length} ${linked.length === 1 ? "note" : "notes"}`, "pd-tone-blue");
    if (!linked.length) lc.body.createDiv({ cls: "pd-empty", text: "No other note links here yet." });
    else {
      const keys = [...new Set(linked.flatMap((n) => Object.keys(n.fm)))].filter((k) => k !== "position" && k !== "tags").sort();
      if (!this.groupKey || !keys.includes(this.groupKey)) this.groupKey = ["status", this.plugin.settings.categoryProperty, "type"].find((k) => keys.includes(k)) ?? keys[0] ?? "";
      const bar = lc.body.createDiv({ cls: "pd-controls" });
      const w = bar.createDiv({ cls: "pd-control" });
      w.createSpan({ text: "Group by", cls: "pd-control-label" });
      const sel = w.createEl("select", { cls: "dropdown" });
      for (const k of keys) sel.createEl("option", { value: k, text: k });
      sel.value = this.groupKey;
      sel.addEventListener("change", () => { this.groupKey = sel.value; void this.refresh(); });
      const seg = bar.createDiv({ cls: "pd-seg" });
      for (const [v, label] of [["list", "List"], ["board", "Board"]] as ["list" | "board", string][]) {
        const b = seg.createEl("button", { text: label, cls: "pd-seg-btn" });
        b.toggleClass("is-active", this.layout === v);
        b.addEventListener("click", () => { this.layout = v; void this.refresh(); });
      }
      const groups = new Map<string, LibNote[]>();
      for (const n of linked) for (const v of this.groupKey ? valuesOf(n, this.groupKey) : [NONE]) { if (!groups.has(v)) groups.set(v, []); groups.get(v)!.push(n); }
      const wrap = lc.body.createDiv({ cls: this.layout === "board" ? "pd-board" : "pd-grouped" });
      for (const name of [...groups.keys()].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b)))) {
        const col = wrap.createDiv({ cls: this.layout === "board" ? "pd-boardcol" : "pd-group" });
        const h = col.createDiv({ cls: "pd-group-head" });
        h.createSpan({ text: name, cls: "pd-group-title" });
        h.createSpan({ text: String(groups.get(name)!.length), cls: "pd-muted" });
        for (const n of groups.get(name)!.sort((a, b) => b.date.localeCompare(a.date))) {
          const row = col.createDiv({ cls: "pd-libcard" });
          const title = row.createDiv({ text: n.file.basename, cls: "pd-logname-title is-clickable" });
          title.addEventListener("click", () => void this.plugin.navigate(this.leaf, "overview", { path: n.file.path }));
          const meta = row.createDiv({ cls: "pd-task-meta" });
          const c = noteCategory(this.plugin, n);
          if (c) chip(meta, c, "is-type");
          meta.createSpan({ text: friendlyDate(n.date, new Date()), cls: "pd-muted" });
        }
      }
    }

    // Properties
    const fm = self.fm;
    const keys = Object.keys(fm).filter((k) => k !== "position");
    const pc = sectionCard(right, "Properties", String(keys.length), "pd-tone-green");
    for (const k of keys) {
      const row = pc.body.createDiv({ cls: "pd-prop" });
      row.createSpan({ text: k, cls: "pd-muted pd-prop-key" });
      const vals = row.createDiv({ cls: "pd-task-meta" });
      const list = asList(fm[k]);
      if (!list.length) vals.createSpan({ text: "-", cls: "pd-muted" });
      for (const v of list) {
        const target = linkTarget(v);
        const c = chip(vals, target, String(v).startsWith("[[") ? "is-type is-clickable" : "");
        if (String(v).startsWith("[[")) {
          const f = this.app.metadataCache.getFirstLinkpathDest(target, file.path);
          if (f) c.addEventListener("click", () => void this.plugin.navigate(this.leaf, "overview", { path: f.path }));
        }
      }
    }
    const times = pc.body.createDiv({ cls: "pd-prop" });
    times.createSpan({ text: "Modified", cls: "pd-muted pd-prop-key" });
    times.createSpan({ text: friendlyDate(new Date(file.stat.mtime).toISOString().slice(0, 10), new Date()) });

    // Activity of linked notes by month
    if (linked.length) {
      const ac = sectionCard(right, "Activity", "linked notes by month", "pd-tone-green");
      const months = monthKeys(new Date(), 6);
      const counts = months.map((m) => linked.filter((n) => n.date.startsWith(m)).length);
      const max = Math.max(1, ...counts);
      const chart = ac.body.createDiv({ cls: "pd-chart pd-chart-small" });
      months.forEach((m, i) => {
        const col = chart.createDiv({ cls: "pd-chart-col" });
        const bars = col.createDiv({ cls: "pd-chart-bars" });
        const b = bars.createDiv({ cls: "pd-chart-bar" });
        b.style.height = counts[i] ? `${Math.max(6, (counts[i] / max) * 100)}%` : "0";
        b.style.background = "var(--color-green)";
        if (counts[i]) setTooltip(b, `${counts[i]} in ${m}`, { delay: 100 });
        col.createDiv({ cls: "pd-chart-label", text: new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString(undefined, { month: "short" }) });
      });
    }

    // Shares a property with
    const sc = sectionCard(right, "Shares a property with", "", "pd-tone-gold");
    let any = false;
    for (const k of keys.filter((x) => !SKIP.has(x) && x !== this.plugin.settings.categoryProperty)) {
      const mine = asList(fm[k]).map(linkTarget).filter(Boolean);
      if (!mine.length) continue;
      const others = all.filter((n) => n.file.path !== file.path && asList(n.fm[k]).map(linkTarget).some((v) => mine.includes(v)));
      if (!others.length) continue;
      any = true;
      const blk = sc.body.createDiv({ cls: "pd-share" });
      const hd = blk.createDiv({ cls: "pd-task-meta" });
      hd.createSpan({ text: k, cls: "pd-muted" });
      for (const v of mine.slice(0, 3)) chip(hd, v);
      const names = blk.createDiv({ cls: "pd-share-names" });
      others.slice(0, 6).forEach((n, i) => {
        if (i) names.appendText(", ");
        const a = names.createSpan({ text: n.file.basename, cls: "is-clickable" });
        a.addEventListener("click", () => void this.plugin.navigate(this.leaf, "overview", { path: n.file.path }));
      });
      if (others.length > 6) names.appendText(` and ${others.length - 6} more`);
    }
    if (!any) sc.body.createDiv({ cls: "pd-empty", text: "No other note shares a property value with this one." });
  }
}
