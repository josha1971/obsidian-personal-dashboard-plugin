import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { DashboardSettings } from "./settings";
import type { LogType } from "./logs";
import { TaskInfo, parseTaskLine } from "./tasks";
import { isoDate, parseISODate } from "./dates";
import { insertCaptureLine } from "./parser";
import { isFlagged } from "./favorites";

type Frontmatter = Record<string, unknown>;

export interface TaskItem {
  file: TFile;
  line: number;
  raw: string;
  info: TaskInfo;
  fm: Frontmatter | undefined;
}

export interface LogEntry {
  file: TFile;
  type: LogType;
  /** YYYY-MM-DD, from the date property, else created, else the file's creation time. */
  date: string;
  rating?: number;
  /** Short summary of the main fields, e.g. "Italian · Old Town". */
  detail: string;
  fm: Frontmatter;
}

export interface FavoriteItem {
  file: TFile;
  /** The note's first category, e.g. "Books". */
  category?: string;
}

export interface InboxItem {
  text: string;
  isTask: boolean;
  /** YYYY-MM-DD when the item says when it was captured. */
  added?: string;
}

export function excludedFolders(settings: DashboardSettings): string[] {
  return settings.excludeFolders
    .split(",")
    .map((s) => s.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
}

export function isExcluded(file: TFile, settings: DashboardSettings): boolean {
  return excludedFolders(settings).some((f) => file.path.startsWith(f + "/"));
}

/** "[[Folder/Books|Alias]]" -> "Books" */
export function linkTarget(v: unknown): string {
  return String(v ?? "")
    .replace(/^\[\[|\]\]$/g, "")
    .split("|")[0]
    .split("#")[0]
    .split("/")
    .pop()!
    .trim();
}

export function asList(v: unknown): string[] {
  if (v === undefined || v === null || v === "") return [];
  return (Array.isArray(v) ? v : [v]).map((x) => String(x));
}

function frontmatterOf(app: App, file: TFile): Frontmatter | undefined {
  return app.metadataCache.getFileCache(file)?.frontmatter as Frontmatter | undefined;
}

export function collectLogs(app: App, settings: DashboardSettings): LogEntry[] {
  const out: LogEntry[] = [];
  const types = settings.logTypes;
  for (const file of app.vault.getMarkdownFiles()) {
    if (isExcluded(file, settings)) continue;
    const fm = frontmatterOf(app, file);
    if (!fm) continue;
    const cats = [...asList(fm[settings.categoryProperty]), ...asList(fm["categories"])].map((c) => linkTarget(c).toLowerCase());
    if (!cats.length) continue;
    const type = types.find((t) => cats.includes(t.category.toLowerCase()));
    if (!type) continue;

    const rawDate = String(fm["date"] ?? "") || String(fm["created"] ?? "");
    const date = parseISODate(rawDate) ? rawDate.slice(0, 10) : isoDate(new Date(file.stat.ctime));
    const rating = typeof fm["rating"] === "number" ? (fm["rating"] as number) : undefined;
    const detail = type.fields
      .filter((f) => ["text", "choice", "multi"].includes(f.kind) && f.key !== "why")
      .flatMap((f) => asList(fm[f.key]).map(linkTarget))
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ");
    out.push({ file, type, date, rating, detail, fm });
  }
  return out;
}

/** Notes flagged as favorites. Not limited by the ignored folders, so category pages can be favorites too. */
export function collectFavorites(app: App, settings: DashboardSettings): FavoriteItem[] {
  const out: FavoriteItem[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = frontmatterOf(app, file);
    if (!fm || !isFlagged(fm[settings.favoriteProperty])) continue;
    const cat = [...asList(fm[settings.categoryProperty]), ...asList(fm["categories"])].map(linkTarget).find(Boolean);
    out.push({ file, category: cat });
  }
  return out.sort((a, b) => a.file.basename.localeCompare(b.file.basename));
}

export async function collectTasks(app: App, settings: DashboardSettings): Promise<TaskItem[]> {
  const out: TaskItem[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (isExcluded(file, settings)) continue;
    const cache = app.metadataCache.getFileCache(file);
    if (!cache?.listItems?.some((li) => li.task !== undefined)) continue;
    const lines = (await app.vault.cachedRead(file)).split("\n");
    for (const li of cache.listItems) {
      if (li.task === undefined) continue;
      const line = li.position.start.line;
      const raw = (lines[line] ?? "").replace(/\r$/, "");
      const info = parseTaskLine(raw);
      if (info) out.push({ file, line, raw, info, fm: cache.frontmatter as Frontmatter | undefined });
    }
  }
  return out;
}

export function inboxFile(app: App, settings: DashboardSettings): TFile | null {
  const f = app.vault.getAbstractFileByPath(normalizePath(settings.inboxPath));
  return f instanceof TFile ? f : null;
}

export async function readInbox(app: App, settings: DashboardSettings): Promise<InboxItem[]> {
  const file = inboxFile(app, settings);
  if (!file) return [];
  const body = (await app.vault.cachedRead(file)).replace(/^---\n[\s\S]*?\n---\n?/, "");
  const items: InboxItem[] = [];
  for (const line of body.split("\n")) {
    const task = /^\s*[-*+]\s+\[ \]\s+(.*)$/.exec(line);
    if (task) {
      const info = parseTaskLine(line);
      items.push({ text: info?.text ?? task[1], isTask: true, added: info?.created });
      continue;
    }
    const note = /^\s*[-*+]\s+(?!\[.\])(.+)$/.exec(line);
    if (note) {
      const stamp = /^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+(.*)$/.exec(note[1]);
      items.push({ text: stamp ? stamp[2] : note[1], isTask: false, added: stamp?.[1] });
    }
  }
  return items;
}

export async function ensureFolder(app: App, path: string): Promise<void> {
  const clean = normalizePath(path);
  if (!clean || clean === "/") return;
  if (app.vault.getAbstractFileByPath(clean) instanceof TFolder) return;
  const parent = clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : "";
  if (parent) await ensureFolder(app, parent);
  await app.vault.createFolder(clean);
}

/** Creates a new note, adding " 2", " 3"... when the name is taken. Never overwrites. */
export async function createUniqueNote(app: App, folder: string, filename: string, content: string): Promise<TFile> {
  await ensureFolder(app, folder);
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : ".md";
  const prefix = folder ? `${folder}/` : "";
  let n = 1;
  let path = normalizePath(`${prefix}${stem}${ext}`);
  while (app.vault.getAbstractFileByPath(path)) {
    n += 1;
    path = normalizePath(`${prefix}${stem} ${n}${ext}`);
  }
  return app.vault.create(path, content);
}

export async function appendLine(app: App, settings: DashboardSettings, line: string): Promise<TFile> {
  const path = normalizePath(settings.inboxPath);
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.process(existing, (data) => insertCaptureLine(data, line, settings.capturePosition));
    return existing;
  }
  const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  await ensureFolder(app, folder);
  return app.vault.create(path, line + "\n");
}

/** Removes the last exact copy of a line (used by Undo). Returns whether it was found. */
export async function removeLine(app: App, file: TFile, line: string): Promise<boolean> {
  let found = false;
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].replace(/\r$/, "") === line) {
        lines.splice(i, 1);
        found = true;
        break;
      }
    }
    return found ? lines.join("\n") : data;
  });
  return found;
}
