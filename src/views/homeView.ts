import { Notice, TFile, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_HOME } from "../constants";
import { daysBetween, friendlyDate, isoDate, isoWeek, parseISODate, startOfDay } from "../dates";
import { InboxItem, LogEntry, TaskItem, readInbox } from "../store";
import { chip, iconButton, renderCaptureBox, renderTaskRow, sectionCard, starButton } from "../ui";
import { letterExcerpt } from "./lookbackView";
import { ago } from "./gardenView";

interface NextStep {
  title: string;
  detail: string;
  action: string;
  run: () => void;
}

function taskScore(t: TaskItem, today: Date): number {
  if (t.info.state !== "open") return -1;
  const due = t.info.due ? daysBetween(today, parseISODate(t.info.due) ?? today) : undefined;
  let score = 0;
  if (due !== undefined) {
    if (due < 0) score = 100 + Math.min(-due, 30);
    else if (due === 0) score = 90;
    else if (due <= 3) score = 60 - due;
    else score = 20;
  }
  if (t.info.priority === "high") score += 30;
  else if (t.info.priority === "medium") score += 10;
  return score;
}

export class HomeView extends DashView {
  private skipped = 0;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) {
    super(leaf, plugin);
  }
  getViewType() { return VIEW_HOME; }
  getDisplayText() { return "Home"; }
  getIcon() { return "layout-dashboard"; }

  private shown(id: string): boolean {
    return !this.plugin.settings.homeHidden.includes(id);
  }

  protected async render(isCurrent: () => boolean): Promise<void> {
    const s = this.plugin.settings;
    const [tasks, inbox] = await Promise.all([this.plugin.getTasks(), readInbox(this.app, s)]);
    const logs = this.plugin.getLogs();
    const today = startOfDay(new Date());
    const todayIso = isoDate(today);

    const arrived = this.plugin.getLetters().filter((l) => l.deliver <= todayIso && !l.kept);
    const letterText = arrived.length ? await letterExcerpt(this.plugin, arrived[0].file) : "";
    const dueDecisions = this.plugin.getDecisions().filter((d) => d.status !== "reviewed" && d.lookback && d.lookback <= todayIso);
    if (!isCurrent()) return;

    const el = this.contentEl;
    el.empty();
    this.renderNav(el);

    // Header
    const head = el.createDiv({ cls: "pd-home-head" });
    const titles = head.createDiv();
    titles.createDiv({ cls: "pd-kicker", text: `Week ${isoWeek(today)} · ${inbox.length} ${inbox.length === 1 ? "thing" : "things"} in the inbox` });
    titles.createEl("h1", { cls: "pd-title", text: new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) });
    const capture = head.createDiv({ cls: "pd-home-capture" });
    renderCaptureBox(capture, this.plugin);

    // Shortcuts
    const bar = el.createDiv({ cls: "pd-actions" });
    iconButton(bar, "book-marked", "Journal", () => this.openJournal());
    iconButton(bar, "calendar-check", "Weekly review", () => void this.plugin.navigate(this.leaf, "review"));
    iconButton(bar, "mail", "Write to future me", () => this.plugin.openLetterModal());
    iconButton(bar, "flag", "Log a decision", () => this.plugin.openDecisionModal());
    iconButton(bar, "inbox", "Open inbox", () => void this.plugin.openInbox());

    const open = tasks.filter((t) => t.info.state === "open");
    const overdue = open.filter((t) => t.info.due && daysBetween(today, parseISODate(t.info.due) ?? today) < 0);
    const dueToday = open.filter((t) => t.info.due === todayIso);
    const doneToday = tasks.filter((t) => t.info.state === "done" && t.info.doneDate === todayIso).length;
    const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    const loggedThisWeek = logs.filter((l) => (parseISODate(l.date) ?? 0) >= weekAgo);

    // A letter from past you
    if (arrived.length) {
      const c = sectionCard(el, "From past you", arrived.length > 1 ? `${arrived.length} letters have arrived` : "a letter has arrived", "pd-tone-gold");
      c.body.createDiv({ cls: "pd-quote", text: letterText });
      const row = c.body.createDiv({ cls: "pd-actions" });
      const l = arrived[0];
      row.createSpan({ text: `Written ${friendlyDate(l.written, today)}`, cls: "pd-muted pd-grow" });
      iconButton(row, "arrow-right", "Read it", () => void this.plugin.openFile(l.file), "mod-cta");
      iconButton(row, "reply", "Reply to past me", () => this.plugin.openLetterModal(l.file));
      const keep = row.createEl("button", { text: "Keep", cls: "pd-link" });
      setTooltip(keep, "Hides it from Home. Sets kept: true on that one note, with Undo", { delay: 300 });
      keep.addEventListener("click", () => void this.plugin.keepLetter(l.file));
    }

    // Top row: next best step + the day at a glance
    const top = el.createDiv({ cls: "pd-toprow" });
    if (!this.shown("stats")) top.addClass("is-single");
    this.renderNextStep(top, this.nextSteps(open, overdue, dueToday, inbox, loggedThisWeek, dueDecisions.length ? dueDecisions[0].file : null, today));
    if (this.shown("stats")) {
      const stats = sectionCard(top, "Today's rhythm", "", "pd-stats-card").body;
      const grid = stats.createDiv({ cls: "pd-stats" });
      const words = this.plugin.getWordsOn(todayIso);
      this.stat(grid, `${words}`, `/ ${s.writeGoal} words`, () => void this.plugin.navigate(this.leaf, "write"), "Words saved from Write today");
      this.stat(grid, String(doneToday), "tasks done", () => void this.plugin.navigate(this.leaf, "tasks"), "Tasks ticked off today (needs the done date the plugin adds)");
      this.stat(grid, String(overdue.length), "overdue", () => void this.plugin.navigate(this.leaf, "tasks"), "Open tasks with a due date in the past", overdue.length > 0 ? "is-warn" : "");
      this.stat(grid, String(inbox.length), "in the inbox", () => void this.plugin.openInbox(), "Lines waiting in your inbox note");
    }

    // Favorites, near the top so they are one click away
    if (this.shown("favorites")) this.renderFavorites(el);

    // Next steps
    if (this.shown("nextSteps")) {
      const ranked = open.map((t) => ({ t, s: taskScore(t, today) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
      const extras = dueDecisions.length;
      const steps = sectionCard(el, "Next steps", ranked.length + extras ? "most useful first" : "", "pd-tone-red");
      for (const d of dueDecisions.slice(0, 2)) this.actionRow(steps.body, "flag", `How did "${d.file.basename}" go?`, `You chose ${friendlyDate(d.decided, today)} to look back on this decision`, "Look back", () => void this.plugin.openLookBack(d.file));
      if (!ranked.length && !extras) {
        steps.body.createDiv({ cls: "pd-empty", text: open.length ? "Nothing is due or marked important. Open Tasks to pick something." : "No open tasks. Capture one above." });
      } else {
        for (const { t } of ranked) renderTaskRow(steps.body, t, this.plugin, today);
      }
    }

    // Recent logs
    if (this.shown("recentLogs")) {
      const recent = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.file.stat.ctime - a.file.stat.ctime).slice(0, 6);
      const rl = sectionCard(el, "Recent logs", recent.length ? "latest first" : "", "pd-tone-green");
      if (!recent.length) rl.body.createDiv({ cls: "pd-empty", text: "Nothing logged yet. Use Log to add a book, film, meal, drink or thought." });
      for (const l of recent) this.renderLogRow(rl.body, l, today);
    }

    // From the garden
    if (this.shown("garden")) {
      const { picks, waiting } = this.plugin.gardenToday(3);
      if (picks.length) {
        const gc = sectionCard(el, "From the garden", `${waiting} waiting`, "pd-tone-green");
        for (const f of picks) {
          const row = gc.body.createDiv({ cls: "pd-logrow" });
          row.createSpan({ text: f.basename, cls: "pd-logrow-name" }).addEventListener("click", () => void this.plugin.openFile(f));
          row.createSpan({ text: `edited ${ago(f.stat.mtime)}`, cls: "pd-muted pd-logrow-date" });
        }
        const more = gc.body.createEl("button", { text: "See more in the Garden", cls: "pd-link" });
        more.addEventListener("click", () => void this.plugin.navigate(this.leaf, "garden"));
      }
    }
  }

  private openJournal(): void {
    const cmds = (this.app as unknown as { commands: { executeCommandById(id: string): boolean } }).commands;
    if (!cmds.executeCommandById("daily-notes")) new Notice("Turn on the Daily notes core plugin to use Journal.");
  }

  private actionRow(parent: HTMLElement, icon: string, title: string, detail: string, action: string, run: () => void): void {
    const row = parent.createDiv({ cls: "pd-task" });
    setIcon(row.createDiv({ cls: "pd-rowicon" }), icon);
    const main = row.createDiv({ cls: "pd-task-main" });
    main.createDiv({ text: title, cls: "pd-task-text" });
    main.createDiv({ text: detail, cls: "pd-muted pd-task-meta" });
    const b = row.createEl("button", { text: action, cls: "pd-btn mod-cta" });
    b.addEventListener("click", run);
  }

  private renderFavorites(parent: HTMLElement): void {
    const favs = this.plugin.getFavorites();
    const card = sectionCard(parent, "Favorites", favs.length ? `${favs.length} ${favs.length === 1 ? "note" : "notes"}` : "", "pd-tone-gold");
    if (!favs.length) {
      card.body.createDiv({ cls: "pd-empty", text: "Nothing here yet. Open a note, then use the command Toggle favorite for this note or canvas, or the note's ... menu, or the star in Logs." });
      return;
    }
    const grid = card.body.createDiv({ cls: "pd-favgrid" });
    for (const f of favs.slice(0, 40)) {
      const item = grid.createDiv({ cls: "pd-fav" });
      const name = item.createDiv({ cls: "pd-fav-main" });
      name.createDiv({ text: f.file.basename, cls: "pd-fav-name" });
      const sub = name.createDiv({ cls: "pd-fav-sub" });
      if (f.category) chip(sub, f.category, "is-type");
      if (f.file.parent && !f.file.parent.isRoot()) sub.createSpan({ text: f.file.parent.name, cls: "pd-muted" });
      name.addEventListener("click", () => void this.plugin.openFile(f.file));
      setTooltip(name, `Open ${f.file.path}`, { delay: 400 });
      starButton(item, f.file, true, this.plugin);
    }
    if (favs.length > 40) card.body.createDiv({ cls: "pd-muted pd-summary", text: `Showing 40 of ${favs.length}.` });
  }

  private stat(parent: HTMLElement, value: string, label: string, onClick: () => void, tip: string, cls = ""): void {
    const b = parent.createEl("button", { cls: `pd-stat ${cls}`.trim() });
    b.createDiv({ cls: "pd-stat-value", text: value });
    b.createDiv({ cls: "pd-stat-label", text: label });
    setTooltip(b, tip, { delay: 300 });
    b.addEventListener("click", onClick);
  }

  private renderLogRow(parent: HTMLElement, l: LogEntry, today: Date): void {
    const row = parent.createDiv({ cls: "pd-logrow" });
    chip(row, l.type.label, "is-type");
    const name = row.createSpan({ text: l.file.basename, cls: "pd-logrow-name" });
    name.addEventListener("click", () => void this.plugin.openFile(l.file));
    setTooltip(name, "Open this note", { delay: 400 });
    if (l.detail) row.createSpan({ text: l.detail, cls: "pd-muted pd-logrow-detail" });
    if (l.rating !== undefined) chip(row, `${l.rating}/10`, "is-rating");
    row.createSpan({ text: friendlyDate(l.date, today), cls: "pd-muted pd-logrow-date" });
  }

  private nextSteps(open: TaskItem[], overdue: TaskItem[], dueToday: TaskItem[], inbox: InboxItem[], loggedThisWeek: LogEntry[], decision: TFile | null, today: Date): NextStep[] {
    const s = this.plugin.settings;
    const out: NextStep[] = [];
    const goTasks = () => void this.plugin.navigate(this.leaf, "tasks");
    if (overdue.length) {
      out.push({ title: `${overdue.length} ${overdue.length === 1 ? "task is" : "tasks are"} overdue`, detail: "Finish, reschedule or drop them. It takes a couple of minutes.", action: "Open tasks", run: goTasks });
    }
    if (decision) {
      out.push({ title: `How did "${decision.basename}" go?`, detail: "You asked yourself to check on this decision. It takes about two minutes.", action: "Look back", run: () => void this.plugin.openLookBack(decision) });
    }
    const dated = inbox.filter((i) => i.added).map((i) => daysBetween(parseISODate(i.added!) ?? today, today));
    const oldest = dated.length ? Math.max(...dated) : 0;
    if (inbox.length >= s.inboxNudgeCount || (inbox.length > 0 && oldest >= s.inboxNudgeDays)) {
      const age = oldest >= s.inboxNudgeDays ? `, the oldest is ${oldest} days old` : "";
      out.push({ title: `${inbox.length} things are waiting in the inbox${age}`, detail: "Sort a few now: turn them into notes, tasks, or delete them.", action: "Sort them", run: () => void this.plugin.openInbox() });
    }
    if (dueToday.length) {
      out.push({ title: `${dueToday.length} ${dueToday.length === 1 ? "task is" : "tasks are"} due today`, detail: dueToday[0].info.text, action: "Open tasks", run: goTasks });
    }
    if (loggedThisWeek.length === 0) {
      out.push({ title: "Nothing logged this week", detail: "A film, a meal, a coffee, a thought. A line is enough.", action: "Log something", run: () => this.plugin.openLogModal() });
    }
    if (!out.length) {
      out.push({
        title: open.length ? "You're on top of things" : "Everything is clear",
        detail: open.length ? `${open.length} open tasks, none overdue or due today.` : "No open tasks and an empty inbox.",
        action: "Capture a thought",
        run: () => this.plugin.openCaptureModal(),
      });
    }
    return out;
  }

  private renderNextStep(parent: HTMLElement, steps: NextStep[]): void {
    const step = steps[this.skipped % steps.length];
    const card = parent.createDiv({ cls: "pd-card pd-next" });
    card.createDiv({ cls: "pd-kicker", text: "Next best step" });
    card.createEl("h3", { cls: "pd-next-title", text: step.title });
    card.createDiv({ cls: "pd-muted", text: step.detail });
    const row = card.createDiv({ cls: "pd-next-actions" });
    const go = row.createEl("button", { text: step.action, cls: "pd-btn mod-cta" });
    setTooltip(go, "Chosen by simple rules: overdue, decisions due, inbox size, due today, then logging", { delay: 300 });
    go.addEventListener("click", step.run);
    if (steps.length > 1) {
      const other = row.createEl("button", { text: "Something else", cls: "pd-link" });
      other.addEventListener("click", () => { this.skipped++; void this.refresh(); });
    }
  }
}
