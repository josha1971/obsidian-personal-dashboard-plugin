import { App, Modal, Notice, setIcon, setTooltip } from "obsidian";
import type DashboardPlugin from "./main";
import { LogEntry, asList, linkTarget } from "./store";
import { LogField, LogType, LogValues, RATING_LABELS, buildLogNote } from "./logs";
import { isoDate, addDays } from "./dates";
import { renderCaptureBox } from "./ui";

export class CaptureModal extends Modal {
  constructor(app: App, private plugin: DashboardPlugin) {
    super(app);
  }
  onOpen(): void {
    this.modalEl.addClass("pd-modal");
    this.titleEl.setText("Quick capture");
    renderCaptureBox(this.contentEl, this.plugin, { autofocus: true, onSaved: () => this.close() });
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/** Most-used earlier values for a field of a log type, for one-tap chips. */
function suggestionsFor(entries: LogEntry[], type: LogType, field: LogField, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.type.id !== type.id) continue;
    for (const v of asList(e.fm[field.key])) {
      const label = field.link ? linkTarget(v) : v;
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([v]) => v);
}

export class LogModal extends Modal {
  private type: LogType;
  private name = "";
  private body = "";
  private values: LogValues = {};
  private entries: LogEntry[];
  private previewEl!: HTMLElement;
  private formEl!: HTMLElement;
  private showIfEls: { el: HTMLElement; key: string }[] = [];

  constructor(app: App, private plugin: DashboardPlugin, typeId?: string) {
    super(app);
    const types = plugin.settings.logTypes;
    this.type = types.find((t) => t.id === typeId) ?? types[0];
    this.entries = plugin.getLogs();
    this.resetValues();
  }

  private resetValues(): void {
    this.values = { date: isoDate(new Date()) };
    this.name = "";
    this.body = "";
  }

  onOpen(): void {
    this.modalEl.addClass("pd-modal", "pd-modal-wide");
    this.titleEl.setText("Log something");
    this.render();
    this.scope.register(["Mod"], "Enter", () => { void this.save(); return false; });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const picker = contentEl.createDiv({ cls: "pd-typepicker" });
    for (const t of this.plugin.settings.logTypes) {
      const b = picker.createEl("button", { cls: "pd-typebtn" });
      setIcon(b.createSpan({ cls: "pd-btn-icon" }), t.icon);
      b.createSpan({ text: t.label });
      b.toggleClass("is-active", t.id === this.type.id);
      setTooltip(b, `Saved with category [[${t.category}]]`, { delay: 300 });
      b.addEventListener("click", () => {
        this.type = t;
        this.resetValues();
        this.render();
      });
    }

    const cols = contentEl.createDiv({ cls: "pd-logcols" });
    this.formEl = cols.createDiv({ cls: "pd-logform" });
    const side = cols.createDiv({ cls: "pd-logside" });
    side.createDiv({ text: "What will be saved", cls: "pd-card-title" });
    this.previewEl = side.createEl("pre", { cls: "pd-preview" });
    this.previewHint = side.createDiv({ cls: "pd-muted pd-preview-hint" });

    this.renderForm();
    this.updatePreview();

    const footer = contentEl.createDiv({ cls: "pd-footer" });
    const save = footer.createEl("button", { text: "Save note", cls: "pd-btn mod-cta" });
    setTooltip(save, "Creates a new note. Nothing existing is changed. Ctrl/Cmd+Enter", { delay: 300 });
    save.addEventListener("click", () => void this.save());
    footer.createSpan({ text: "Creates one new note. You can undo it right after.", cls: "pd-muted" });
  }

  private previewHint!: HTMLElement;

  private renderForm(): void {
    const t = this.type;
    this.showIfEls = [];
    const f = this.formEl;

    {
      const wrap = this.fieldWrap(f, t.nameLabel, t.titleMode === "timestamp" ? "optional, the date is added for you" : "");
      const input = wrap.createEl("input", { type: "text", cls: "pd-input" });
      input.value = this.name;
      input.addEventListener("input", () => { this.name = input.value; this.updatePreview(); });
      window.setTimeout(() => input.focus(), 30);
    }

    for (const field of t.fields) this.renderField(f, field);

    if (t.bodyLabel) {
      const wrap = this.fieldWrap(f, t.bodyLabel, t.bodyRequired ? "" : "optional");
      const ta = wrap.createEl("textarea", { cls: "pd-input pd-textarea" });
      ta.rows = t.bodyRequired ? 6 : 4;
      ta.value = this.body;
      ta.addEventListener("input", () => { this.body = ta.value; this.updatePreview(); });
    }
    this.syncShowIf();
  }

  private fieldWrap(parent: HTMLElement, label: string, hint = ""): HTMLElement {
    const wrap = parent.createDiv({ cls: "pd-field" });
    const head = wrap.createDiv({ cls: "pd-field-head" });
    head.createSpan({ text: label, cls: "pd-field-label" });
    if (hint) head.createSpan({ text: hint, cls: "pd-muted" });
    return wrap;
  }

  private set(key: string, value: string | number | string[] | undefined): void {
    this.values[key] = value;
    this.syncShowIf();
    this.updatePreview();
  }

  private syncShowIf(): void {
    for (const { el, key } of this.showIfEls) {
      const v = this.values[key];
      el.toggleClass("is-hidden", v === undefined || v === "");
    }
  }

  private chipRow(parent: HTMLElement, options: string[], isActive: (o: string) => boolean, onPick: (o: string) => void): HTMLElement {
    const row = parent.createDiv({ cls: "pd-chips" });
    for (const o of options) {
      const b = row.createEl("button", { text: o, cls: "pd-pick" });
      b.toggleClass("is-active", isActive(o));
      b.addEventListener("click", () => {
        onPick(o);
        row.querySelectorAll(".pd-pick").forEach((el) => el.toggleClass("is-active", isActive(el.textContent ?? "")));
      });
    }
    return row;
  }

  private renderField(parent: HTMLElement, field: LogField): void {
    const wrap = this.fieldWrap(parent, field.label, field.kind === "multi" ? "tap to add" : field.hint ?? "");
    if (field.showIf) this.showIfEls.push({ el: wrap, key: field.showIf });
    const v = this.values;

    switch (field.kind) {
      case "text": {
        const input = wrap.createEl("input", { type: "text", cls: "pd-input" });
        input.value = String(v[field.key] ?? "");
        input.addEventListener("input", () => this.set(field.key, input.value));
        if (field.suggest) {
          const sugg = suggestionsFor(this.entries, this.type, field);
          if (sugg.length) this.chipRow(wrap, sugg, (o) => input.value === o, (o) => { input.value = o; this.set(field.key, o); });
        }
        break;
      }
      case "longtext": {
        const ta = wrap.createEl("textarea", { cls: "pd-input pd-textarea" });
        ta.rows = 3;
        ta.value = String(v[field.key] ?? "");
        ta.addEventListener("input", () => this.set(field.key, ta.value));
        break;
      }
      case "number": {
        const input = wrap.createEl("input", { type: "number", cls: "pd-input pd-narrow" });
        input.step = "any";
        input.value = v[field.key] === undefined ? "" : String(v[field.key]);
        input.addEventListener("input", () => {
          const n = parseFloat(input.value);
          this.set(field.key, isNaN(n) ? undefined : n);
        });
        break;
      }
      case "rating": {
        const row = wrap.createDiv({ cls: "pd-chips pd-rating" });
        const label = row.createSpan({ cls: "pd-muted pd-rating-label" });
        const paint = () => {
          const cur = v[field.key] as number | undefined;
          row.querySelectorAll<HTMLElement>(".pd-num").forEach((el) => el.toggleClass("is-active", Number(el.textContent) === cur));
          label.setText(cur ? `${cur} of 10 · ${RATING_LABELS[cur]}` : "");
        };
        for (let i = 1; i <= 10; i++) {
          const b = row.createEl("button", { text: String(i), cls: "pd-num" });
          row.insertBefore(b, label);
          b.addEventListener("click", () => {
            this.set(field.key, v[field.key] === i ? undefined : i);
            paint();
          });
        }
        paint();
        break;
      }
      case "date": {
        const row = wrap.createDiv({ cls: "pd-chips" });
        const today = new Date();
        const input = row.createEl("input", { type: "date", cls: "pd-input pd-date" });
        input.value = String(v[field.key] ?? "");
        const quick: [string, string][] = [["Today", isoDate(today)], ["Yesterday", isoDate(addDays(today, -1))]];
        const paint = () => row.querySelectorAll<HTMLElement>(".pd-pick").forEach((el, i) => el.toggleClass("is-active", v[field.key] === quick[i][1]));
        quick.forEach(([label, iso]) => {
          const b = row.createEl("button", { text: label, cls: "pd-pick" });
          row.insertBefore(b, input);
          b.addEventListener("click", () => { input.value = iso; this.set(field.key, iso); paint(); });
        });
        input.addEventListener("input", () => { this.set(field.key, input.value || undefined); paint(); });
        paint();
        break;
      }
      case "choice": {
        const opts = [...(field.options ?? [])];
        if (field.suggest) for (const s of suggestionsFor(this.entries, this.type, field)) if (!opts.includes(s)) opts.push(s);
        this.chipRow(wrap, opts, (o) => v[field.key] === o, (o) => this.set(field.key, v[field.key] === o ? undefined : o));
        break;
      }
      case "multi": {
        const chosen = new Set<string>(asList(v[field.key]));
        const sugg = field.suggest ? suggestionsFor(this.entries, this.type, field, 12) : [];
        const row = wrap.createDiv({ cls: "pd-chips" });
        const commit = () => this.set(field.key, [...chosen]);
        const addChip = (o: string) => {
          const b = row.createEl("button", { text: o, cls: "pd-pick is-active" });
          row.insertBefore(b, input);
          b.addEventListener("click", () => {
            if (chosen.has(o)) chosen.delete(o); else chosen.add(o);
            b.toggleClass("is-active", chosen.has(o));
            commit();
          });
        };
        const input = row.createEl("input", { type: "text", cls: "pd-input pd-chip-input", attr: { placeholder: "Add another" } });
        for (const s of sugg) { addChip(s); row.querySelectorAll(".pd-pick").forEach((el) => { if (el.textContent === s) el.removeClass("is-active"); }); }
        input.addEventListener("keydown", (e) => {
          if (e.key !== "Enter" || e.isComposing) return;
          e.preventDefault();
          e.stopPropagation();
          const val = input.value.trim();
          if (!val) return;
          if (!sugg.includes(val) && !chosen.has(val)) addChip(val);
          chosen.add(val);
          row.querySelectorAll(".pd-pick").forEach((el) => { if (el.textContent === val) el.addClass("is-active"); });
          input.value = "";
          commit();
        });
        break;
      }
    }
  }

  private built() {
    return buildLogNote(this.type, this.name, this.values, this.body, { now: new Date(), categoryProperty: this.plugin.settings.categoryProperty });
  }

  private updatePreview(): void {
    const b = this.built();
    this.previewEl.setText(b.content);
    const folder = this.plugin.settings.logsFolder;
    this.previewHint.setText(`Will be saved as ${folder ? folder + "/" : ""}${b.filename}. This is the note exactly as it will appear. Nothing is hidden.`);
  }

  private async save(): Promise<void> {
    const t = this.type;
    if (t.titleMode !== "timestamp" && !this.name.trim()) {
      new Notice(`Add a ${t.nameLabel.toLowerCase()} first`);
      return;
    }
    if (t.bodyRequired && !this.body.trim()) {
      new Notice("Write something first");
      return;
    }
    const b = this.built();
    try {
      await this.plugin.saveLog(b.filename, b.content, t);
      this.close();
    } catch (e) {
      new Notice(`Could not save: ${(e as Error).message}`);
    }
  }
}
