import { TFile, WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_SEARCH } from "../constants";
import { InboxItem, TaskItem, readInbox } from "../store";
import { chip, renderTaskRow, sectionCard } from "../ui";
import { startOfDay } from "../dates";

interface NoteHit { file: TFile; line: number; snippet: string; byName: boolean }

type Scope = "all" | "notes" | "tasks" | "inbox";

export class SearchView extends DashView {
  private query = "";
  private where: Scope = "all";
  private resultsEl?: HTMLElement;
  private runId = 0;
  private timer: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_SEARCH; }
  getDisplayText() { return "Search"; }
  getIcon() { return "search"; }

  protected async render(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    this.renderNav(el);
    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: "Notes, inbox lines and tasks together" });
    t.createEl("h1", { cls: "pd-title", text: "Search" });

    const bar = el.createDiv({ cls: "pd-controls" });
    const input = bar.createEl("input", { type: "text", cls: "pd-input pd-bigsearch", attr: { placeholder: "Search everything. Every word must match" } });
    setTooltip(input, "Finds notes by name, properties and text, plus tasks and inbox lines", { delay: 500 });
    input.value = this.query;
    input.addEventListener("input", () => {
      this.query = input.value;
      if (this.timer) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.run(), 250);
    });
    const seg = bar.createDiv({ cls: "pd-seg" });
    const scopes: [Scope, string][] = [["all", "All"], ["notes", "Notes"], ["tasks", "Tasks"], ["inbox", "Inbox"]];
    for (const [v, label] of scopes) {
      const b = seg.createEl("button", { text: label, cls: "pd-seg-btn" });
      b.toggleClass("is-active", this.where === v);
      b.addEventListener("click", () => {
        this.where = v;
        seg.querySelectorAll(".pd-seg-btn").forEach((x, i) => x.toggleClass("is-active", scopes[i][0] === v));
        void this.run();
      });
    }
    this.resultsEl = el.createDiv({ cls: "pd-results" });
    window.setTimeout(() => input.focus(), 30);
    void this.run();
  }

  private async run(): Promise<void> {
    const id = ++this.runId;
    const box = this.resultsEl;
    if (!box) return;
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    box.empty();
    if (!words.length) {
      box.createDiv({ cls: "pd-empty", text: "Type to search. Every word you type has to appear." });
      return;
    }
    const matches = (s: string) => { const l = s.toLowerCase(); return words.every((w) => l.includes(w)); };
    const today = startOfDay(new Date());

    if (this.where === "all" || this.where === "tasks") {
      const tasks: TaskItem[] = (await this.plugin.getTasks()).filter((x) => x.info.state !== "cancelled" && matches(`${x.info.text} ${x.file.basename}`));
      if (id !== this.runId) return;
      if (tasks.length) {
        const c = sectionCard(box, "Tasks", `${tasks.length}`, "pd-tone-red");
        for (const x of tasks.slice(0, 25)) renderTaskRow(c.body, x, this.plugin, today);
      }
    }
    if (this.where === "all" || this.where === "inbox") {
      const inbox: InboxItem[] = (await readInbox(this.app, this.plugin.settings)).filter((i) => matches(i.text));
      if (id !== this.runId) return;
      if (inbox.length) {
        const c = sectionCard(box, "Inbox", `${inbox.length}`, "pd-tone-gold");
        for (const i of inbox.slice(0, 25)) {
          const row = c.body.createDiv({ cls: "pd-logrow" });
          chip(row, i.isTask ? "task" : "note", i.isTask ? "is-task" : "");
          row.createSpan({ text: i.text });
          if (i.added) row.createSpan({ text: i.added, cls: "pd-muted pd-logrow-date" });
          row.addClass("is-clickable");
          row.addEventListener("click", () => void this.plugin.openInbox());
        }
      }
    }
    if (this.where === "all" || this.where === "notes") {
      const c = sectionCard(box, "Notes", "searching...", "pd-tone-green");
      const list = c.body;
      let shown = 0;
      let found = 0;
      const sealed = this.plugin.sealedPaths();
      const files = this.app.vault.getMarkdownFiles().filter((f) => !sealed.has(f.path));
      for (let i = 0; i < files.length && found < 100; i++) {
        if (id !== this.runId) return;
        const f = files[i];
        const fmText = JSON.stringify(this.app.metadataCache.getFileCache(f)?.frontmatter ?? {});
        const head = `${f.basename} ${fmText}`;
        const byName = matches(head);
        let hit: NoteHit | null = byName ? { file: f, line: 0, snippet: "", byName } : null;
        if (!hit || !hit.snippet) {
          const text = await this.app.vault.cachedRead(f);
          if (id !== this.runId) return;
          if (matches(`${head}\n${text}`)) {
            const lines = text.split("\n");
            const ln = lines.findIndex((l) => words.some((w) => l.toLowerCase().includes(w)) && !/^---$/.test(l));
            const snippet = ln >= 0 ? lines[ln].trim().slice(0, 160) : "";
            hit = { file: f, line: Math.max(0, ln), snippet, byName };
          }
        }
        if (hit) {
          found++;
          if (shown < 40) { this.renderHit(list, hit); shown++; }
        }
      }
      c.head.querySelector(".pd-card-sub")?.setText(found ? `${found}${found >= 100 ? "+" : ""} ${found === 1 ? "note" : "notes"}` : "no matches");
    }
  }

  private renderHit(parent: HTMLElement, h: NoteHit): void {
    const row = parent.createDiv({ cls: "pd-hit" });
    const name = row.createDiv({ text: h.file.basename, cls: "pd-logname-title is-clickable" });
    name.addEventListener("click", () => void this.plugin.openFile(h.file, h.line || undefined));
    if (h.file.parent && !h.file.parent.isRoot()) row.createDiv({ text: h.file.parent.path, cls: "pd-muted pd-fav-sub" });
    if (h.snippet) row.createDiv({ text: h.snippet, cls: "pd-excerpt" });
  }
}
