import { App, Modal, Notice, TFile, setTooltip } from "obsidian";
import type DashboardPlugin from "./main";
import { addDays, addMonths, isoDate } from "./dates";
import { DecisionInput, OUTCOMES, Outcome, buildDecisionNote, buildLetterNote, lookBackSection } from "./lookback";
import { RATING_LABELS } from "./logs";

/** A row of date shortcuts plus a date picker. Calls onChange with an ISO date. */
function datePicker(parent: HTMLElement, options: [string, Date][], initial: string, onChange: (iso: string) => void): void {
  const row = parent.createDiv({ cls: "pd-chips" });
  let current = initial;
  const picks: { b: HTMLButtonElement; iso: string }[] = [];
  const input = row.createEl("input", { type: "date", cls: "pd-input pd-date" });
  input.value = initial;
  const paint = () => picks.forEach((p) => p.b.toggleClass("is-active", p.iso === current));
  for (const [label, d] of options) {
    const iso = isoDate(d);
    const b = row.createEl("button", { text: label, cls: "pd-pick" });
    row.insertBefore(b, input);
    picks.push({ b, iso });
    b.addEventListener("click", () => { current = iso; input.value = iso; onChange(iso); paint(); });
  }
  input.addEventListener("input", () => { current = input.value; onChange(input.value); paint(); });
  paint();
}

function field(parent: HTMLElement, label: string, hint = ""): HTMLElement {
  const w = parent.createDiv({ cls: "pd-field" });
  const h = w.createDiv({ cls: "pd-field-head" });
  h.createSpan({ text: label, cls: "pd-field-label" });
  if (hint) h.createSpan({ text: hint, cls: "pd-muted" });
  return w;
}

function previewColumn(side: HTMLElement): { pre: HTMLElement; hint: HTMLElement } {
  side.createDiv({ text: "What will be saved", cls: "pd-card-title" });
  const pre = side.createEl("pre", { cls: "pd-preview" });
  const hint = side.createDiv({ cls: "pd-muted pd-preview-hint" });
  return { pre, hint };
}

export class LetterModal extends Modal {
  private text = "";
  private deliver: string;

  constructor(app: App, private plugin: DashboardPlugin, private replyTo?: TFile) {
    super(app);
    this.deliver = isoDate(addMonths(new Date(), 6));
  }

  onOpen(): void {
    this.modalEl.addClass("pd-modal", "pd-modal-wide");
    this.titleEl.setText(this.replyTo ? "Reply to past you" : "Write to future you");
    const cols = this.contentEl.createDiv({ cls: "pd-logcols" });
    const form = cols.createDiv({ cls: "pd-logform" });
    const { pre, hint } = previewColumn(cols.createDiv({ cls: "pd-logside" }));
    const s = this.plugin.settings;
    const paint = () => {
      const b = buildLetterNote(this.text, this.deliver, { now: new Date(), categoryProperty: s.categoryProperty, category: s.letterCategory }, this.replyTo?.basename);
      pre.setText(b.content);
      hint.setText(`Will be saved as ${b.filename}. It comes back on Home on the date you pick.`);
    };

    const w = field(form, "Dear future me...");
    const ta = w.createEl("textarea", { cls: "pd-input pd-textarea" });
    ta.rows = 9;
    ta.addEventListener("input", () => { this.text = ta.value; paint(); });
    window.setTimeout(() => ta.focus(), 30);

    const d = field(form, "Deliver on");
    const now = new Date();
    datePicker(d, [["1 month", addMonths(now, 1)], ["3 months", addMonths(now, 3)], ["6 months", addMonths(now, 6)], ["1 year", addMonths(now, 12)]], this.deliver, (iso) => { this.deliver = iso; paint(); });
    paint();

    const foot = this.contentEl.createDiv({ cls: "pd-footer" });
    const save = foot.createEl("button", { text: "Seal and save", cls: "pd-btn mod-cta" });
    setTooltip(save, "Creates a new note. You can undo it right after", { delay: 300 });
    save.addEventListener("click", async () => {
      if (!this.text.trim()) { new Notice("Write something first"); return; }
      if (!this.deliver || this.deliver <= isoDate(new Date())) { new Notice("Pick a date in the future"); return; }
      const b = buildLetterNote(this.text, this.deliver, { now: new Date(), categoryProperty: s.categoryProperty, category: s.letterCategory }, this.replyTo?.basename);
      await this.plugin.createNote(b.filename, b.content);
      this.close();
    });
    foot.createSpan({ text: "Creates one new note.", cls: "pd-muted" });
  }

  onClose(): void { this.contentEl.empty(); }
}

export class DecisionModal extends Modal {
  private d: DecisionInput;

  constructor(app: App, private plugin: DashboardPlugin) {
    super(app);
    this.d = { title: "", decision: "", why: "", expect: "", lookback: isoDate(addMonths(new Date(), 1)) };
  }

  onOpen(): void {
    this.modalEl.addClass("pd-modal", "pd-modal-wide");
    this.titleEl.setText("Log a decision");
    const s = this.plugin.settings;
    const cols = this.contentEl.createDiv({ cls: "pd-logcols" });
    const form = cols.createDiv({ cls: "pd-logform" });
    const { pre, hint } = previewColumn(cols.createDiv({ cls: "pd-logside" }));
    const paint = () => {
      const b = buildDecisionNote(this.d, { now: new Date(), categoryProperty: s.categoryProperty, category: s.decisionCategory });
      pre.setText(b.content);
      hint.setText(`Will be saved as ${b.filename}. You'll be asked how it went on the look-back date.`);
    };
    const text = (label: string, key: "title" | "decision" | "why" | "expect", multi: boolean, hintText = "") => {
      const w = field(form, label, hintText);
      const el = multi ? w.createEl("textarea", { cls: "pd-input pd-textarea" }) : w.createEl("input", { type: "text", cls: "pd-input" });
      if (multi) (el as HTMLTextAreaElement).rows = 3;
      el.addEventListener("input", () => { this.d[key] = (el as HTMLInputElement).value; paint(); });
      return el;
    };
    const first = text("Decision", "title", false, "a short name, e.g. Raise stall prices by ten percent");
    window.setTimeout(() => first.focus(), 30);
    text("What did you choose?", "decision", true);
    text("Why?", "why", true);
    text("What do you expect to happen?", "expect", true, "so you can check later");

    const c = field(form, "How confident are you?", "optional");
    const row = c.createDiv({ cls: "pd-chips pd-rating" });
    const label = row.createSpan({ cls: "pd-muted pd-rating-label" });
    const paintRating = () => {
      row.querySelectorAll<HTMLElement>(".pd-num").forEach((el) => el.toggleClass("is-active", Number(el.textContent) === this.d.confidence));
      label.setText(this.d.confidence ? `${this.d.confidence} of 10 · ${RATING_LABELS[this.d.confidence]}` : "");
    };
    for (let i = 1; i <= 10; i++) {
      const b = row.createEl("button", { text: String(i), cls: "pd-num" });
      row.insertBefore(b, label);
      b.addEventListener("click", () => { this.d.confidence = this.d.confidence === i ? undefined : i; paintRating(); paint(); });
    }

    const l = field(form, "Look back on");
    const now = new Date();
    datePicker(l, [["2 weeks", addDays(now, 14)], ["1 month", addMonths(now, 1)], ["3 months", addMonths(now, 3)], ["6 months", addMonths(now, 6)]], this.d.lookback, (iso) => { this.d.lookback = iso; paint(); });
    paint();

    const foot = this.contentEl.createDiv({ cls: "pd-footer" });
    const save = foot.createEl("button", { text: "Save decision", cls: "pd-btn mod-cta" });
    save.addEventListener("click", async () => {
      if (!this.d.title.trim()) { new Notice("Give the decision a name"); return; }
      if (!this.d.lookback) { new Notice("Pick a look-back date"); return; }
      const b = buildDecisionNote(this.d, { now: new Date(), categoryProperty: s.categoryProperty, category: s.decisionCategory });
      await this.plugin.createNote(b.filename, b.content);
      this.close();
    });
    foot.createSpan({ text: "Creates one new note.", cls: "pd-muted" });
  }

  onClose(): void { this.contentEl.empty(); }
}

export class LookBackModal extends Modal {
  private outcome: Outcome = "Right call";
  private text = "";
  private later: string = isoDate(addMonths(new Date(), 1));

  constructor(app: App, private plugin: DashboardPlugin, private file: TFile, private excerpt: string) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("pd-modal");
    this.titleEl.setText(`How did "${this.file.basename}" go?`);
    const c = this.contentEl;
    if (this.excerpt) c.createDiv({ cls: "pd-quote", text: this.excerpt });

    const o = field(c, "Was it the right call?");
    const row = o.createDiv({ cls: "pd-chips" });
    const laterWrap = c.createDiv();
    const paint = () => {
      row.querySelectorAll<HTMLElement>(".pd-pick").forEach((el) => el.toggleClass("is-active", el.textContent === this.outcome));
      laterWrap.empty();
      if (this.outcome === "Too early to say") {
        const f = field(laterWrap, "Ask me again on");
        const now = new Date();
        datePicker(f, [["2 weeks", addDays(now, 14)], ["1 month", addMonths(now, 1)], ["3 months", addMonths(now, 3)]], this.later, (iso) => { this.later = iso; });
      }
    };
    for (const out of OUTCOMES) {
      const b = row.createEl("button", { text: out, cls: "pd-pick" });
      b.addEventListener("click", () => { this.outcome = out; paint(); });
    }
    const w = field(c, "What happened?", "what did you learn?");
    const ta = w.createEl("textarea", { cls: "pd-input pd-textarea" });
    ta.rows = 4;
    ta.addEventListener("input", () => { this.text = ta.value; });
    paint();
    window.setTimeout(() => ta.focus(), 30);

    const foot = c.createDiv({ cls: "pd-footer" });
    const save = foot.createEl("button", { text: "Save", cls: "pd-btn mod-cta" });
    setTooltip(save, "Adds a short section to this decision note and updates its status. Undo is offered", { delay: 300 });
    save.addEventListener("click", async () => {
      await this.plugin.applyLookBack(this.file, this.outcome, this.text, this.outcome === "Too early to say" ? this.later : undefined);
      this.close();
    });
    foot.createSpan({ text: "Adds a section to this note and sets its status.", cls: "pd-muted" });
  }

  onClose(): void { this.contentEl.empty(); }
}

export { lookBackSection };
