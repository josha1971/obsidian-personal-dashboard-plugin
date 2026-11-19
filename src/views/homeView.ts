import { TFile, WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_HOME } from "../constants";
import { friendlyDate, isoDate, isoWeek, startOfDay, timeAgo } from "../dates";
import { readInbox } from "../store";
import { NewNoteDraft, chip, iconButton, renderCaptureBox, renderNewNoteBox, sectionCard, starButton } from "../ui";
import { letterExcerpt } from "./lookbackView";

export class HomeView extends DashView {
  private draft: NewNoteDraft = { title: "", text: "", category: "" };

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
    const inbox = await readInbox(this.app, s);
    const today = startOfDay(new Date());
    const todayIso = isoDate(today);

    const arrived = this.plugin.getLetters().filter((l) => l.deliver <= todayIso && !l.kept);
    const letterText = arrived.length ? await letterExcerpt(this.plugin, arrived[0].file) : "";
    if (!isCurrent()) return;

    const el = this.contentEl;
    el.empty();

    // Header
    const head = el.createDiv({ cls: "pd-home-head" });
    const titles = head.createDiv();
    titles.createDiv({ cls: "pd-kicker", text: `Week ${isoWeek(today)} · ${inbox.length} ${inbox.length === 1 ? "thing" : "things"} in the inbox` });
    titles.createEl("h1", { cls: "pd-title", text: new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) });
    const capture = head.createDiv({ cls: "pd-home-capture" });
    renderCaptureBox(capture, this.plugin);

    // Shortcuts
    const bar = el.createDiv({ cls: "pd-actions" });
    iconButton(bar, "message-square-plus", "Add Quick Thought", () => this.plugin.openQuickThoughtModal());
    iconButton(bar, "plus", "Log", () => this.plugin.openLogModal(), "mod-cta");
    iconButton(bar, "inbox", "Open Inbox", () => void this.plugin.openInbox());
    iconButton(bar, "check-square", "Tasks", () => void this.plugin.navigate(this.leaf, "tasks"));
    iconButton(bar, "book-open", "Logs", () => void this.plugin.navigate(this.leaf, "logs"));
    iconButton(bar, "history", "Look Back", () => void this.plugin.navigate(this.leaf, "lookback"));

    // Favorites sit right under the buttons
    if (this.shown("favorites")) this.renderFavorites(el);

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

    // New note, beside one box with two lists (Recently modified, Review Clipboard)
    const top = el.createDiv({ cls: "pd-toprow" });
    const nn = sectionCard(top, "New note", "opens in a new tab", "pd-newnote").body;
    renderNewNoteBox(nn, this.plugin, this.draft);
    if (!this.renderLists(top, today)) top.addClass("is-single");
  }

  /**
   * One box with two tabs: the last 10 files edited, and the notes waiting for a proper
   * category. Clicking the title bar folds the box; the tabs do not. Returns false when both
   * lists are switched off.
   */
  private renderLists(parent: HTMLElement, today: Date): boolean {
    const s = this.plugin.settings;
    const tabs: { id: "recent" | "clipboard"; label: string; count?: number }[] = [];
    const clip = this.shown("clipboard") ? this.plugin.getClipboard() : [];
    if (this.shown("recentLogs")) tabs.push({ id: "recent", label: "Recently modified" });
    if (this.shown("clipboard")) tabs.push({ id: "clipboard", label: "Review Clipboard", count: clip.length });
    if (!tabs.length) return false;

    let active = tabs.some((t) => t.id === s.homeTab) ? s.homeTab! : tabs[0].id;
    const { head, body } = sectionCard(parent, "", "", "pd-tone-green pd-lists", { plugin: this.plugin, id: "lists" });
    head.querySelector(".pd-card-title")?.remove();
    const bar = head.createDiv({ cls: "pd-tabs" });
    const list = body.createDiv({ cls: "pd-scroll pd-recent-scroll" });
    const buttons = new Map<string, HTMLButtonElement>();

    const paint = () => {
      for (const [id, b] of buttons) b.toggleClass("is-active", id === active);
      list.empty();
      if (active === "recent") this.fillRecent(list);
      else this.fillClipboard(list, clip, today);
    };
    for (const t of tabs) {
      const b = bar.createEl("button", { text: t.label, cls: "pd-tab" });
      if (t.count) b.createSpan({ text: String(t.count), cls: "pd-tab-count" });
      setTooltip(b, t.id === "recent" ? "The last 10 files you edited" : `Notes filed under ${s.clipboardCategory}, plus notes with an empty category, newest first`, { delay: 400 });
      // The tabs switch lists; they do not fold the box.
      b.addEventListener("click", (e) => { e.stopPropagation(); active = t.id; this.plugin.setHomeTab(t.id); paint(); });
      b.addEventListener("keydown", (e) => e.stopPropagation());
      buttons.set(t.id, b);
    }
    paint();
    return true;
  }

  private fillRecent(list: HTMLElement): void {
    const recent = this.plugin.getRecentlyModified(10);
    if (!recent.length) {
      list.createDiv({ cls: "pd-empty", text: "No notes yet." });
      return;
    }
    for (const f of recent) {
      const row = list.createDiv({ cls: "pd-logrow" });
      const name = row.createSpan({ text: f.basename, cls: "pd-logrow-name" });
      name.addEventListener("click", () => void this.plugin.openFile(f));
      setTooltip(name, `Open ${f.path} in a new tab`, { delay: 400 });
      const cat = this.plugin.categoryOf(f);
      if (cat) chip(row, cat, "is-type");
      else if (f.extension !== "md") chip(row, f.extension === "canvas" ? "Canvas" : "Base", "is-type");
      if (f.parent && !f.parent.isRoot()) row.createSpan({ text: f.parent.name, cls: "pd-muted pd-logrow-detail" });
      row.createSpan({ text: timeAgo(f.stat.mtime), cls: "pd-muted pd-logrow-date" });
    }
  }

  private fillClipboard(list: HTMLElement, items: { file: TFile; created: number; unassigned: boolean }[], today: Date): void {
    const name = this.plugin.settings.clipboardCategory;
    if (!items.length) {
      list.createDiv({ cls: "pd-empty", text: `Nothing to review. Notes made from New note are filed under ${name}, and notes with an empty category show up here too.` });
      return;
    }
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
    const card = sectionCard(parent, "Favorites", favs.length ? `${favs.length} ${favs.length === 1 ? "note" : "notes"}` : "", "pd-tone-gold", { plugin: this.plugin, id: "favorites" });
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

}
