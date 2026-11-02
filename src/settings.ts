import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import type DashboardPlugin from "./main";
import type { CapturePosition } from "./parser";
import { DEFAULT_LOG_TYPES, LogType, parseLogTypes } from "./logs";

export interface DashboardSettings {
  /** Where captures are appended. One note, so the mobile widget can open it. */
  inboxPath: string;
  /** Newest capture first ("top") or last ("bottom"). */
  capturePosition: CapturePosition;
  /** Where new log notes are created. Empty means the vault root. */
  logsFolder: string;
  /** Frontmatter property that holds the category link, e.g. category: ["[[Books]]"]. */
  categoryProperty: string;
  /** Checkbox-style property that marks a note as a favorite (favorite: true). */
  favoriteProperty: string;
  /** Folders whose notes are ignored by Tasks and Logs. Comma separated. */
  excludeFolders: string;
  /** An inbox this big (or this old) becomes the "next best step". */
  inboxNudgeCount: number;
  inboxNudgeDays: number;
  logTypes: LogType[];
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  inboxPath: "Inbox.md",
  capturePosition: "top",
  logsFolder: "",
  categoryProperty: "category",
  favoriteProperty: "favorite",
  excludeFolders: "Templates, Bases, Attachments, Categories",
  inboxNudgeCount: 8,
  inboxNudgeDays: 7,
  logTypes: DEFAULT_LOG_TYPES,
};

export class DashboardSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: DashboardPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = async () => {
      await this.plugin.saveSettings();
    };

    new Setting(containerEl).setName("Capture").setHeading();
    new Setting(containerEl)
      .setName("Inbox note")
      .setDesc("Quick captures are added to this note (top or bottom, see below). Point your phone widget at it to capture on mobile.")
      .addText((t) => t.setPlaceholder("Inbox.md").setValue(s.inboxPath).onChange(async (v) => { s.inboxPath = v.trim() || "Inbox.md"; await save(); }));
    new Setting(containerEl)
      .setName("Add new captures at the")
      .setDesc("Top puts the newest line first, below any properties and a leading # title. Bottom adds to the end.")
      .addDropdown((d) => d.addOption("top", "Top of the note").addOption("bottom", "Bottom of the note").setValue(s.capturePosition).onChange(async (v) => { s.capturePosition = v as CapturePosition; await save(); }));
    new Setting(containerEl)
      .setName("Nudge when the inbox has")
      .setDesc("The Home page suggests sorting the inbox at this many items.")
      .addText((t) => t.setValue(String(s.inboxNudgeCount)).onChange(async (v) => { s.inboxNudgeCount = Math.max(1, parseInt(v) || 8); await save(); }));
    new Setting(containerEl)
      .setName("Or when the oldest item is older than (days)")
      .addText((t) => t.setValue(String(s.inboxNudgeDays)).onChange(async (v) => { s.inboxNudgeDays = Math.max(1, parseInt(v) || 7); await save(); }));

    new Setting(containerEl).setName("Vault").setHeading();
    new Setting(containerEl)
      .setName("Category property")
      .setDesc("The property that links a note to its category note. Logs write it and the Logs page reads it.")
      .addText((t) => t.setValue(s.categoryProperty).onChange(async (v) => { s.categoryProperty = v.trim() || "category"; await save(); }));
    new Setting(containerEl)
      .setName("Favorite property")
      .setDesc("A note with this property set to true appears under Favorites on Home. Toggle it from the note's menu or the command palette.")
      .addText((t) => t.setValue(s.favoriteProperty).onChange(async (v) => { s.favoriteProperty = v.trim() || "favorite"; await save(); }));
    new Setting(containerEl)
      .setName("New log notes go in")
      .setDesc("A folder path. Leave empty to create them in the vault root.")
      .addText((t) => t.setPlaceholder("(vault root)").setValue(s.logsFolder).onChange(async (v) => { s.logsFolder = v.trim().replace(/^\/+|\/+$/g, ""); await save(); }));
    new Setting(containerEl)
      .setName("Ignore these folders")
      .setDesc("Comma separated. Tasks and Logs skip notes inside them (templates, bases, category pages...).")
      .addText((t) => t.setValue(s.excludeFolders).onChange(async (v) => { s.excludeFolders = v; await save(); }));

    new Setting(containerEl).setName("Log types").setHeading();
    const info = containerEl.createEl("p", {
      text: "Each log type is a short definition: the category it files under and the fields it asks for. Edit the JSON to add, remove or rename types and fields. Field kinds: text, longtext, number, rating, date, choice, multi.",
      cls: "setting-item-description",
    });
    info.addClass("pd-setting-note");
    const area = containerEl.createEl("textarea", { cls: "pd-json" });
    area.value = JSON.stringify(s.logTypes, null, 2);
    area.rows = 16;
    area.spellcheck = false;
    const status = containerEl.createDiv({ cls: "pd-json-status" });
    const buttons = new Setting(containerEl);
    buttons.addButton((b) =>
      b.setButtonText("Apply").setCta().onClick(async () => {
        const res = parseLogTypes(area.value);
        if (res.error || !res.types) {
          status.setText(res.error ?? "Could not read that.");
          status.addClass("is-error");
          return;
        }
        s.logTypes = res.types;
        await save();
        status.removeClass("is-error");
        status.setText(`Saved ${res.types.length} log types.`);
        new Notice("Log types saved");
      }),
    );
    buttons.addButton((b) =>
      b.setButtonText("Reset to defaults").onClick(async () => {
        s.logTypes = JSON.parse(JSON.stringify(DEFAULT_LOG_TYPES));
        await save();
        area.value = JSON.stringify(s.logTypes, null, 2);
        status.removeClass("is-error");
        status.setText("Reset to the built-in log types.");
      }),
    );
  }
}
