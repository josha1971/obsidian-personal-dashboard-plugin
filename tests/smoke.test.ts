// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { Notice, TFile, installDomHelpers } from "./obsidian-mock";
import DashboardPlugin from "../src/main";
import { addDays, isoDate } from "../src/dates";
import { LogModal } from "../src/modals";
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
  add("Whiteboard.canvas", "{}");
  add("Categories/Books.md", "category page", { tags: "categories" });
  app.metadataCache.resolvedLinks = { "Pine & Plum.md": { "Plans/Autumn market stall.md": 1 }, "Taco Place.md": { "Plans/Autumn market stall.md": 1 } };

  const plugin = new DashboardPlugin(app, {} as any);
  await plugin.onload();
  return { app, plugin, files, add };
}

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

  it("Home shows the key sections in order", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    const titles = [...v.contentEl.querySelectorAll(".pd-card-title")].map((e: Element) => e.textContent);
    expect(titles).toContain("Favorites");
    expect(titles.indexOf("Favorites")).toBeLessThan(titles.indexOf("Recent logs"));
    const text = v.contentEl.textContent!;
    expect(text).toContain("From past you");
    expect(text).toContain("Dear future me");
    expect(text).toContain("How did \"Raise prices\" go?");
    expect(text).toContain("Autumn market stall");
    expect(text).toContain("From the garden");
  });

  it("Home has a New note box that creates the note and opens it in a new tab", async () => {
    const v = await render(ctx.plugin, ctx.app, "personal-dashboard-home");
    expect(v.contentEl.textContent).not.toContain("Next best step");
    const card = [...v.contentEl.querySelectorAll(".pd-card")].find((c: Element) => c.textContent!.includes("New note")) as HTMLElement;
    const [title] = card.querySelectorAll("input") as any;
    const area = card.querySelector("textarea") as HTMLTextAreaElement;
    title.value = "Market sign ideas"; title.dispatchEvent(new Event("input"));
    area.value = "Chalkboard, or wood?"; area.dispatchEvent(new Event("input"));
    expect(card.querySelector(".pd-newnote-hint")!.textContent).toMatch(/Market sign ideas \d{4}-\d{2}-\d{2} \d{4}\.md/);
    (card.querySelector(".mod-cta") as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 20));
    const key = [...ctx.files.keys()].find((k) => k.startsWith("Market sign ideas "))!;
    expect(key).toBeTruthy();
    expect(ctx.files.get(key)!.content).toContain("Chalkboard, or wood?");
    expect(ctx.files.get(key)!.content).toMatch(/^---\ncreated: .*\ntags:\ncategory:\n---\n/);
    expect(ctx.app.opened).toContain(key);
    expect(title.value).toBe("");
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

  it("captures to the top of the inbox with Undo text", async () => {
    expect(await ctx.plugin.capture("call Sam ~15m !low @fri", "auto")).toBe(true);
    const inbox = ctx.files.get("Inbox.md")!.content;
    expect(inbox.split("\n")[0]).toMatch(/^- \[ \] call Sam ~15m ➕ \d{4}-\d{2}-\d{2} 🔽 📅 \d{4}-\d{2}-\d{2}$/);
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
    expect([...ctx.files.keys()].some((k) => /^Pour-over ratio \d{4}-\d{2}-\d{2} \d{4}\.md$/.test(k))).toBe(true);
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

  it("no unexpected error notices were shown", () => {
    const bad = Notice.messages.filter((m) => /could not|error/i.test(m));
    expect(bad).toEqual([]);
  });
});
