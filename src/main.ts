import { Notice, Plugin, TAbstractFile, TFile, WorkspaceLeaf, debounce } from "obsidian";
import { DEFAULT_SETTINGS, DashboardSettings, DashboardSettingTab } from "./settings";
import { NAV, PAGE_TYPES, PageId, VIEW_CHOOSE, VIEW_GARDEN, VIEW_HOME, VIEW_LIBRARY, VIEW_LOGS, VIEW_LOOKBACK, VIEW_OVERVIEW, VIEW_REVIEW, VIEW_SEARCH, VIEW_TASKS, VIEW_WRITE } from "./constants";
import { HomeView } from "./views/homeView";
import { WriteView } from "./views/writeView";
import { SearchView } from "./views/searchView";
import { ReviewView } from "./views/reviewView";
import { LookbackView } from "./views/lookbackView";
import { GardenView } from "./views/gardenView";
import { ChooseView } from "./views/chooseView";
import { LibraryView, LibraryState } from "./views/libraryView";
import { OverviewView } from "./views/overviewView";
import { TasksView } from "./views/tasksView";
import { LogsView } from "./views/logsView";
import { CaptureModal, LogModal } from "./modals";
import { CatNote, FavoriteItem, LogEntry, TaskItem, appendLine, collectFavorites, collectLogs, isExcluded, noteDate, notesInCategory, collectTasks, createUniqueNote, inboxFile, removeLine } from "./store";
import { CaptureMode, describeCapture, formatCaptureLine, parseCapture } from "./parser";
import { toggleLine } from "./tasks";
import { buildQuickNote } from "./notes";
import { LogType } from "./logs";
import { undoNotice } from "./ui";
import { isFlagged } from "./favorites";
import { DecisionModal, LetterModal, LookBackModal } from "./lookbackModals";
import { Outcome, lookBackSection } from "./lookback";
import { isoDate } from "./dates";
import { GardenCandidate, pickGarden } from "./garden";

export default class DashboardPlugin extends Plugin {
  settings!: DashboardSettings;
  private listeners = new Set<() => void>();
  private taskCache: TaskItem[] | null = null;
  private logCache: LogEntry[] | null = null;
  private favCache: FavoriteItem[] | null = null;
  /** Library filters, kept while you move between pages. */
  libraryState: LibraryState = { category: "", groupKey: "", dateKey: "", layout: "list", search: "", monthOffset: 0 };

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_HOME, (leaf) => new HomeView(leaf, this));
    this.registerView(VIEW_TASKS, (leaf) => new TasksView(leaf, this));
    this.registerView(VIEW_LOGS, (leaf) => new LogsView(leaf, this));
    this.registerView(VIEW_WRITE, (leaf) => new WriteView(leaf, this));
    this.registerView(VIEW_SEARCH, (leaf) => new SearchView(leaf, this));
    this.registerView(VIEW_REVIEW, (leaf) => new ReviewView(leaf, this));
    this.registerView(VIEW_LOOKBACK, (leaf) => new LookbackView(leaf, this));
    this.registerView(VIEW_GARDEN, (leaf) => new GardenView(leaf, this));
    this.registerView(VIEW_CHOOSE, (leaf) => new ChooseView(leaf, this));
    this.registerView(VIEW_LIBRARY, (leaf) => new LibraryView(leaf, this));
    this.registerView(VIEW_OVERVIEW, (leaf) => new OverviewView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "Open Home dashboard", () => void this.activateView("home"));
    this.addRibbonIcon("zap", "Quick capture", () => this.openCaptureModal());

    for (const n of NAV) this.addCommand({ id: `open-${n.id}`, name: `Open ${n.label}`, callback: () => void this.activateView(n.id) });
    this.addCommand({
      id: "show-overview",
      name: "Show overview of this note",
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f || f.extension !== "md") return false;
        if (!checking) {
          const leaf = this.app.workspace.getLeaf("tab");
          void leaf.setViewState({ type: VIEW_OVERVIEW, active: true, state: { path: f.path } });
        }
        return true;
      },
    });
    this.addCommand({ id: "quick-capture", name: "Quick capture", callback: () => this.openCaptureModal() });
    this.addCommand({ id: "log-something", name: "Log something", callback: () => this.openLogModal() });
    this.addCommand({ id: "log-thought", name: "Log a thought", callback: () => this.openLogModal("thought") });
    this.addCommand({
      id: "toggle-favorite",
      name: "Toggle favorite for this note or canvas",
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return false;
        if (!checking) void this.toggleFavorite(f);
        return true;
      },
    });
    this.addCommand({ id: "write-letter", name: "Write to future me", callback: () => this.openLetterModal() });
    this.addCommand({ id: "log-decision", name: "Log a decision", callback: () => this.openDecisionModal() });
    this.addCommand({ id: "open-inbox", name: "Open inbox note", callback: () => void this.openInbox() });
    // One command per log type, so each can have its own hotkey.
    for (const t of this.settings.logTypes) {
      this.addCommand({ id: `log-${t.id}`, name: `Log: ${t.label}`, callback: () => this.openLogModal(t.id) });
    }

    this.addSettingTab(new DashboardSettingTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile)) return;
        const on = this.isFavorite(file);
        menu.addItem((item) =>
          item.setTitle(on ? "Remove from favorites" : "Add to favorites").setIcon("star").onClick(() => void this.toggleFavorite(file)),
        );
      }),
    );

    // Keep non-note favorites (canvases etc.) pointing at the right file.
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        const i = this.settings.favoriteFiles.indexOf(oldPath);
        if (i >= 0) {
          this.settings.favoriteFiles[i] = f.path;
          void this.saveSettings();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        if (this.settings.favoriteFiles.includes(f.path)) {
          this.settings.favoriteFiles = this.settings.favoriteFiles.filter((p) => p !== f.path);
          void this.saveSettings();
        }
      }),
    );

    const changed = debounce(() => this.invalidate(), 400, true);
    const onFile = (f: TAbstractFile) => { if (f instanceof TFile && f.extension === "md") changed(); };
    this.registerEvent(this.app.metadataCache.on("changed", onFile));
    this.registerEvent(this.app.vault.on("delete", onFile));
    this.registerEvent(this.app.vault.on("rename", onFile));
    this.registerEvent(this.app.vault.on("create", onFile));
  }

  onunload(): void {
    this.listeners.clear();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<DashboardSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    if (this.settings.libraryState) Object.assign(this.libraryState, this.settings.libraryState);
    if (!Array.isArray(this.settings.logTypes) || !this.settings.logTypes.length) {
      this.settings.logTypes = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.logTypes));
    }
  }

  /** Remembers how the Library was set up. Does not refresh anything. */
  persistLibrary(): void {
    const { category, groupKey, dateKey, layout } = this.libraryState;
    this.settings.libraryState = { category, groupKey, dateKey, layout };
    void this.saveData(this.settings);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.invalidate();
  }

  // ---- data access -------------------------------------------------------

  onDataChanged(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  invalidate(): void {
    this.taskCache = null;
    this.logCache = null;
    this.favCache = null;
    for (const fn of this.listeners) fn();
  }

  getLogs(): LogEntry[] {
    return (this.logCache ??= collectLogs(this.app, this.settings));
  }

  /** Words saved from Write on a given day (YYYY-MM-DD). */
  getWordsOn(date: string): number {
    return notesInCategory(this.app, this.settings, this.settings.writeCategory)
      .filter((n) => n.date === date)
      .reduce((sum, n) => sum + (typeof n.fm["words"] === "number" ? (n.fm["words"] as number) : 0), 0);
  }

  /** Notes marked status: draft (or draft: true), newest first. */
  getDrafts(): CatNote[] {
    const out: CatNote[] = [];
    const sealed = this.sealedPaths();
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (isExcluded(file, this.settings) || sealed.has(file.path)) continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
      if (!fm) continue;
      if (String(fm["status"] ?? "").toLowerCase() === "draft" || isFlagged(fm["draft"])) out.push({ file, fm, date: noteDate(fm, file) });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  getFavorites(): FavoriteItem[] {
    const sealed = this.sealedPaths();
    return (this.favCache ??= collectFavorites(this.app, this.settings)).filter((f) => !sealed.has(f.file.path));
  }

  async getTasks(): Promise<TaskItem[]> {
    if (!this.taskCache) this.taskCache = await collectTasks(this.app, this.settings);
    const sealed = this.sealedPaths();
    return sealed.size ? this.taskCache.filter((t) => !sealed.has(t.file.path)) : this.taskCache;
  }

  /** Letters to future you that have not arrived yet. The dashboard never shows their text. */
  sealedPaths(): Set<string> {
    const today = isoDate(new Date());
    return new Set(this.getLetters().filter((l) => l.deliver > today).map((l) => l.file.path));
  }

  // ---- navigation --------------------------------------------------------

  async activateView(which: PageId): Promise<void> {
    const type = PAGE_TYPES[which];
    const existing = this.app.workspace.getLeavesOfType(type)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  /** Switches a dashboard tab to another page, in the same tab. */
  async navigate(leaf: WorkspaceLeaf, which: PageId, state?: Record<string, unknown>): Promise<void> {
    await leaf.setViewState({ type: PAGE_TYPES[which], active: true, state });
  }

  async openFile(file: TFile, line?: number): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, line === undefined ? undefined : { eState: { line } });
  }

  async openInbox(): Promise<void> {
    const f = inboxFile(this.app, this.settings);
    if (!f) {
      new Notice(`There is no inbox yet. Capture something and ${this.settings.inboxPath} will be created.`);
      return;
    }
    await this.openFile(f);
  }

  openCaptureModal(): void {
    new CaptureModal(this.app, this).open();
  }

  openLogModal(typeId?: string): void {
    new LogModal(this.app, this, typeId).open();
  }

  openLetterModal(replyTo?: TFile): void {
    new LetterModal(this.app, this, replyTo).open();
  }

  openDecisionModal(): void {
    new DecisionModal(this.app, this).open();
  }

  async openLookBack(file: TFile): Promise<void> {
    const text = (await this.app.vault.cachedRead(file)).replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/\s+/g, " ").trim();
    new LookBackModal(this.app, this, file, text.length > 260 ? text.slice(0, 260) + "..." : text).open();
  }

  // ---- garden --------------------------------------------------------------

  private gardenSkipped(file: TFile): boolean {
    const skip = [this.settings.excludeFolders, this.settings.gardenExcludeFolders]
      .join(",")
      .split(",")
      .map((x) => x.trim().replace(/^\/+|\/+$/g, ""))
      .filter(Boolean);
    return file.path === this.settings.inboxPath || skip.some((f) => file.path.startsWith(f + "/"));
  }

  /** How many notes could be brought back, and which ones are shown today. */
  gardenToday(count: number, shuffle = 0): { picks: TFile[]; waiting: number } {
    const sealed = this.sealedPaths();
    const files = this.app.vault.getMarkdownFiles().filter((f) => !this.gardenSkipped(f) && !sealed.has(f.path));
    const byPath = new Map(files.map((f) => [f.path, f]));
    const cands: GardenCandidate[] = files.map((f) => ({ path: f.path, mtime: f.stat.mtime, size: f.stat.size }));
    const base = { nowMs: Date.now(), todayIso: isoDate(new Date()), days: this.settings.gardenDays, snoozed: this.settings.gardenSnoozed };
    const waiting = pickGarden(cands, { ...base, count: cands.length, seed: "all" }).length;
    const picks = pickGarden(cands, { ...base, count, seed: `${base.todayIso}#${shuffle}` }).map((c) => byPath.get(c.path)!);
    return { picks, waiting };
  }

  /** Hides a note from the Garden until a date, or for good. Only this plugin's settings change. */
  async snoozeGarden(file: TFile, until: string): Promise<void> {
    const prev = this.settings.gardenSnoozed[file.path];
    this.settings.gardenSnoozed = { ...this.settings.gardenSnoozed, [file.path]: until };
    await this.saveSettings();
    undoNotice(until === "never" ? `${file.basename} won't come back.` : `${file.basename} will come back later.`, async () => {
      const next = { ...this.settings.gardenSnoozed };
      if (prev) next[file.path] = prev; else delete next[file.path];
      this.settings.gardenSnoozed = next;
      await this.saveSettings();
    });
  }

  // ---- letters and decisions ----------------------------------------------

  /** Letters written to future you. `deliver` is the date they come back. */
  getLetters(): { file: TFile; deliver: string; written: string; kept: boolean }[] {
    return notesInCategory(this.app, this.settings, this.settings.letterCategory)
      .map((n) => ({ file: n.file, deliver: String(n.fm["deliver"] ?? "").slice(0, 10), written: n.date, kept: isFlagged(n.fm["kept"]) }))
      .filter((l) => /^\d{4}-\d{2}-\d{2}$/.test(l.deliver))
      .sort((a, b) => a.deliver.localeCompare(b.deliver));
  }

  getDecisions(): { file: TFile; status: string; lookback: string; decided: string; outcome?: string }[] {
    return notesInCategory(this.app, this.settings, this.settings.decisionCategory)
      .map((n) => ({
        file: n.file,
        status: String(n.fm["status"] ?? "open").toLowerCase(),
        lookback: String(n.fm["lookback"] ?? "").slice(0, 10),
        decided: String(n.fm["decided"] ?? n.date).slice(0, 10),
        outcome: n.fm["outcome"] ? String(n.fm["outcome"]) : undefined,
      }))
      .sort((a, b) => a.lookback.localeCompare(b.lookback));
  }

  /** Hides an arrived letter from Home. Sets kept: true on that one note. */
  async keepLetter(file: TFile): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (fm) => { fm["kept"] = true; });
    undoNotice(`Kept ${file.basename}.`, async () => {
      await this.app.fileManager.processFrontMatter(file, (fm) => { delete fm["kept"]; });
    });
  }

  /** Records how a decision turned out. One note changes, and Undo puts it back exactly. */
  async applyLookBack(file: TFile, outcome: Outcome, text: string, askAgain?: string): Promise<void> {
    const before = await this.app.vault.read(file);
    const today = isoDate(new Date());
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (askAgain) fm["lookback"] = askAgain;
      else { fm["status"] = "reviewed"; fm["outcome"] = outcome; fm["reviewed"] = today; }
    });
    if (text.trim() || !askAgain) await this.app.vault.process(file, (d) => d.replace(/\n*$/, "\n") + lookBackSection(today, outcome, text));
    const after = await this.app.vault.read(file);
    undoNotice(askAgain ? "Will ask again later." : `Saved: ${outcome}.`, async () => {
      if ((await this.app.vault.read(file)) !== after) throw new Error("the note has changed since");
      await this.app.vault.modify(file, before);
    });
  }

  // ---- actions that write -----------------------------------------------

  /** Adds one line to the inbox note. Returns true if it was saved. */
  async capture(input: string, mode: CaptureMode): Promise<boolean> {
    const now = new Date();
    const parsed = parseCapture(input, now, mode);
    if (!parsed.text) return false;
    const line = formatCaptureLine(parsed, now);
    try {
      const file = await appendLine(this.app, this.settings, line);
      undoNotice(`Added to ${file.basename} (${describeCapture(parsed, now).join(", ")}).`, async () => {
        if (!(await removeLine(this.app, file, line))) throw new Error("the line has changed since");
      });
      return true;
    } catch (e) {
      new Notice(`Could not capture: ${(e as Error).message}`);
      return false;
    }
  }

  /** Creates a new note from Home and opens it in a new tab so you can keep writing. */
  async createQuickNote(title: string, body: string): Promise<boolean> {
    if (!title.trim() && !body.trim()) return false;
    const n = buildQuickNote(title, body, new Date());
    try {
      const file = await this.createNote(n.filename, n.content);
      await this.app.workspace.getLeaf("tab").openFile(file);
      return true;
    } catch (e) {
      new Notice(`Could not create the note: ${(e as Error).message}`);
      return false;
    }
  }

  /** Creates a new note in the notes folder, with Undo. Never touches an existing note. */
  async createNote(filename: string, content: string): Promise<TFile> {
    const file = await createUniqueNote(this.app, this.settings.logsFolder, filename, content);
    undoNotice(`Saved ${file.basename}.`, async () => {
      await this.app.fileManager.trashFile(file);
    });
    return file;
  }

  async saveLog(filename: string, content: string, _type: LogType): Promise<TFile> {
    return this.createNote(filename, content);
  }

  /** Ticks or unticks one task line, checking that the line is still where we expect. */
  async toggleTask(t: TaskItem): Promise<void> {
    const now = new Date();
    let before = "";
    let after = "";
    let found = false;
    await this.app.vault.process(t.file, (data) => {
      const lines = data.split("\n");
      const norm = (s: string) => s.replace(/\r$/, "");
      let idx = norm(lines[t.line] ?? "") === t.raw ? t.line : lines.findIndex((l) => norm(l) === t.raw);
      if (idx < 0) return data;
      before = lines[idx];
      after = toggleLine(before, now);
      lines[idx] = after;
      found = true;
      return lines.join("\n");
    });
    if (!found) {
      new Notice("That note changed. Refreshing the list.");
      this.invalidate();
      return;
    }
    const wasOpen = !/\[[xX]\]/.test(before);
    undoNotice(wasOpen ? "Marked as done." : "Marked as not done.", async () => {
      let ok = false;
      await this.app.vault.process(t.file, (data) => {
        const lines = data.split("\n");
        const idx = lines.findIndex((l) => l.replace(/\r$/, "") === after.replace(/\r$/, ""));
        if (idx < 0) return data;
        lines[idx] = before;
        ok = true;
        return lines.join("\n");
      });
      if (!ok) throw new Error("the task has changed since");
    });
  }

  isFavorite(file: TFile): boolean {
    if (file.extension !== "md") return this.settings.favoriteFiles.includes(file.path);
    return isFlagged(this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.settings.favoriteProperty]);
  }

  /** Canvases and other non-note files have no properties, so their favorites are remembered in the plugin's settings. */
  private async toggleFavoriteFile(file: TFile): Promise<void> {
    const had = this.settings.favoriteFiles.includes(file.path);
    const set = async (on: boolean) => {
      const rest = this.settings.favoriteFiles.filter((p) => p !== file.path);
      this.settings.favoriteFiles = on ? [...rest, file.path] : rest;
      await this.saveSettings();
    };
    await set(!had);
    undoNotice(had ? `Removed ${file.basename} from favorites.` : `Added ${file.basename} to favorites.`, () => set(had));
  }

  /** Flags or unflags one note by changing only its favorite property. Undo restores it. */
  async toggleFavorite(file: TFile): Promise<void> {
    if (file.extension !== "md") return this.toggleFavoriteFile(file);
    const prop = this.settings.favoriteProperty;
    let nowOn = false;
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (isFlagged(fm[prop])) {
          delete fm[prop];
          nowOn = false;
        } else {
          fm[prop] = true;
          nowOn = true;
        }
      });
    } catch (e) {
      new Notice(`Could not change favorite: ${(e as Error).message}`);
      return;
    }
    undoNotice(nowOn ? `Added ${file.basename} to favorites.` : `Removed ${file.basename} from favorites.`, async () => {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (nowOn) delete fm[prop];
        else fm[prop] = true;
      });
    });
  }
}
