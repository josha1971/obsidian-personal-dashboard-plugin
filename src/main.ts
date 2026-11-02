import { Notice, Plugin, TAbstractFile, TFile, debounce } from "obsidian";
import { DEFAULT_SETTINGS, DashboardSettings, DashboardSettingTab } from "./settings";
import { VIEW_HOME, VIEW_LOGS, VIEW_TASKS } from "./constants";
import { HomeView } from "./views/homeView";
import { TasksView } from "./views/tasksView";
import { LogsView } from "./views/logsView";
import { CaptureModal, LogModal } from "./modals";
import { LogEntry, TaskItem, appendLine, collectLogs, collectTasks, createUniqueNote, inboxFile, removeLine } from "./store";
import { CaptureMode, describeCapture, formatCaptureLine, parseCapture } from "./parser";
import { toggleLine } from "./tasks";
import { LogType } from "./logs";
import { undoNotice } from "./ui";

export default class DashboardPlugin extends Plugin {
  settings!: DashboardSettings;
  private listeners = new Set<() => void>();
  private taskCache: TaskItem[] | null = null;
  private logCache: LogEntry[] | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_HOME, (leaf) => new HomeView(leaf, this));
    this.registerView(VIEW_TASKS, (leaf) => new TasksView(leaf, this));
    this.registerView(VIEW_LOGS, (leaf) => new LogsView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "Open Home dashboard", () => void this.activateView("home"));
    this.addRibbonIcon("zap", "Quick capture", () => this.openCaptureModal());

    this.addCommand({ id: "open-home", name: "Open Home", callback: () => void this.activateView("home") });
    this.addCommand({ id: "open-tasks", name: "Open Tasks", callback: () => void this.activateView("tasks") });
    this.addCommand({ id: "open-logs", name: "Open Logs", callback: () => void this.activateView("logs") });
    this.addCommand({ id: "quick-capture", name: "Quick capture", callback: () => this.openCaptureModal() });
    this.addCommand({ id: "log-something", name: "Log something", callback: () => this.openLogModal() });
    this.addCommand({ id: "log-thought", name: "Log a thought", callback: () => this.openLogModal("thought") });
    this.addCommand({ id: "open-inbox", name: "Open inbox note", callback: () => void this.openInbox() });
    // One command per log type, so each can have its own hotkey.
    for (const t of this.settings.logTypes) {
      this.addCommand({ id: `log-${t.id}`, name: `Log: ${t.label}`, callback: () => this.openLogModal(t.id) });
    }

    this.addSettingTab(new DashboardSettingTab(this.app, this));

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
    if (!Array.isArray(this.settings.logTypes) || !this.settings.logTypes.length) {
      this.settings.logTypes = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.logTypes));
    }
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
    for (const fn of this.listeners) fn();
  }

  getLogs(): LogEntry[] {
    return (this.logCache ??= collectLogs(this.app, this.settings));
  }

  async getTasks(): Promise<TaskItem[]> {
    if (!this.taskCache) this.taskCache = await collectTasks(this.app, this.settings);
    return this.taskCache;
  }

  // ---- navigation --------------------------------------------------------

  async activateView(which: "home" | "tasks" | "logs"): Promise<void> {
    const type = which === "home" ? VIEW_HOME : which === "tasks" ? VIEW_TASKS : VIEW_LOGS;
    const existing = this.app.workspace.getLeavesOfType(type)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
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

  /** Creates a new log note. Never touches an existing one. */
  async saveLog(filename: string, content: string, type: LogType): Promise<TFile> {
    const file = await createUniqueNote(this.app, this.settings.logsFolder, filename, content);
    undoNotice(`Saved ${file.basename}.`, async () => {
      await this.app.fileManager.trashFile(file);
    });
    return file;
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
}
