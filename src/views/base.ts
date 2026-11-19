import { ItemView, WorkspaceLeaf, setIcon, setTooltip } from "obsidian";
import { VIEW_HOME } from "../constants";
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

  /** A Home button at the top of every page except Home. */
  protected renderNav(parent: HTMLElement): void {
    if (this.getViewType() === VIEW_HOME) return;
    const bar = parent.createDiv({ cls: "pd-nav" });
    const b = bar.createEl("button", { cls: "pd-btn" });
    setIcon(b.createSpan({ cls: "pd-btn-icon" }), "layout-dashboard");
    b.createSpan({ text: "Home" });
    setTooltip(b, "Back to Home", { delay: 400 });
    b.addEventListener("click", () => void this.plugin.navigate(this.leaf, "home"));
  }

  async refresh(): Promise<void> {
    const token = ++this.renderToken;
    await this.render(() => token === this.renderToken);
  }
}
