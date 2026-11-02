import { ItemView, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import { NAV, PageId } from "../constants";
import type DashboardPlugin from "../main";

/** Shared plumbing: re-render when the vault changes, ignoring stale async renders. */
export abstract class DashView extends ItemView {
  private renderToken = 0;
  private unsubscribe?: () => void;

  constructor(leaf: WorkspaceLeaf, protected plugin: DashboardPlugin) {
    super(leaf);
  }

  abstract getViewType(): string;
  abstract getDisplayText(): string;
  abstract getIcon(): string;
  protected abstract render(isCurrent: () => boolean): Promise<void>;

  async onOpen(): Promise<void> {
    this.contentEl.addClass("pd-view");
    this.unsubscribe = this.plugin.onDataChanged(() => void this.refresh());
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.unsubscribe?.();
    this.contentEl.empty();
  }

  /** The page this view is, for highlighting in the navigation bar. */
  protected pageId(): PageId | null {
    return NAV.find((n) => n.type === this.getViewType())?.id ?? null;
  }

  /** The navigation bar shown at the top of every page. Pages open in this same tab. */
  protected renderNav(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: "pd-nav" });
    const tabs = bar.createDiv({ cls: "pd-nav-tabs" });
    const current = this.pageId();
    for (const n of NAV) {
      const b = tabs.createEl("button", { cls: "pd-nav-btn" });
      setIcon(b.createSpan({ cls: "pd-btn-icon" }), n.icon);
      b.createSpan({ text: n.label });
      b.toggleClass("is-active", n.id === current);
      setTooltip(b, n.tip, { delay: 400 });
      b.addEventListener("click", () => { if (n.id !== current) void this.plugin.navigate(this.leaf, n.id); });
    }
    const act = bar.createDiv({ cls: "pd-nav-actions" });
    const cap = act.createEl("button", { cls: "pd-btn" });
    setIcon(cap.createSpan({ cls: "pd-btn-icon" }), "zap");
    cap.createSpan({ text: "Capture" });
    setTooltip(cap, "Add a line to your inbox", { delay: 400 });
    cap.addEventListener("click", () => this.plugin.openCaptureModal());
    const log = act.createEl("button", { cls: "pd-btn mod-cta" });
    setIcon(log.createSpan({ cls: "pd-btn-icon" }), "plus");
    log.createSpan({ text: "Log" });
    setTooltip(log, "Log a book, film, meal, drink or thought", { delay: 400 });
    log.addEventListener("click", () => this.plugin.openLogModal());
  }

  async refresh(): Promise<void> {
    const token = ++this.renderToken;
    await this.render(() => token === this.renderToken);
  }
}
