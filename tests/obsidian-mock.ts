/* A tiny stand-in for the Obsidian API, just enough to render the plugin's pages in tests. */
type Opts = string | { text?: string; cls?: string | string[]; attr?: Record<string, string>; type?: string; value?: string; placeholder?: string; href?: string; title?: string };

function applyOpts(el: HTMLElement, o?: Opts): void {
  if (!o) return;
  if (typeof o === "string") { el.className = o; return; }
  if (o.text !== undefined) el.textContent = o.text;
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
  if (o.type) (el as HTMLInputElement).type = o.type;
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
  if (o.placeholder) (el as HTMLInputElement).placeholder = o.placeholder;
  if (o.title) el.title = o.title;
}

export function installDomHelpers(): void {
  const P = HTMLElement.prototype as any;
  if (P.createEl) return;
  P.createEl = function (tag: string, o?: Opts, cb?: (e: HTMLElement) => void) {
    const el = document.createElement(tag);
    applyOpts(el, o);
    this.appendChild(el);
    cb?.(el);
    return el;
  };
  P.createDiv = function (o?: Opts) { return this.createEl("div", o); };
  P.createSpan = function (o?: Opts) { return this.createEl("span", o); };
  P.empty = function () { this.innerHTML = ""; };
  P.addClass = function (...c: string[]) { this.classList.add(...c); };
  P.removeClass = function (...c: string[]) { this.classList.remove(...c); };
  P.toggleClass = function (c: string | string[], on: boolean) { for (const x of Array.isArray(c) ? c : [c]) this.classList.toggle(x, on); };
  P.hasClass = function (c: string) { return this.classList.contains(c); };
  P.setText = function (t: string) { this.textContent = t; };
  P.appendText = function (t: string) { this.appendChild(document.createTextNode(t)); };
  (globalThis as any).createDiv = (o?: Opts) => { const d = document.createElement("div"); applyOpts(d, o); return d; };
}

export class Notice {
  static messages: string[] = [];
  constructor(msg: string | DocumentFragment) { Notice.messages.push(typeof msg === "string" ? msg : msg.textContent ?? ""); }
  hide() {}
}

export class TFolder {
  children: unknown[] = [];
  constructor(public path: string, public name = path.split("/").pop() ?? "") {}
  isRoot() { return this.path === "/" || this.path === ""; }
}

export class TFile {
  basename: string; extension: string; name: string; parent: TFolder;
  stat = { ctime: Date.now(), mtime: Date.now(), size: 400 };
  constructor(public path: string) {
    this.name = path.split("/").pop()!;
    const dot = this.name.lastIndexOf(".");
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.extension = dot > 0 ? this.name.slice(dot + 1) : "";
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    this.parent = new TFolder(dir || "/", dir.split("/").pop() ?? "");
  }
}

export const normalizePath = (p: string) => p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
export const debounce = <T extends (...a: any[]) => any>(fn: T) => fn;
export const setIcon = (_el: HTMLElement, _n: string) => {};
export const setTooltip = () => {};

const chain = (): any => new Proxy(function () {}, { get: () => chain(), apply: () => chain() });

export class Setting {
  constructor(public el: HTMLElement) {}
  private c: any = new Proxy({}, { get: () => (..._a: any[]) => this.c });
  setName() { return this; } setDesc() { return this; } setHeading() { return this; }
  addText(cb: (t: any) => void) { cb(this.c); return this; }
  addToggle(cb: (t: any) => void) { cb(this.c); return this; }
  addDropdown(cb: (t: any) => void) { cb(this.c); return this; }
  addButton(cb: (t: any) => void) { cb(this.c); return this; }
}
export class PluginSettingTab { containerEl = document.createElement("div"); constructor(public app: any, public plugin: any) {} }

export class Modal {
  contentEl = document.createElement("div"); modalEl = document.createElement("div"); titleEl = document.createElement("div");
  scope = { register() {} };
  constructor(public app: any) {}
  open() { (this as any).onOpen(); }
  close() { (this as any).onClose(); }
}

export class Plugin {
  commands: string[] = []; views: Record<string, (leaf: any) => any> = {}; private store: any = null;
  constructor(public app: any, public manifest: any) {}
  addCommand(c: { id: string }) { this.commands.push(c.id); }
  addRibbonIcon() {} addSettingTab() {} registerEvent() {}
  registerView(t: string, f: (leaf: any) => any) { this.views[t] = f; }
  async loadData() { return this.store; }
  async saveData(d: any) { this.store = JSON.parse(JSON.stringify(d)); }
}

export class ItemView {
  contentEl = document.createElement("div"); app: any;
  constructor(public leaf: any) { this.app = leaf.app; }
  registerEvent() {}
  async setState(_s: unknown, _r: unknown) {}
}
export class WorkspaceLeaf {}
export type ViewStateResult = unknown;
export const MarkdownRenderer = { async render(_a: unknown, md: string, el: HTMLElement) { el.textContent = md; } };
