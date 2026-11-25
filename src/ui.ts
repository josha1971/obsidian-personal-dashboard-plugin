import { Notice, setIcon, setTooltip } from "obsidian";
import type DashboardPlugin from "./main";
import { TaskItem, taskCreatedKey } from "./store";
import type { TFile } from "obsidian";
import { friendlyDate, daysBetween, parseISODate } from "./dates";
import { buildQuickNote, categoryChoices } from "./notes";
import { formatDuration } from "./parser";

/** A toast with one Undo button. */
export function undoNotice(message: string, onUndo: () => Promise<void> | void, ms = 9000): void {
  const frag = document.createDocumentFragment();
  const span = document.createElement("span");
  span.textContent = message + " ";
  const btn = document.createElement("button");
  btn.textContent = "Undo";
  btn.className = "pd-undo";
  frag.append(span, btn);
  const notice = new Notice(frag, ms);
  btn.addEventListener("click", async () => {
    notice.hide();
    try {
      await onUndo();
      new Notice("Undone");
    } catch (e) {
      new Notice(`Could not undo: ${(e as Error).message}`);
    }
  });
}

export function chip(parent: HTMLElement, text: string, cls = ""): HTMLElement {
  return parent.createSpan({ text, cls: `pd-chip ${cls}`.trim() });
}

export function iconButton(parent: HTMLElement, icon: string, label: string, onClick: (e: MouseEvent) => void, cls = ""): HTMLButtonElement {
  const b = parent.createEl("button", { cls: `pd-btn ${cls}`.trim() });
  setIcon(b.createSpan({ cls: "pd-btn-icon" }), icon);
  b.createSpan({ text: label });
  setTooltip(b, label, { delay: 300 });
  b.addEventListener("click", onClick);
  return b;
}

/**
 * A titled card. With `collapse`, clicking the title bar folds the card shut or open, and it
 * stays that way (the choice is remembered by id).
 */
export function sectionCard(
  parent: HTMLElement,
  title: string,
  subtitle = "",
  tone = "",
  collapse?: { plugin: DashboardPlugin; id: string },
): { card: HTMLElement; body: HTMLElement; head: HTMLElement } {
  const card = parent.createDiv({ cls: `pd-card ${tone}`.trim() });
  const head = card.createDiv({ cls: "pd-card-head" });
  const chevron = collapse ? head.createSpan({ cls: "pd-chevron" }) : null;
  head.createSpan({ text: title, cls: "pd-card-title" });
  if (subtitle) head.createSpan({ text: subtitle, cls: "pd-card-sub" });
  const body = card.createDiv({ cls: "pd-card-body" });
  if (collapse && chevron) {
    let collapsed = collapse.plugin.settings.collapsedSections.includes(collapse.id);
    head.addClass("is-collapsible");
    head.setAttribute("role", "button");
    head.setAttribute("tabindex", "0");
    setTooltip(head, "Click to fold this section shut or open", { delay: 700 });
    const paint = () => {
      card.toggleClass("is-collapsed", collapsed);
      head.setAttribute("aria-expanded", String(!collapsed));
      chevron.empty();
      setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
    };
    const toggle = () => { collapsed = !collapsed; paint(); collapse.plugin.setCollapsed(collapse.id, collapsed); };
    head.addEventListener("click", toggle);
    head.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !e.isComposing) { e.preventDefault(); toggle(); } });
    paint();
  }
  return { card, body, head };
}

/** One task row: a check button, the text, small chips, and the note it lives in. */
export function renderTaskRow(parent: HTMLElement, t: TaskItem, plugin: DashboardPlugin, today: Date, showNote = true): HTMLElement {
  const row = parent.createDiv({ cls: "pd-task" });
  const done = t.info.state === "done";
  if (done) row.addClass("is-done");

  const check = row.createEl("button", { cls: "pd-check" });
  if (done) setIcon(check, "check");
  setTooltip(check, done ? "Mark as not done" : "Mark as done. You can undo it", { delay: 300 });
  check.addEventListener("click", () => void plugin.toggleTask(t));

  const main = row.createDiv({ cls: "pd-task-main" });
  const text = main.createDiv({ text: t.info.text || "(empty task)", cls: "pd-task-text" });
  text.addEventListener("click", () => void plugin.openFile(t.file, t.line));
  setTooltip(text, `Open ${t.file.basename}`, { delay: 400 });

  const meta = main.createDiv({ cls: "pd-task-meta" });
  if (t.info.due) {
    const overdue = !done && daysBetween(today, parseISODate(t.info.due) ?? today) < 0;
    chip(meta, friendlyDate(t.info.due, today), overdue ? "is-overdue" : "");
  }
  if (t.info.priority) chip(meta, t.info.priority, `pd-pri-${t.info.priority}`);
  if (t.info.duration) chip(meta, formatDuration(t.info.duration));
  for (const tag of t.info.tags) chip(meta, `#${tag}`, "is-tag");
  const made = taskCreatedKey(t).slice(0, 10);
  const when = meta.createSpan({ text: `Created ${friendlyDate(made, today)}${showNote ? " - " : ""}`, cls: "pd-task-note pd-task-when" });
  setTooltip(when, `This checklist item was created on ${made}`, { delay: 400 });
  if (showNote) {
    const note = meta.createSpan({ text: t.file.basename, cls: "pd-task-note pd-task-notename" });
    setTooltip(note, `In ${t.file.path}`, { delay: 400 });
  }
  return row;
}

/**
 * The Add box: a text box and a button. It adds the text as a plain bullet at the top of your
 * Random Notes (the inbox note).
 */
export function renderCaptureBox(parent: HTMLElement, plugin: DashboardPlugin, opts: { autofocus?: boolean; onSaved?: () => void } = {}): HTMLInputElement {
  const row = parent.createDiv({ cls: "pd-capture-row" });
  const input = row.createEl("input", { type: "text", cls: "pd-capture-input", attr: { placeholder: "Add to Random Notes" } });
  setTooltip(input, `Adds a bullet to the top of ${plugin.settings.inboxPath} (Enter)`, { delay: 500 });
  const save = row.createEl("button", { text: "Add", cls: "pd-btn mod-cta" });
  setTooltip(save, `Adds a bullet to the top of ${plugin.settings.inboxPath}`, { delay: 300 });

  const submit = async () => {
    if (!input.value.trim()) return;
    if (await plugin.capture(input.value)) {
      input.value = "";
      opts.onSaved?.();
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); void submit(); }
  });
  save.addEventListener("click", () => void submit());
  if (opts.autofocus) window.setTimeout(() => input.focus(), 30);
  return input;
}

/** A star that flags or unflags a note as a favorite. */
export function starButton(parent: HTMLElement, file: TFile, on: boolean, plugin: DashboardPlugin): HTMLButtonElement {
  const b = parent.createEl("button", { cls: `pd-star${on ? " is-on" : ""}` });
  setIcon(b, "star");
  setTooltip(b, on ? "Remove from favorites" : "Add to favorites. Sets a property on this note, with Undo", { delay: 300 });
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    void plugin.toggleFavorite(file);
  });
  return b;
}

/** The draft in the New note box. Kept by the page so a refresh does not wipe what you are typing. */
export interface NewNoteDraft { title: string; text: string; category: string }

/** A title, a short start for the note, and category buttons. Creating it opens the note in a new tab. */
export function renderNewNoteBox(parent: HTMLElement, plugin: DashboardPlugin, draft: NewNoteDraft): void {
  const choices = categoryChoices(plugin.settings.newNoteCategories, plugin.settings.clipboardCategory);
  const fallback = plugin.settings.clipboardCategory;
  if (!choices.includes(draft.category)) draft.category = fallback;

  const title = parent.createEl("input", { type: "text", cls: "pd-input", attr: { placeholder: "Title. The date is added in front of it" } });
  setTooltip(title, "The note is named like 2026-11-10 - Your title", { delay: 500 });
  title.value = draft.title;
  const area = parent.createEl("textarea", { cls: "pd-input pd-textarea pd-newnote-text", attr: { placeholder: "Start writing...", rows: "3" } });
  area.value = draft.text;

  const cats = parent.createDiv({ cls: "pd-chips pd-newnote-cats" });
  const catBtns: HTMLButtonElement[] = [];
  const paintCats = () => catBtns.forEach((b) => b.toggleClass("is-active", b.textContent === draft.category));
  for (const c of choices) {
    const b = cats.createEl("button", { text: c, cls: "pd-pick" });
    setTooltip(b, `File the new note under [[${c}]]`, { delay: 300 });
    b.addEventListener("click", () => { draft.category = c; paintCats(); paint(); });
    catBtns.push(b);
  }
  paintCats();

  const foot = parent.createDiv({ cls: "pd-newnote-foot" });
  const hint = foot.createSpan({ cls: "pd-muted pd-grow pd-newnote-hint" });
  const create = foot.createEl("button", { text: "Create and open", cls: "pd-btn mod-cta" });
  setTooltip(create, "Creates a new note in the chosen category and opens it in a new tab (Ctrl/Cmd+Enter)", { delay: 300 });

  const paint = () => {
    const n = buildQuickNote(draft.title, draft.text, new Date(), { category: draft.category, categoryProperty: plugin.settings.categoryProperty });
    const folder = plugin.settings.logsFolder;
    hint.setText(`${folder ? folder + "/" : ""}${n.filename}`);
  };
  title.addEventListener("input", () => { draft.title = title.value; paint(); });
  area.addEventListener("input", () => { draft.text = area.value; paint(); });
  const submit = async () => {
    if (await plugin.createQuickNote(draft.title, draft.text, draft.category)) {
      draft.title = "";
      draft.text = "";
      draft.category = fallback;
      paintCats();
      title.value = "";
      area.value = "";
      paint();
    } else if (!draft.title.trim() && !draft.text.trim()) {
      new Notice("Add a title or some text first");
    }
  };
  create.addEventListener("click", () => void submit());
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); void submit(); }
  };
  title.addEventListener("keydown", onKey);
  area.addEventListener("keydown", onKey);
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); area.focus(); }
  });
  paint();
}
