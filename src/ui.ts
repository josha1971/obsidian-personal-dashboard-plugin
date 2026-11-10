import { Notice, setIcon, setTooltip } from "obsidian";
import type DashboardPlugin from "./main";
import type { TaskItem } from "./store";
import type { TFile } from "obsidian";
import { friendlyDate, daysBetween, parseISODate } from "./dates";
import { buildQuickNote } from "./notes";
import { CaptureMode, describeCapture, formatCaptureLine, formatDuration, parseCapture } from "./parser";

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

export function sectionCard(parent: HTMLElement, title: string, subtitle = "", tone = ""): { card: HTMLElement; body: HTMLElement; head: HTMLElement } {
  const card = parent.createDiv({ cls: `pd-card ${tone}`.trim() });
  const head = card.createDiv({ cls: "pd-card-head" });
  head.createSpan({ text: title, cls: "pd-card-title" });
  if (subtitle) head.createSpan({ text: subtitle, cls: "pd-card-sub" });
  return { card, body: card.createDiv({ cls: "pd-card-body" }), head };
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
  if (showNote) meta.createSpan({ text: t.file.basename, cls: "pd-task-note" });
  return row;
}

/**
 * The capture box used on Home and in the capture popup. It shows how the line was
 * understood and the exact line that will be saved.
 */
export function renderCaptureBox(parent: HTMLElement, plugin: DashboardPlugin, opts: { autofocus?: boolean; onSaved?: () => void } = {}): HTMLInputElement {
  const wrap = parent.createDiv({ cls: "pd-capture" });
  const row = wrap.createDiv({ cls: "pd-capture-row" });
  const input = row.createEl("input", {
    type: "text",
    cls: "pd-capture-input",
    attr: { placeholder: "Capture a thought, or a task: call Sam ~15m !low @fri" },
  });
  setTooltip(input, "Plain text is saved as a note. Add ~15m (time), !low !med !high (priority), @fri @tomorrow @+3d (date) to make it a task", { delay: 500 });

  let mode: CaptureMode = "auto";
  const modes = row.createDiv({ cls: "pd-seg" });
  const modeBtns = new Map<CaptureMode, HTMLButtonElement>();
  const modeTips: Record<CaptureMode, string> = {
    auto: "Becomes a task only if you use ~, ! or @ words",
    task: "Always save as a task",
    note: "Always save as a plain note, nothing is interpreted",
  };
  for (const [m, label] of [["auto", "Auto"], ["task", "Task"], ["note", "Note"]] as [CaptureMode, string][]) {
    const b = modes.createEl("button", { text: label, cls: "pd-seg-btn" });
    setTooltip(b, modeTips[m], { delay: 300 });
    b.addEventListener("click", () => { mode = m; update(); input.focus(); });
    modeBtns.set(m, b);
  }
  const save = row.createEl("button", { text: "Add", cls: "pd-btn mod-cta" });
  setTooltip(save, "Adds one line to your inbox note (Enter)", { delay: 300 });

  const preview = wrap.createDiv({ cls: "pd-capture-preview" });

  const update = () => {
    for (const [m, b] of modeBtns) b.toggleClass("is-active", m === mode);
    preview.empty();
    const text = input.value.trim();
    if (!text) {
      preview.createSpan({ text: `Goes to ${plugin.settings.inboxPath}. Nothing is saved until you press Enter.`, cls: "pd-muted" });
      return;
    }
    const now = new Date();
    const p = parseCapture(text, now, mode);
    const understood = preview.createDiv({ cls: "pd-understood" });
    for (const bit of describeCapture(p, now)) chip(understood, bit, bit === "Task" ? "is-task" : "");
    preview.createEl("code", { text: formatCaptureLine(p, now), cls: "pd-line" });
  };

  const submit = async () => {
    if (!input.value.trim()) return;
    const ok = await plugin.capture(input.value, mode);
    if (ok) {
      input.value = "";
      update();
      opts.onSaved?.();
    }
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); void submit(); }
  });
  save.addEventListener("click", () => void submit());
  update();
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
export interface NewNoteDraft { title: string; text: string }

/** Two fields: a title and a start for the note. Creating it opens the note in a new tab. */
export function renderNewNoteBox(parent: HTMLElement, plugin: DashboardPlugin, draft: NewNoteDraft): void {
  const title = parent.createEl("input", { type: "text", cls: "pd-input", attr: { placeholder: "Title. The date is added in front of it" } });
  setTooltip(title, "The note is named like 2026-11-10 - Your title", { delay: 500 });
  title.value = draft.title;
  const area = parent.createEl("textarea", { cls: "pd-input pd-textarea pd-newnote-text", attr: { placeholder: "Start writing..." } });
  area.value = draft.text;
  const foot = parent.createDiv({ cls: "pd-newnote-foot" });
  const hint = foot.createSpan({ cls: "pd-muted pd-grow pd-newnote-hint" });
  const create = foot.createEl("button", { text: "Create and open", cls: "pd-btn mod-cta" });
  setTooltip(create, "Creates a new note and opens it in a new tab (Ctrl/Cmd+Enter)", { delay: 300 });

  const paint = () => {
    const n = buildQuickNote(draft.title, draft.text, new Date());
    const folder = plugin.settings.logsFolder;
    hint.setText(`Will be saved as ${folder ? folder + "/" : ""}${n.filename}`);
  };
  title.addEventListener("input", () => { draft.title = title.value; paint(); });
  area.addEventListener("input", () => { draft.text = area.value; paint(); });
  const submit = async () => {
    if (await plugin.createQuickNote(draft.title, draft.text)) {
      draft.title = "";
      draft.text = "";
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
