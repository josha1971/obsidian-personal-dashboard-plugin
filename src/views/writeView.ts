import { Notice, TFile, WorkspaceLeaf, setTooltip } from "obsidian";
import type DashboardPlugin from "../main";
import { DashView } from "./base";
import { VIEW_WRITE } from "../constants";
import { isoDate, pad, friendlyDate } from "../dates";
import { buildNoteText, raw, wikilink, wordCount } from "../notes";
import { safeFileName } from "../logs";
import { isExcluded } from "../store";
import { iconButton, sectionCard } from "../ui";

const FALLBACK_PROMPTS = [
  "What did I avoid doing this week, and why?",
  "What would make tomorrow feel like a good day?",
  "What am I curious about right now?",
  "Describe something small that went well today.",
  "What am I carrying that I could put down?",
  "What do I want more of in my life? Less of?",
  "Write about a place you'd like to be right now.",
  "What did I learn recently that surprised me?",
  "Who do I owe a message to, and what would I say?",
  "What would I tell myself a year ago?",
];

interface Prompt { text: string; source?: TFile }

const DRAFT_KEY = "personal-dashboard-write-draft";

export class WriteView extends DashView {
  private title = "";
  private text = "";
  private prompt: Prompt | null = null;
  private pool: Prompt[] | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: DashboardPlugin) { super(leaf, plugin); }
  getViewType() { return VIEW_WRITE; }
  getDisplayText() { return "Write"; }
  getIcon() { return "pencil"; }

  async onOpen(): Promise<void> {
    try {
      const saved = JSON.parse((this.app.loadLocalStorage(DRAFT_KEY) as string | null) ?? "null");
      if (saved) { this.title = saved.title ?? ""; this.text = saved.text ?? ""; }
    } catch { /* no saved draft */ }
    await super.onOpen();
  }

  private persist(): void {
    try { this.app.saveLocalStorage(DRAFT_KEY, this.text || this.title ? JSON.stringify({ title: this.title, text: this.text }) : null); } catch { /* ignore */ }
  }

  protected async render(isCurrent: () => boolean): Promise<void> {
    const el = this.contentEl;
    // Keep what is being typed if a refresh arrives mid-sentence.
    const scroll = el.scrollTop;
    el.empty();
    this.renderNav(el);
    const s = this.plugin.settings;

    const head = el.createDiv({ cls: "pd-page-head" });
    const t = head.createDiv();
    t.createDiv({ cls: "pd-kicker", text: "Freewrite. Nothing to organise" });
    t.createEl("h1", { cls: "pd-title", text: "Write" });
    const goal = head.createDiv({ cls: "pd-goal" });

    const cols = el.createDiv({ cls: "pd-writecols" });
    const main = cols.createDiv({ cls: "pd-writemain" });
    const side = cols.createDiv({ cls: "pd-writeside" });

    const title = main.createEl("input", { type: "text", cls: "pd-input", attr: { placeholder: "Title (optional, the date is added for you)" } });
    title.value = this.title;
    const area = main.createEl("textarea", { cls: "pd-input pd-freewrite", attr: { placeholder: "Start writing. It saves as a new note only when you press Save." } });
    area.value = this.text;
    const foot = main.createDiv({ cls: "pd-footer" });
    const count = foot.createSpan({ cls: "pd-muted pd-grow" });

    const wordsToday = this.plugin.getWordsOn(isoDate(new Date()));
    const paint = () => {
      const w = wordCount(this.text);
      count.setText(`${w} ${w === 1 ? "word" : "words"} in this draft`);
      const total = wordsToday + w;
      goal.empty();
      goal.createDiv({ cls: "pd-muted", text: `${total} / ${s.writeGoal} words today` });
      const bar = goal.createDiv({ cls: "pd-progress" });
      bar.createDiv({ cls: "pd-progress-fill" }).style.width = `${Math.min(100, Math.round((total / s.writeGoal) * 100))}%`;
    };
    paint();
    title.addEventListener("input", () => { this.title = title.value; this.persist(); });
    area.addEventListener("input", () => { this.text = area.value; this.persist(); paint(); });

    const save = (draft: boolean) => async () => {
      if (!this.text.trim()) { new Notice("Write something first"); return; }
      const now = new Date();
      const base = safeFileName(this.title) || "Freewrite";
      const stamp = `${isoDate(now)} ${pad(now.getHours())}${pad(now.getMinutes())}`;
      const content = buildNoteText(
        [
          ["created", raw(`${isoDate(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)],
          [s.categoryProperty, [wikilink(s.writeCategory)]],
          ["date", raw(isoDate(now))],
          ["words", wordCount(this.text)],
          ["status", draft ? "draft" : undefined],
        ],
        this.text,
      );
      await this.plugin.createNote(`${base} ${stamp}.md`, content);
      this.title = ""; this.text = ""; this.persist();
      void this.refresh();
    };
    const sb = iconButton(foot, "save", "Save note", () => void save(false)(), "mod-cta");
    setTooltip(sb, "Creates a new note. Nothing existing is changed", { delay: 300 });
    const db = iconButton(foot, "file-clock", "Save as draft", () => void save(true)());
    setTooltip(db, "Same, but marks it status: draft so it shows under Unfinished drafts", { delay: 300 });
    window.setTimeout(() => area.focus(), 30);

    // Prompt
    const pc = sectionCard(side, "Need a prompt?", "from your own notes", "pd-tone-green");
    const pbody = pc.body.createDiv({ cls: "pd-prompt" });
    const showPrompt = () => {
      pbody.empty();
      if (!this.prompt) { pbody.createDiv({ cls: "pd-muted", text: "Press the button for a question to write about." }); return; }
      pbody.createDiv({ text: this.prompt.text, cls: "pd-prompt-text" });
      if (this.prompt.source) {
        const src = this.prompt.source;
        const a = pbody.createDiv({ text: `From ${src.basename}`, cls: "pd-muted is-clickable" });
        a.addEventListener("click", () => void this.plugin.openFile(src));
      }
    };
    showPrompt();
    const pb = iconButton(pc.body, "dices", "Give me a prompt", async () => { this.prompt = await this.nextPrompt(); showPrompt(); });
    setTooltip(pb, "Picks a question or heading from your own notes, or a built-in one", { delay: 300 });

    // Drafts
    const drafts = this.plugin.getDrafts();
    const dc = sectionCard(side, "Unfinished drafts", drafts.length ? `${drafts.length}` : "", "pd-tone-gold");
    if (!drafts.length) dc.body.createDiv({ cls: "pd-empty", text: "None. A note with status: draft appears here." });
    for (const d of drafts.slice(0, 12)) {
      const row = dc.body.createDiv({ cls: "pd-logrow" });
      const n = row.createSpan({ text: d.file.basename, cls: "pd-logrow-name" });
      n.addEventListener("click", () => void this.plugin.openFile(d.file));
      row.createSpan({ text: friendlyDate(d.date, new Date()), cls: "pd-muted pd-logrow-date" });
    }
    if (!isCurrent()) return;
    el.scrollTop = scroll;
  }

  private async nextPrompt(): Promise<Prompt> {
    if (!this.pool) {
      this.pool = [];
      const sealed = this.plugin.sealedPaths();
      const files = this.app.vault.getMarkdownFiles().filter((f) => !isExcluded(f, this.plugin.settings) && !sealed.has(f.path));
      for (let i = files.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [files[i], files[j]] = [files[j], files[i]]; }
      for (const f of files.slice(0, 80)) {
        const text = await this.app.vault.cachedRead(f);
        for (const line of text.replace(/^---\n[\s\S]*?\n---\n?/, "").split("\n")) {
          const l = line.replace(/^[#>\-*\s]+/, "").trim();
          if (l.length >= 15 && l.length <= 140 && l.endsWith("?")) this.pool.push({ text: l, source: f });
        }
      }
    }
    const all = [...this.pool, ...FALLBACK_PROMPTS.map((text) => ({ text }))];
    const pickFrom = this.pool.length && Math.random() < 0.8 ? this.pool : all;
    return pickFrom[Math.floor(Math.random() * pickFrom.length)];
  }
}
