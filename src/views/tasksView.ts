import { WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_TASKS } from "../constants";
import { daysBetween, parseISODate, startOfDay } from "../dates";
import { TaskItem, asList, linkTarget } from "../store";
import { renderTaskRow } from "../ui";

type Status = "open" | "done" | "all";
type DueFilter = "any" | "overdue" | "today" | "week" | "none";
type Group = "due" | "note" | "priority";

const PRI_RANK = { high: 0, medium: 1, low: 2 } as const;

export class TasksView extends DashView {
  private tasks: TaskItem[] = [];
  private status: Status = "open";
  private due: DueFilter = "any";
  private priority: "any" | "high" | "medium" | "low" = "any";
  private tag = "";
  private search = "";
  private propKey = "";
  private propVal = "";
  private group: Group = "due";
  private listEl?: HTMLElement;
  private summaryEl?: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
    super(leaf, plugin);
  }
  getViewType() { return VIEW_TASKS; }
  getDisplayText() { return "Tasks"; }
  getIcon() { return "check-square"; }

  /** Lets the Home page open Tasks already filtered. */
  setDue(filter: DueFilter): void {
    this.due = filter;
    void this.refresh();
  }

  protected async render(isCurrent: () => boolean): Promise<void> {
    const tasks = await this.plugin.getTasks();
    if (!isCurrent()) return;
    this.tasks = tasks;
    const el = this.contentEl;
    el.empty();

    this.renderNav(el);
    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: "Every checkbox in your vault" });
    t.createEl("h1", { cls: "pd-title", text: "Tasks" });

    this.renderControls(el);
    this.summaryEl = el.createDiv({ cls: "pd-muted pd-summary" });
    this.listEl = el.createDiv({ cls: "pd-tasklist" });
    this.renderList();
  }

  private renderControls(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "pd-controls" });

    this.segment(bar, "Show", [["open", "Open"], ["done", "Done"], ["all", "All"]], () => this.status, (v) => (this.status = v as Status), "Which tasks to list");
    this.select(bar, "Due", [["any", "Any time"], ["overdue", "Overdue"], ["today", "Today"], ["week", "Next 7 days"], ["none", "No date"]], () => this.due, (v) => (this.due = v as DueFilter), "Filter by due date");
    this.select(bar, "Priority", [["any", "Any"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]], () => this.priority, (v) => (this.priority = v as typeof this.priority), "Filter by priority");

    const tags = [...new Set(this.tasks.flatMap((x) => x.info.tags))].sort();
    if (tags.length) this.select(bar, "Tag", [["", "Any"], ...tags.map((x): [string, string] => [x, `#${x}`])], () => this.tag, (v) => (this.tag = v), "Filter by a tag written in the task");

    // Filter by a property of the note the task lives in.
    const keys = new Set<string>();
    for (const x of this.tasks) for (const k of Object.keys(x.fm ?? {})) if (k !== "position") keys.add(k);
    this.select(bar, "Note property", [["", "None"], ...[...keys].sort().map((k): [string, string] => [k, k])], () => this.propKey, (v) => { this.propKey = v; this.propVal = ""; this.rerenderControls(); }, "Only tasks in notes with this property");
    if (this.propKey) {
      const vals = new Set<string>();
      for (const x of this.tasks) for (const v of asList(x.fm?.[this.propKey])) vals.add(linkTarget(v));
      this.select(bar, "equals", [["", "Any value"], ...[...vals].sort().map((v): [string, string] => [v, v])], () => this.propVal, (v) => (this.propVal = v), "Pick the value to match");
    }

    this.select(bar, "Group by", [["due", "Due date"], ["note", "Note"], ["priority", "Priority"]], () => this.group, (v) => (this.group = v as Group), "How to group the list");

    const search = bar.createEl("input", { type: "text", cls: "pd-input pd-search", attr: { placeholder: "Search tasks" } });
    search.value = this.search;
    search.addEventListener("input", () => { this.search = search.value; this.renderList(); });
  }

  private rerenderControls(): void {
    const bar = this.contentEl.querySelector(".pd-controls");
    if (!bar) return;
    const next = createDiv();
    this.renderControls(next);
    bar.replaceWith(next.firstElementChild!);
    this.renderList();
  }

  private segment(parent: HTMLElement, label: string, opts: [string, string][], get: () => string, set: (v: string) => void, tip: string): void {
    const wrap = parent.createDiv({ cls: "pd-control" });
    wrap.createSpan({ text: label, cls: "pd-control-label" });
    const seg = wrap.createDiv({ cls: "pd-seg" });
    setTooltip(seg, tip, { delay: 300 });
    for (const [v, text] of opts) {
      const b = seg.createEl("button", { text, cls: "pd-seg-btn" });
      b.toggleClass("is-active", get() === v);
      b.addEventListener("click", () => {
        set(v);
        seg.querySelectorAll(".pd-seg-btn").forEach((x, i) => x.toggleClass("is-active", opts[i][0] === v));
        this.renderList();
      });
    }
  }

  private select(parent: HTMLElement, label: string, opts: [string, string][], get: () => string, set: (v: string) => void, tip: string): void {
    const wrap = parent.createDiv({ cls: "pd-control" });
    wrap.createSpan({ text: label, cls: "pd-control-label" });
    const sel = wrap.createEl("select", { cls: "dropdown" });
    setTooltip(sel, tip, { delay: 300 });
    for (const [v, text] of opts) sel.createEl("option", { value: v, text });
    sel.value = get();
    sel.addEventListener("change", () => { set(sel.value); this.renderList(); });
  }

  private filtered(today: Date): TaskItem[] {
    const q = this.search.trim().toLowerCase();
    return this.tasks.filter((x) => {
      const i = x.info;
      if (i.state === "cancelled") return false;
      if (this.status === "open" && i.state !== "open") return false;
      if (this.status === "done" && i.state !== "done") return false;
      if (this.priority !== "any" && i.priority !== this.priority) return false;
      if (this.tag && !i.tags.includes(this.tag)) return false;
      if (this.propKey) {
        const vals = asList(x.fm?.[this.propKey]).map(linkTarget);
        if (!vals.length) return false;
        if (this.propVal && !vals.includes(this.propVal)) return false;
      }
      if (this.due !== "any") {
        const d = i.due ? daysBetween(today, parseISODate(i.due) ?? today) : undefined;
        if (this.due === "none" && d !== undefined) return false;
        if (this.due === "overdue" && !(d !== undefined && d < 0)) return false;
        if (this.due === "today" && d !== 0) return false;
        if (this.due === "week" && !(d !== undefined && d >= 0 && d <= 7)) return false;
      }
      if (q && !(`${i.text} ${x.file.basename}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  private bucket(x: TaskItem, today: Date): string {
    if (this.group === "note") return x.file.basename;
    if (this.group === "priority") return x.info.priority ? x.info.priority[0].toUpperCase() + x.info.priority.slice(1) : "No priority";
    if (!x.info.due) return "No date";
    const d = daysBetween(today, parseISODate(x.info.due) ?? today);
    if (d < 0) return "Overdue";
    if (d === 0) return "Today";
    if (d <= 7) return "Next 7 days";
    return "Later";
  }

  private renderList(): void {
    if (!this.listEl || !this.summaryEl) return;
    const today = startOfDay(new Date());
    const items = this.filtered(today);
    this.summaryEl.setText(`${items.length} ${items.length === 1 ? "task" : "tasks"}`);
    this.listEl.empty();
    if (!items.length) {
      this.listEl.createDiv({ cls: "pd-empty", text: this.tasks.length ? "No tasks match these filters." : "No checkboxes found. Add one to any note with - [ ]." });
      return;
    }

    const order = (x: TaskItem) => [
      x.info.due ?? "9999",
      PRI_RANK[x.info.priority ?? "low"] + (x.info.priority ? 0 : 1),
      x.file.basename,
    ];
    items.sort((a, b) => {
      if (this.status === "done") return (b.info.doneDate ?? "").localeCompare(a.info.doneDate ?? "");
      const [ad, ap, an] = order(a);
      const [bd, bp, bn] = order(b);
      return String(ad).localeCompare(String(bd)) || Number(ap) - Number(bp) || String(an).localeCompare(String(bn)) || a.line - b.line;
    });

    const groups = new Map<string, TaskItem[]>();
    for (const x of items) {
      const k = this.bucket(x, today);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(x);
    }
    const dueOrder = ["Overdue", "Today", "Next 7 days", "Later", "No date"];
    const priOrder = ["High", "Medium", "Low", "No priority"];
    const keys = [...groups.keys()].sort((a, b) => {
      const list = this.group === "due" ? dueOrder : this.group === "priority" ? priOrder : null;
      return list ? list.indexOf(a) - list.indexOf(b) : a.localeCompare(b);
    });
    for (const k of keys) {
      const g = this.listEl.createDiv({ cls: "pd-group" });
      const h = g.createDiv({ cls: "pd-group-head" });
      h.createSpan({ text: k, cls: `pd-group-title${k === "Overdue" ? " is-overdue" : ""}` });
      h.createSpan({ text: String(groups.get(k)!.length), cls: "pd-muted" });
      for (const x of groups.get(k)!) renderTaskRow(g, x, this.plugin, today, this.group !== "note");
    }
  }
}
