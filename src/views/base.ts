import { ItemView, WorkspaceLeaf } from "obsidian";
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

  async refresh(): Promise<void> {
    const token = ++this.renderToken;
    await this.render(() => token === this.renderToken);
  }
}
