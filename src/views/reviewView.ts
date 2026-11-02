import { WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_REVIEW } from "../constants";
import { friendlyDate } from "../dates";
import { ReviewAnswers, ReviewData, WeekRange, buildReviewNote, inRange, weekRange } from "../review";
import { notesInCategory, readInbox, noteDate } from "../store";
import { chip, iconButton, sectionCard } from "../ui";

export class ReviewView extends DashView {
  private offset = 0;
  private answers: ReviewAnswers = { wentWell: "", didnt: "", focus: "" };
  private data: ReviewData | null = null;
  private range: WeekRange = weekRange(new Date());

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_REVIEW; }
  getDisplayText() { return "Review"; }
  getIcon() { return "calendar-check"; }

  private async gather(r: WeekRange): Promise<ReviewData> {
    const s = this.plugin.settings;
    const logs = this.plugin.getLogs().filter((l) => inRange(l.date, r)).sort((a, b) => a.date.localeCompare(b.date));
    const tasks = (await this.plugin.getTasks()).filter((t) => t.info.state === "done" && inRange(t.info.doneDate, r));
    const inbox = await readInbox(this.app, s);
    const captured = inbox.filter((i) => inRange(i.added, r)).length;
    // Items already moved out of the inbox still count when they are tasks that were created this week.
    const createdTasks = (await this.plugin.getTasks()).filter((t) => inRange(t.info.created, r) && t.file.path !== this.plugin.settings.inboxPath).length;
    let notesCreated = 0;
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (inRange(noteDate({ created: fm?.["created"] }, f), r) && !f.path.startsWith(s.inboxPath)) notesCreated++;
    }
    const words = notesInCategory(this.app, s, s.writeCategory).filter((n) => inRange(n.date, r)).reduce((a, n) => a + (typeof n.fm["words"] === "number" ? (n.fm["words"] as number) : 0), 0);
    const decisions = notesInCategory(this.app, s, s.decisionCategory).filter((n) => inRange(noteDate({ created: n.fm["decided"] ?? n.fm["created"] }, n.file), r)).map((n) => n.file.basename);
    const letters = notesInCategory(this.app, s, s.letterCategory).filter((n) => inRange(noteDate({ created: n.fm["created"] }, n.file), r)).length;
    return {
      tasksDone: tasks.map((t) => t.info.text),
      captured: captured + createdTasks,
      notesCreated,
      words,
      logged: logs.map((l) => ({ name: l.file.basename, type: l.type.label, rating: l.rating })),
      decisions,
      letters,
    };
  }

  protected async render(isCurrent: () => boolean): Promise<void> {
    const range = weekRange(new Date(), this.offset);
    const data = await this.gather(range);
    if (!isCurrent()) return;
    this.range = range;
    this.data = data;
    const s = this.plugin.settings;
    const el = this.contentEl;
    el.empty();
    this.renderNav(el);

    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: `Week ${range.week} · ${range.label}` });
    t.createEl("h1", { cls: "pd-title", text: this.offset === 0 ? "This week" : this.offset === -1 ? "Last week" : `Week ${range.week}` });
    const nav = head.createDiv({ cls: "pd-actions" });
    iconButton(nav, "chevron-left", "Earlier", () => { this.offset--; void this.refresh(); });
    if (this.offset !== 0) iconButton(nav, "calendar", "This week", () => { this.offset = 0; void this.refresh(); });
    if (this.offset < 0) iconButton(nav, "chevron-right", "Later", () => { this.offset++; void this.refresh(); });

    const grid = el.createDiv({ cls: "pd-stats pd-stats-wide" });
    const tile = (v: string | number, label: string) => { const b = grid.createDiv({ cls: "pd-stat is-static" }); b.createDiv({ cls: "pd-stat-value", text: String(v) }); b.createDiv({ cls: "pd-stat-label", text: label }); };
    tile(data.tasksDone.length, "tasks done");
    tile(data.captured, "captured");
    tile(data.notesCreated, "notes created");
    tile(data.logged.length, "logged");
    if (data.words) tile(data.words, "words written");
    if (data.decisions.length) tile(data.decisions.length, "decisions made");

    const cols = el.createDiv({ cls: "pd-writecols" });
    const left = cols.createDiv({ cls: "pd-writemain" });
    const right = cols.createDiv({ cls: "pd-writeside" });

    // What happened
    const logged = sectionCard(left, "Logged", data.logged.length ? `${data.logged.length}` : "", "pd-tone-green");
    if (!data.logged.length) logged.body.createDiv({ cls: "pd-empty", text: "Nothing logged this week." });
    for (const l of this.plugin.getLogs().filter((x) => inRange(x.date, range)).sort((a, b) => a.date.localeCompare(b.date))) {
      const row = logged.body.createDiv({ cls: "pd-logrow" });
      chip(row, l.type.label, "is-type");
      row.createSpan({ text: l.file.basename, cls: "pd-logrow-name" }).addEventListener("click", () => void this.plugin.openFile(l.file));
      if (l.rating !== undefined) chip(row, `${l.rating}/10`, "is-rating");
      row.createSpan({ text: friendlyDate(l.date, new Date()), cls: "pd-muted pd-logrow-date" });
    }
    const done = sectionCard(left, "Done", data.tasksDone.length ? `${data.tasksDone.length}` : "", "pd-tone-red");
    if (!data.tasksDone.length) done.body.createDiv({ cls: "pd-empty", text: "No tasks were ticked off with a done date this week." });
    for (const text of data.tasksDone.slice(0, 30)) done.body.createDiv({ text, cls: "pd-donerow" });

    // Guided review
    const guide = sectionCard(right, "Short review", "three questions, one note", "pd-tone-gold");
    const ask = (key: keyof ReviewAnswers, label: string) => {
      const w = guide.body.createDiv({ cls: "pd-field" });
      w.createDiv({ text: label, cls: "pd-field-label" });
      const ta = w.createEl("textarea", { cls: "pd-input pd-textarea" });
      ta.rows = 3;
      ta.value = this.answers[key];
      ta.addEventListener("input", () => { this.answers[key] = ta.value; paintPreview(); });
    };
    ask("wentWell", "What went well?");
    ask("didnt", "What didn't?");
    ask("focus", "What's the focus for next week?");

    const prevWrap = guide.body.createDiv();
    prevWrap.createDiv({ text: "What will be saved", cls: "pd-card-title" });
    const pre = prevWrap.createEl("pre", { cls: "pd-preview" });
    const hint = prevWrap.createDiv({ cls: "pd-muted pd-preview-hint" });
    let built = buildReviewNote(range, data, this.answers, { now: new Date(), categoryProperty: s.categoryProperty, category: s.reviewCategory });
    const existing = notesInCategory(this.app, s, s.reviewCategory).find((n) => String(n.fm["week"]) === range.key);
    const paintPreview = () => {
      built = buildReviewNote(range, data, this.answers, { now: new Date(), categoryProperty: s.categoryProperty, category: s.reviewCategory });
      pre.setText(built.content);
      hint.setText(`Will be saved as ${built.filename}. The note is exactly as it will appear.`);
    };
    paintPreview();
    const foot = guide.body.createDiv({ cls: "pd-footer" });
    const save = iconButton(foot, "save", "Save review note", async () => {
      paintPreview();
      await this.plugin.createNote(built.filename, built.content);
      this.answers = { wentWell: "", didnt: "", focus: "" };
      void this.refresh();
    }, "mod-cta");
    setTooltip(save, "Creates one new note for this week", { delay: 300 });
    if (existing) {
      const open = foot.createEl("button", { text: "Open this week's saved review", cls: "pd-link" });
      open.addEventListener("click", () => void this.plugin.openFile(existing.file));
    }
  }
}
