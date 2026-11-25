// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { Modal, Notice, TFile, installDomHelpers } from "./obsidian-mock";
import DashboardPlugin from "../src/main";
import { addDays, isoDate } from "../src/dates";
import { LogModal, QuickThoughtModal } from "../src/modals";
import { readInbox } from "../src/store";
import { DecisionModal, LetterModal } from "../src/lookbackModals";

installDomHelpers();

const day = (n: number) => isoDate(addDays(new Date(), n));
const DAY = 86400000;

interface Fx { file: TFile; content: string; fm?: Record<string, unknown> }

function makeApp() {
  const files = new Map<string, Fx>();
  const add = (path: string, content: string, fm?: Record<string, unknown>, ageDays = 0) => {
    const f = new TFile(path);
    f.stat.mtime = Date.now() - ageDays * DAY;
    f.stat.ctime = f.stat.mtime;
    f.stat.size = content.length;
    files.set(path, { file: f, content, fm });
    return f;
  };
  const cache = (f: TFile) => {
    const fx = files.get(f.path);
    if (!fx || f.extension !== "md") return null;
    const listItems = fx.content.split("\n").flatMap((l, i) => { const m = /^\s*[-*] \[(.)\]/.exec(l); return m ? [{ task: m[1], position: { start: { line: i } } }] : []; });
    return { frontmatter: fx.fm, listItems, tags: [] as { tag: string }[] };
  };
  const app: any = {
    files,
    opened: [] as string[],
    vault: {
      getFiles: () => [...files.values()].map((x) => x.file),
      getMarkdownFiles: () => [...files.values()].map((x) => x.file).filter((f) => f.extension === "md"),
      getAbstractFileByPath: (p: string) => files.get(p)?.file ?? null,
      getFileByPath: (p: string) => files.get(p)?.file ?? null,
      cachedRead: async (f: TFile) => files.get(f.path)!.content,
      read: async (f: TFile) => files.get(f.path)!.content,
      modify: async (f: TFile, c: string) => { files.get(f.path)!.content = c; },
      process: async (f: TFile, fn: (d: string) => string) => { const fx = files.get(f.path)!; fx.content = fn(fx.content); return fx.content; },
      create: async (p: string, c: string) => add(p, c, {}),
      createFolder: async () => {},
      on: () => ({}),
    },
    metadataCache: {
      getFileCache: cache, resolvedLinks: {} as Record<string, Record<string, number>>,
      getFirstLinkpathDest: (n: string) => [...files.values()].map((x) => x.file).find((f) => f.basename === n) ?? null,
      on: () => ({}),
    },
    fileManager: {
      processFrontMatter: async (f: TFile, fn: (fm: any) => void) => { const fx = files.get(f.path)!; fx.fm = fx.fm ?? {}; fn(fx.fm); },
      trashFile: async (f: TFile) => { files.delete(f.path); },
    },
    workspace: { getLeavesOfType: () => [], getLeaf: () => ({ openFile: async (f: TFile) => { app.opened.push(f.path); }, setViewState: async () => {} }), revealLeaf() {}, getActiveFile: () => null, on: () => ({}) },
    commands: { executeCommandById: () => true },
    loadLocalStorage: () => null,
    saveLocalStorage: () => {},
  };
  return { app, add, files };
}

async function setup() {
  const { app, add, files } = makeApp();
  add("Inbox.md", "- 2026-10-01 09:00 old thought\n- [ ] sort photos ➕ 2026-10-01\n");
  add("Plans/Autumn market stall.md", "A table at the market.\n- [ ] Stall price list 📅 " + day(-2) + " ⏫ ~30m\n- [x] Banner ✅ " + day(0) + "\n", { category: ["[[Projects]]"], status: "In progress", created: day(-60), favorite: true, topics: ["Baking"] }, 40);
  add("Pine & Plum.md", "---\n---\nOrder the gnocchi.\n", { category: ["[[Places]]"], kind: "Restaurant", area: "Old Town", cuisine: "Italian", rating: 9, cost: 48, date: day(-3), people: ["[[Ines]]"] });
  add("Taco Place.md", "tacos", { category: ["[[Places]]"], kind: "Restaurant", area: "Market Street", rating: 8, cost: 30, date: day(-90) });
  add("Dune.md", "want to read", { category: ["[[Books]]"], status: "Want to read", date: day(-100) });
  add("Thought 1.md", "What if the stall sold jam too?", { category: ["[[Journal]]"], created: day(-1) + "T10:00:00" });
  add("Letter to future me.md", "---\n---\nDear future me. Be kind about the prices.", { category: ["[[Letters]]"], deliver: day(-1), created: day(-180) + "T10:00:00" });
  add("Sealed letter.md", "secret", { category: ["[[Letters]]"], deliver: day(90), created: day(-1) + "T10:00:00" });
  add("Raise prices.md", "## The decision\nRaise them.", { category: ["[[Decisions]]"], status: "open", decided: day(-30), lookback: day(-1) });
  add("Draft essay.md", "words words", { status: "draft", created: day(-5) + "T10:00:00" });
  add("Old idea.md", "x".repeat(600) + " What did I forget?", { created: day(-400) + "T10:00:00", topics: ["Baking"] }, 400);
  add("Clip new.md", "fresh", { category: ["[[Clipboard]]"], created: day(-1) + "T09:00:00" });
  add("No category.md", "empty category", { category: null, created: day(-5) + "T09:00:00" });
  add("No category either.md", "empty list", { categories: [], created: day(-2) + "T09:00:00" });
  add("Task list notes.md", "- [ ] Older task ➕ 2025-01-01\n- [ ] Newer task ➕ 2026-11-01\n", { created: "2024-05-05T10:00:00" });
  const lastYear = new Date(new Date().getFullYear() - 1, new Date().getMonth(), new Date().getDate(), 12, 0);
  add("Anniversary note.md", "from a year ago " + "x".repeat(300), { created: isoDate(lastYear) + "T12:00:00" }, Math.round((Date.now() - lastYear.getTime()) / DAY));
  add("Whiteboard.canvas", "{}");
  add("Categories/Books.md", "category page", { tags: "categories" });
  app.metadataCache.resolvedLinks = { "Pine & Plum.md": { "Plans/Autumn market stall.md": 1 }, "Taco Place.md": { "Plans/Autumn market stall.md": 1 } };

  const plugin = new DashboardPlugin(app, {} as any);
  await plugin.onload();
  return { app, plugin, files, add };
}

const listsBox = (v: any) => v.contentEl.querySelector(".pd-lists") as HTMLElement;
const tab = (v: any, label: string) => [...listsBox(v).querySelectorAll(".pd-tab")].find((b: Element) => b.textContent!.startsWith(label)) as HTMLElement;

const render = async (plugin: any, app: any, type: string, state?: any) => {
  const view = (plugin as any).views[type]({ app, setViewState: async () => {} });
  if (state) await view.setState(state, {});
  await view.onOpen();
  return view;
};

describe("plugin smoke test", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => { ctx = await setup(); });

  it("renders every page without errors", async () => {
    const types = Object.keys((ctx.plugin as any).views);
    expect(types.length).toBe(11);
    for (const t of types) {
      const state = t.endsWith("overview") ? { path: "Plans/Autumn market stall.md" } : undefined;
      const v = await render(ctx.plugin, ctx.app, t, state);
      expect(v.contentEl.textContent!.length, t).toBeGreaterThan(20);
    }
  });

  it("Home shows Favorites under the buttons, then New note beside one two-tab box, and no garden", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const titles = [...v.contentEl.querySelectorAll(".pd-card-title")].map((e: Element) => e.textContent);
    expect(titles).toEqual(["Favorites", "From past you", "New note"]);
    const kids = [...v.contentEl.children] as HTMLElement[];
    const at = (pred: (e: HTMLElement) => boolean) => kids.findIndex(pred);
    const bar = at((e) => e.classList.contains("pd-actions"));
    const favs = at((e) => e.textContent!.startsWith("Favorites"));
    const top = at((e) => e.classList.contains("pd-toprow"));
    expect(bar).toBeGreaterThanOrEqual(0);
    expect(favs).toBe(bar + 1);
    expect(top).toBeGreaterThan(favs);
    const tabs = [...listsBox(v).querySelectorAll(".pd-tab")].map((b: Element) => b.textContent);
    expect(tabs[0]).toBe("Recently modified");
    expect(tabs[1]).toMatch(/^Review Clipboard\d+$/);
    expect(tabs[2]).toMatch(/^Todos\d+$/);
    const text = v.contentEl.textContent!;
    expect(text).not.toContain("From the garden");
    expect(text).not.toContain("Today's rhythm");
    expect(text).not.toContain("Next steps");
    expect(text).not.toContain("Capture a thought");
    expect(text).toContain("Dear future me");
    expect(text).toContain("Autumn market stall");
  });

  it("New note has Work, Journal and Clipboard buttons, Clipboard chosen to start, and files under the one chosen", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const card = [...v.contentEl.querySelectorAll(".pd-card")].find((c: Element) => c.querySelector(".pd-card-title")?.textContent === "New note") as HTMLElement;
    const btns = [...card.querySelectorAll(".pd-newnote-cats .pd-pick")] as HTMLElement[];
    expect(btns.map((b) => b.textContent)).toEqual(["Work", "Journal", "Clipboard"]);
    expect(btns.filter((b) => b.classList.contains("is-active")).map((b) => b.textContent)).toEqual(["Clipboard"]);
    btns[0].click();
    expect(btns.filter((b) => b.classList.contains("is-active")).map((b) => b.textContent)).toEqual(["Work"]);
    const [title] = card.querySelectorAll("input") as any;
    title.value = "Quarterly goals"; title.dispatchEvent(new Event("input"));
    (card.querySelector(".mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    const key = [...ctx.files.keys()].find((k) => /^\d{4}-\d{2}-\d{2} - Quarterly goals\.md$/.test(k))!;
    expect(ctx.files.get(key)!.content).toContain('category:\n  - "[[Work]]"');
    // After creating, it goes back to Clipboard.
    expect(btns.filter((b) => b.classList.contains("is-active")).map((b) => b.textContent)).toEqual(["Clipboard"]);
  });

  it("Home has a New note box that creates the note and opens it in a new tab", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    expect(v.contentEl.textContent).not.toContain("Next best step");
    const card = [...v.contentEl.querySelectorAll(".pd-card")].find((c: Element) => c.textContent!.includes("New note")) as HTMLElement;
    const [title] = card.querySelectorAll("input") as any;
    const area = card.querySelector("textarea") as HTMLTextAreaElement;
    title.value = "Market sign ideas"; title.dispatchEvent(new Event("input"));
    area.value = "Chalkboard, or wood?"; area.dispatchEvent(new Event("input"));
    expect(card.querySelector(".pd-newnote-hint")!.textContent).toMatch(/\d{4}-\d{2}-\d{2} - Market sign ideas\.md/);
    (card.querySelector(".mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    const key = [...ctx.files.keys()].find((k) => /^\d{4}-\d{2}-\d{2} - Market sign ideas\.md$/.test(k))!;
    expect(key).toBeTruthy();
    expect(ctx.files.get(key)!.content).toContain("Chalkboard, or wood?");
    expect(ctx.files.get(key)!.content).toMatch(/^---\ncreated: .*\ntags:\ncategory:\n  - "\[\[Clipboard\]\]"\n---\n/);
    expect(ctx.app.opened).toContain(key);
    expect(title.value).toBe("");
  });

  it("Recently modified is the first tab: the last 10 files edited, newest first, in a scrollable list", async () => {
    ctx.files.get("Dune.md")!.file.stat.mtime = Date.now() + 5000;
    ctx.plugin.settings.homeTab = undefined;
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    expect(tab(v, "Recently modified").classList.contains("is-active")).toBe(true);
    const names = [...listsBox(v).querySelectorAll(".pd-logrow-name")].map((e) => e.textContent);
    expect(names).toHaveLength(10);
    expect(names[0]).toBe("Dune");
    expect(listsBox(v).querySelector(".pd-scroll.pd-recent-scroll")).toBeTruthy();
    expect(names).not.toContain("Sealed letter");
    expect(names).not.toContain("Old idea");
  });

  it("the Review Clipboard tab swaps the list in the same box, and the choice is remembered", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const box = listsBox(v);
    tab(v, "Review Clipboard").click();
    expect(tab(v, "Review Clipboard").classList.contains("is-active")).toBe(true);
    expect(tab(v, "Recently modified").classList.contains("is-active")).toBe(false);
    const names = [...box.querySelectorAll(".pd-logrow-name")].map((e) => e.textContent);
    expect(names.slice(0, 3)).toEqual(["Clip new", "No category either", "No category"]);
    expect(names).not.toContain("Pine & Plum");
    expect(names).not.toContain("Books");
    expect(box.textContent).toContain("No category");
    expect(box.classList.contains("is-collapsed")).toBe(false);
    expect(ctx.plugin.settings.homeTab).toBe("clipboard");
    const again = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    expect(tab(again, "Review Clipboard").classList.contains("is-active")).toBe(true);
    tab(again, "Recently modified").click();
    expect(ctx.plugin.settings.homeTab).toBe("recent");
  });

  it("the Todos tab lists open todos oldest first, with created and note under each, and adds new ones to the on-the-fly note", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    tab(v, "Todos").click();
    const box = listsBox(v);
    expect(tab(v, "Todos").classList.contains("is-active")).toBe(true);
    const texts = [...box.querySelectorAll(".pd-task-text")].map((e) => e.textContent);
    expect(texts).toContain("Older task");
    expect(texts.indexOf("Older task")).toBeLessThan(texts.indexOf("Newer task"));
    expect(texts).not.toContain("Banner"); // done
    const row = [...box.querySelectorAll(".pd-task")].find((r) => r.querySelector(".pd-task-text")!.textContent === "Older task") as HTMLElement;
    expect(row.querySelector(".pd-task-meta")!.textContent).toMatch(/^Created .* - Task list notes$/);
    expect(Number(tab(v, "Todos").querySelector(".pd-tab-count")!.textContent)).toBe(texts.length);

    const input = box.querySelector(".pd-todo-add input") as HTMLInputElement;
    input.value = "Renew passport"; input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new (window as any).KeyboardEvent("keydown", { key: "Enter" }));
    await new Promise((r) => setTimeout(r, 20));
    const todoFile = ctx.files.get("00. PRIMARY FOLDER/On The Fly Todo List.md")!;
    expect(todoFile.content).toMatch(/^- \[ \] Renew passport ➕ \d{4}-\d{2}-\d{2}\n$/);
    ctx.plugin.invalidate();
    // A second one goes underneath the first.
    await ctx.plugin.addTodo("Book dentist");
    expect(todoFile.content.split("\n").slice(0, 2).map((l) => l.replace(/ ➕.*/, ""))).toEqual(["- [ ] Renew passport", "- [ ] Book dentist"]);
    // Both show up, newest at the end.
    ctx.plugin.invalidate();
    const again = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const after = [...listsBox(again).querySelectorAll(".pd-task-text")].map((e) => e.textContent);
    expect(after.indexOf("Renew passport")).toBeLessThan(after.indexOf("Book dentist"));
    expect(after.indexOf("Book dentist")).toBe(after.length - 1);
    ctx.plugin.settings.homeTab = "recent";
  });

  it("Home has no top button bar, and exactly the six shortcut buttons under the date", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    expect(v.contentEl.querySelector(".pd-nav")).toBeNull();
    const bar = v.contentEl.querySelector(".pd-actions") as HTMLElement;
    expect([...bar.querySelectorAll(".pd-btn")].map((b: Element) => b.textContent)).toEqual(["Add Quick Thought", "Log", "Open Inbox", "Tasks", "Logs", "Look Back"]);
  });

  it("other pages have just a Home button at the top", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-tasks");
    const nav = v.contentEl.querySelector(".pd-nav") as HTMLElement;
    expect([...nav.querySelectorAll("button")].map((b: Element) => b.textContent)).toEqual(["Home"]);
  });

  it("the Add box has only the text box and the Add button, and adds a plain bullet at the top", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const box = v.contentEl.querySelector(".pd-home-capture") as HTMLElement;
    expect(box.querySelectorAll("input")).toHaveLength(1);
    expect((box.querySelector("input") as HTMLInputElement).placeholder).toBe("Add to Random Notes");
    expect([...box.querySelectorAll("button")].map((b: Element) => b.textContent)).toEqual(["Add"]);
    (box.querySelector("input") as HTMLInputElement).value = "call Sam ~15m !low @fri";
    (box.querySelector("button") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.files.get("Inbox.md")!.content.split("\n")[0]).toBe("- call Sam ~15m !low @fri");
  });

  it("section cards fold shut when you click the title bar, and stay that way", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const card = () => [...v.contentEl.querySelectorAll(".pd-card")].find((c: Element) => c.querySelector(".pd-card-title")?.textContent === "Favorites") as HTMLElement;
    expect(card().classList.contains("is-collapsed")).toBe(false);
    (card().querySelector(".pd-card-head") as HTMLElement).click();
    expect(card().classList.contains("is-collapsed")).toBe(true);
    expect(ctx.plugin.settings.collapsedSections).toContain("favorites");
    const again = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const c2 = [...again.contentEl.querySelectorAll(".pd-card")].find((c: Element) => c.querySelector(".pd-card-title")?.textContent === "Favorites") as HTMLElement;
    expect(c2.classList.contains("is-collapsed")).toBe(true);
    (c2.querySelector(".pd-card-head") as HTMLElement).click();
    expect(ctx.plugin.settings.collapsedSections).not.toContain("favorites");
    // The two-tab box folds from its title bar, but clicking a tab does not fold it.
    const box = listsBox(again);
    expect(box.querySelector(".pd-card-head")!.classList.contains("is-collapsible")).toBe(true);
    tab(again, "Review Clipboard").click();
    expect(box.classList.contains("is-collapsed")).toBe(false);
    (box.querySelector(".pd-card-head") as HTMLElement).click();
    expect(box.classList.contains("is-collapsed")).toBe(true);
    (box.querySelector(".pd-card-head") as HTMLElement).click();
    expect(ctx.plugin.settings.collapsedSections).not.toContain("lists");
  });

  it("Tasks lists newest first, with the created date and note title next to each other", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-tasks");
    const rows = [...v.contentEl.querySelectorAll(".pd-task")] as HTMLElement[];
    const texts = rows.map((r) => r.querySelector(".pd-task-text")!.textContent);
    expect(texts.indexOf("Newer task")).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf("Newer task")).toBeLessThan(texts.indexOf("Older task"));
    const row = rows[texts.indexOf("Newer task")];
    const meta = row.querySelector(".pd-task-meta")!.textContent!;
    expect(meta).toMatch(/Created .* - Task list notes$/);
    expect(v.contentEl.querySelector(".pd-group-head")).toBeNull();
  });

  it("Look Back shows notes created or last edited on this day in earlier years", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-lookback");
    const card = [...v.contentEl.querySelectorAll(".pd-card")].find((c: Element) => c.querySelector(".pd-card-title")?.textContent === "On this day") as HTMLElement;
    expect(card).toBeTruthy();
    const names = [...card.querySelectorAll(".pd-logrow-name")].map((e) => e.textContent);
    expect(names).toContain("Anniversary note");
    expect(names).not.toContain("Pine & Plum");
    expect(card.textContent).toContain(String(new Date().getFullYear() - 1));
    expect(card.textContent).toContain("created");
  });

  it("Add Quick Thought saves a minute-stamped note in the Quick Thoughts folder", async () => {
    const m = new QuickThoughtModal(ctx.app, ctx.plugin);
    m.open();
    const area = m.contentEl.querySelector("textarea") as HTMLTextAreaElement;
    area.value = "Ask Sam about the stall permit."; area.dispatchEvent(new Event("input"));
    expect(m.contentEl.textContent).toMatch(/Quick Thoughts\/\d{4}-\d{2}-\d{2} \d{1,2}\.\d{2} [AP]M\.md/);
    (m.contentEl.querySelector(".mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    const key = [...ctx.files.keys()].find((k) => /^Quick Thoughts\/\d{4}-\d{2}-\d{2} \d{1,2}\.\d{2} [AP]M\.md$/.test(k))!;
    expect(key).toBeTruthy();
    expect(ctx.files.get(key)!.content).toMatch(/^---\ncreated: .*\ntags:\ncategory:\n  - "\[\[Quick Thought\]\]"\n---\nAsk Sam/);
    expect(ctx.app.opened).not.toContain(key);
  });

  it("See all Quick Thoughts opens the note, or says it is missing", async () => {
    Notice.messages.length = 0;
    await ctx.plugin.openAllQuickThoughts();
    expect(Notice.messages.join(" ")).toContain("Quick Thoughts/All Quick Thoughts.md");
    ctx.add("Quick Thoughts/All Quick Thoughts.md", "base here", { });
    await ctx.plugin.openAllQuickThoughts();
    expect(ctx.app.opened).toContain("Quick Thoughts/All Quick Thoughts.md");
  });

  it("Library groups by category to start with and remembers the choice", async () => {
    await render(ctx.plugin, ctx.app, "personal-dashboard-library");
    expect(ctx.plugin.libraryState.groupKey).toBe("category");
    ctx.plugin.libraryState.groupKey = "status";
    ctx.plugin.persistLibrary();
    expect(ctx.plugin.settings.libraryState!.groupKey).toBe("status");
    ctx.plugin.libraryState.groupKey = "category";
    ctx.plugin.persistLibrary();
  });

  it("Library works in every layout", async () => {
    for (const layout of ["list", "board", "calendar"] as const) {
      ctx.plugin.libraryState.layout = layout;
      const v = await render(ctx.plugin, ctx.app, "personal-dashboard-library");
      expect(v.contentEl.querySelector(".pd-library")!.textContent!.length, layout).toBeGreaterThan(5);
    }
  });

  it("Search finds notes, tasks and inbox lines", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-search");
    const input = v.contentEl.querySelector("input") as HTMLInputElement;
    input.value = "stall";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 600));
    expect(v.contentEl.textContent).toContain("Stall price list");
    expect(v.contentEl.textContent).toContain("Autumn market stall");
  });

  it("never shows the text of a sealed letter", async () => {
    expect(ctx.plugin.sealedPaths().has("Sealed letter.md")).toBe(true);
    const search = await render(ctx.plugin, ctx.app, "personal-dashboard-search");
    const input = search.contentEl.querySelector("input") as HTMLInputElement;
    input.value = "secret";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 600));
    expect(search.contentEl.textContent).not.toContain("Sealed letter");
    ctx.plugin.libraryState.layout = "list"; ctx.plugin.libraryState.category = ""; ctx.plugin.libraryState.search = "";
    const lib = await render(ctx.plugin, ctx.app, "personal-dashboard-library");
    expect(lib.contentEl.textContent).not.toContain("Sealed letter");
    const ov = await render(ctx.plugin, ctx.app, "personal-dashboard-overview", { path: "Sealed letter.md" });
    expect(ov.contentEl.textContent).toContain("sealed letter");
    expect(ov.contentEl.textContent).not.toContain("secret");
    expect(ctx.plugin.gardenToday(50).picks.map((f) => f.basename)).not.toContain("Sealed letter");
    // The arrived letter is not sealed.
    expect(ctx.plugin.sealedPaths().has("Letter to future me.md")).toBe(false);
  });

  it("reads inbox lines with old 24-hour stamps and new 12-hour ones", async () => {
    ctx.files.get("Inbox.md")!.content += "- 2026-11-10 2:32 PM new style\n- 2026-11-11 11:05 am lower case\n";
    const items = await readInbox(ctx.app, ctx.plugin.settings);
    const byText = Object.fromEntries(items.map((i) => [i.text, i.added]));
    expect(byText["old thought"]).toBe("2026-10-01");
    expect(byText["new style"]).toBe("2026-11-10");
    expect(byText["lower case"]).toBe("2026-11-11");
  });

  it("captures a plain bullet to the top of the inbox", async () => {
    expect(await ctx.plugin.capture("buy stamps")).toBe(true);
    expect(ctx.files.get("Inbox.md")!.content.split("\n")[0]).toBe("- buy stamps");
  });

  it("toggles a task and its done date", async () => {
    const tasks = await ctx.plugin.getTasks();
    const t = tasks.find((x) => x.info.text === "Stall price list")!;
    await ctx.plugin.toggleTask(t);
    expect(ctx.files.get("Plans/Autumn market stall.md")!.content).toMatch(/- \[x\] Stall price list .* ✅ \d{4}/);
  });

  it("favorites toggle for notes and canvases", async () => {
    const note = ctx.files.get("Pine & Plum.md")!.file as any;
    await ctx.plugin.toggleFavorite(note);
    expect(ctx.files.get("Pine & Plum.md")!.fm!.favorite).toBe(true);
    const canvas = ctx.files.get("Whiteboard.canvas")!.file as any;
    await ctx.plugin.toggleFavorite(canvas);
    expect(ctx.plugin.settings.favoriteFiles).toContain("Whiteboard.canvas");
    ctx.plugin.invalidate();
    expect(ctx.plugin.getFavorites().map((f) => f.file.basename)).toContain("Whiteboard");
  });

  it("logs a thought with a title through the modal", async () => {
    const m = new LogModal(ctx.app, ctx.plugin, "thought");
    m.open();
    const [title] = m.contentEl.querySelectorAll("input") as any;
    title.value = "Pour-over ratio"; title.dispatchEvent(new Event("input"));
    const ta = m.contentEl.querySelector("textarea") as HTMLTextAreaElement;
    ta.value = "Try 1:16"; ta.dispatchEvent(new Event("input"));
    expect(m.contentEl.querySelector(".pd-preview")!.textContent).toContain("Try 1:16");
    (m.contentEl.querySelector(".pd-footer .mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect([...ctx.files.keys()].some((k) => /^Pour-over ratio \d{4}-\d{2}-\d{2} \d{1,2}\.\d{2} [AP]M\.md$/.test(k))).toBe(true);
  });

  it("logs a restaurant with a rating through the modal", async () => {
    const m = new LogModal(ctx.app, ctx.plugin, "place");
    m.open();
    const name = m.contentEl.querySelector("input") as HTMLInputElement;
    name.value = "Noodle Bar"; name.dispatchEvent(new Event("input"));
    [...m.contentEl.querySelectorAll(".pd-num")].find((b) => b.textContent === "8")!.dispatchEvent(new Event("click"));
    expect(m.contentEl.querySelector(".pd-preview")!.textContent).toContain("rating: 8");
    (m.contentEl.querySelector(".pd-footer .mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.files.has("Noodle Bar.md")).toBe(true);
  });

  it("saves a letter and a decision", async () => {
    const l = new LetterModal(ctx.app, ctx.plugin);
    l.open();
    const ta = l.contentEl.querySelector("textarea") as HTMLTextAreaElement;
    ta.value = "Hello"; ta.dispatchEvent(new Event("input"));
    (l.contentEl.querySelector(".pd-footer .mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect([...ctx.files.keys()].some((k) => k.startsWith("Letter to future me 20"))).toBe(true);

    const d = new DecisionModal(ctx.app, ctx.plugin);
    d.open();
    const title = d.contentEl.querySelector("input") as HTMLInputElement;
    title.value = "Move the stall"; title.dispatchEvent(new Event("input"));
    (d.contentEl.querySelector(".pd-footer .mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.files.get("Move the stall.md")!.content).toContain("status: open");
  });

  it("looks back on a decision, keeps a letter, and snoozes a garden note", async () => {
    const dec = ctx.files.get("Raise prices.md")!.file as any;
    await ctx.plugin.applyLookBack(dec, "Right call", "Sales held.");
    expect(ctx.files.get("Raise prices.md")!.fm).toMatchObject({ status: "reviewed", outcome: "Right call" });
    expect(ctx.files.get("Raise prices.md")!.content).toContain("**Right call.** Sales held.");
    await ctx.plugin.keepLetter(ctx.files.get("Letter to future me.md")!.file as any);
    expect(ctx.files.get("Letter to future me.md")!.fm!.kept).toBe(true);
    const old = ctx.files.get("Old idea.md")!.file as any;
    await ctx.plugin.snoozeGarden(old, "never");
    expect(ctx.plugin.gardenToday(10).picks.map((f) => f.basename)).not.toContain("Old idea");
  });

  it("stops suggesting earlier recipe sources, once, for already-saved settings", async () => {
    const { app } = makeApp();
    const plugin = new DashboardPlugin(app, {} as any);
    const old = JSON.parse(JSON.stringify(ctx.plugin.settings.logTypes));
    old.find((t: any) => t.id === "cooked").fields.find((f: any) => f.key === "source").suggest = true;
    (plugin as any).store = { logTypes: old };
    await plugin.onload();
    const src = () => plugin.settings.logTypes.find((t) => t.id === "cooked")!.fields.find((f) => f.key === "source")!;
    expect(src().suggest).toBeFalsy();
    expect(plugin.settings.migrations).toContain("cooked-source-no-suggest");
    // Turning it back on sticks: the change does not run again.
    src().suggest = true;
    await plugin.saveSettings();
    const again = new DashboardPlugin(app, {} as any);
    (again as any).store = JSON.parse(JSON.stringify(plugin.settings));
    await again.onload();
    expect(again.settings.logTypes.find((t) => t.id === "cooked")!.fields.find((f) => f.key === "source")!.suggest).toBe(true);
    // Other fields keep their suggestions.
    expect(plugin.settings.logTypes.find((t) => t.id === "place")!.fields.find((f) => f.key === "area")!.suggest).toBe(true);
  });

  it("Mark all done: completes a set of todos and one Undo restores every line exactly, duplicates included", async () => {
    ctx.add("Bulk A.md", "intro\n- [ ] same thing\n- [ ] same thing\n- [/] in progress\n- [x] already done ✅ 2026-01-01\n- [ ] last one\r\n");
    ctx.add("Bulk B.md", "- [ ] b one\n");
    const original = { a: ctx.files.get("Bulk A.md")!.content, b: ctx.files.get("Bulk B.md")!.content };
    ctx.plugin.invalidate();
    const items = (await ctx.plugin.getTasks()).filter((t) => t.file.basename.startsWith("Bulk "));
    const res = await ctx.plugin.completeTasks(items);
    expect(res).toMatchObject({ count: 5, notes: 2 });
    const a = ctx.files.get("Bulk A.md")!.content;
    expect(a.match(/\[x\] same thing ✅ \d{4}-\d{2}-\d{2}/g)).toHaveLength(2);
    expect(a).toMatch(/\[x\] in progress ✅/);
    expect(a).toContain("- [x] already done ✅ 2026-01-01\n"); // untouched
    expect(a).toMatch(/- \[x\] last one ✅ \d{4}-\d{2}-\d{2}\r\n/); // line ending kept
    expect(a).not.toMatch(/\[ \]/);
    await res.undo();
    expect(ctx.files.get("Bulk A.md")!.content).toBe(original.a);
    expect(ctx.files.get("Bulk B.md")!.content).toBe(original.b);
  });

  it("Mark all done skips a todo whose line changed since the list loaded", async () => {
    ctx.plugin.invalidate();
    const items = (await ctx.plugin.getTasks()).filter((t) => t.file.basename === "Bulk B");
    ctx.files.get("Bulk B.md")!.content = "- [ ] b one, edited\n";
    const res = await ctx.plugin.completeTasks(items);
    expect(res.count).toBe(0);
    expect(ctx.files.get("Bulk B.md")!.content).toBe("- [ ] b one, edited\n");
  });

  it("the Tasks page button asks first, Cancel changes nothing, and confirming completes what is listed", async () => {
    ctx.files.get("Bulk B.md")!.content = "- [ ] b one\n";
    ctx.plugin.invalidate();
    const snapshot = () => JSON.stringify([...ctx.files.entries()].map(([k, v]) => [k, v.content]));
    const before = snapshot();
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-tasks");
    const btn = [...v.contentEl.querySelectorAll(".pd-page-head button")].find((b: Element) => b.textContent === "Mark all done") as HTMLElement;
    expect(btn).toBeTruthy();
    btn.click();
    const modal = Modal.last as any;
    expect(modal.titleEl.textContent).toMatch(/^Mark \d+ todos as done\?$/);
    expect(snapshot()).toBe(before); // nothing yet
    ([...modal.contentEl.querySelectorAll("button")].find((b: Element) => b.textContent === "Cancel") as HTMLElement).click();
    expect(snapshot()).toBe(before);

    btn.click();
    ([...(Modal.last as any).contentEl.querySelectorAll("button")].find((b: Element) => b.classList.contains("mod-warning")) as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 50));
    for (const [path, fx] of ctx.files) {
      if (path.startsWith("Categories/")) continue;
      expect(fx.content, path).not.toMatch(/^\s*[-*] \[ \]/m);
    }
    expect(ctx.files.get("Bulk B.md")!.content).toMatch(/^- \[x\] b one ✅ \d{4}/);
  });

  it("no unexpected error notices were shown", () => {
    const bad = Notice.messages.filter((m) => /could not|error/i.test(m));
    expect(bad).toEqual([]);
  });
});
