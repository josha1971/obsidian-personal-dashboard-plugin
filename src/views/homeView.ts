import { Notice, WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_HOME } from "../constants";
import { daysBetween, friendlyDate, isoDate, isoWeek, parseISODate, startOfDay } from "../dates";
import { LogEntry, readInbox } from "../store";
import { NewNoteDraft, chip, iconButton, renderCaptureBox, renderNewNoteBox, sectionCard, starButton } from "../ui";
import { letterExcerpt } from "./lookbackView";
import { ago } from "./gardenView";

export class HomeView extends DashView {
  private draft: NewNoteDraft = { title: "", text: "" };

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
    const nn = sectionCard(top, "New note", "start writing, it opens in a new tab", "pd-newnote").body;
    renderNewNoteBox(nn, this.plugin, this.draft);
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

    // Review Clipboard: new notes waiting for a proper category
    if (this.shown("clipboard")) this.renderClipboard(el, today);

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

  private renderClipboard(parent: HTMLElement, today: Date): void {
    const items = this.plugin.getClipboard();
    const name = this.plugin.settings.clipboardCategory;
    const card = sectionCard(parent, "Review Clipboard", items.length ? `${items.length} ${items.length === 1 ? "note" : "notes"} · newest first` : "", "pd-tone-red");
    if (!items.length) {
      card.body.createDiv({ cls: "pd-empty", text: `Nothing to review. Notes made from New note are filed under ${name}, and notes with an empty category show up here too.` });
      return;
    }
    const list = card.body.createDiv({ cls: "pd-scroll" });
    for (const it of items) {
      const row = list.createDiv({ cls: "pd-logrow" });
      const title = row.createSpan({ text: it.file.basename, cls: "pd-logrow-name" });
      title.addEventListener("click", () => void this.plugin.openFile(it.file));
      setTooltip(title, "Open in a new tab to set its category", { delay: 400 });
      chip(row, it.unassigned ? "No category" : name, it.unassigned ? "is-overdue" : "is-type");
      if (it.file.parent && !it.file.parent.isRoot()) row.createSpan({ text: it.file.parent.name, cls: "pd-muted pd-logrow-detail" });
      row.createSpan({ text: friendlyDate(isoDate(new Date(it.created)), today), cls: "pd-muted pd-logrow-date" });
    }
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
}
