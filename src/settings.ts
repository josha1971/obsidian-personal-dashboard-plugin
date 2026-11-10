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
  /** Favorites that are not markdown notes (canvases, bases, PDFs...). They have no properties, so they are remembered here. */
  favoriteFiles: string[];
  /** Folders whose notes are ignored by Tasks and Logs. Comma separated. */
  excludeFolders: string;
  /** Category pages for the notes the plugin creates besides logs. */
  reviewCategory: string;
  decisionCategory: string;
  letterCategory: string;
  writeCategory: string;
  /** Daily words goal for Write. */
  writeGoal: number;
  /** Garden brings back notes not touched for this many days. */
  gardenDays: number;
  gardenCount: number;
  gardenExcludeFolders: string;
  /** Notes hidden from the Garden: path -> ISO date they come back, or "never". */
  gardenSnoozed: Record<string, string>;
  /** Home sections the user switched off. */
  homeHidden: string[];
  /** The Library's last layout, category and grouping, so it opens the way you left it. */
  libraryState?: { category: string; groupKey: string; dateKey: string; layout: "list" | "board" | "calendar" };
  logTypes: LogType[];
}

export const DEFAULT_SETTINGS: DashboardSettings = {
  inboxPath: "Inbox.md",
  capturePosition: "top",
  logsFolder: "",
  categoryProperty: "category",
  favoriteProperty: "favorite",
  favoriteFiles: [],
  excludeFolders: "Templates, Bases, Attachments, Categories",
  reviewCategory: "Reviews",
  decisionCategory: "Decisions",
  letterCategory: "Letters",
  writeCategory: "Writing",
  writeGoal: 300,
  gardenDays: 120,
  gardenCount: 5,
  gardenExcludeFolders: "00. DAILY NOTES, 00. WEEKLY NOTES, 10. INBOX",
  gardenSnoozed: {},
  homeHidden: [],
  logTypes: DEFAULT_LOG_TYPES,
};

export const HOME_SECTIONS: [string, string][] = [
  ["stats", "At a glance numbers"],
  ["favorites", "Favorites"],
  ["nextSteps", "Next steps"],
  ["recentLogs", "Recent logs"],
  ["garden", "From the garden"],
];

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
      .setName("New notes go in")
      .setDesc("Where logs, reviews, letters, decisions and freewrites are created. Leave empty for the vault root.")
      .addText((t) => t.setPlaceholder("(vault root)").setValue(s.logsFolder).onChange(async (v) => { s.logsFolder = v.trim().replace(/^\/+|\/+$/g, ""); await save(); }));
    new Setting(containerEl)
      .setName("Ignore these folders")
      .setDesc("Comma separated. Tasks and Logs skip notes inside them (templates, bases, category pages...).")
      .addText((t) => t.setValue(s.excludeFolders).onChange(async (v) => { s.excludeFolders = v; await save(); }));

    new Setting(containerEl).setName("Home page").setHeading();
    for (const [id, label] of HOME_SECTIONS) {
      new Setting(containerEl)
        .setName(label)
        .setDesc(id === "stats" ? "The row of small counters next to the next best step." : "")
        .addToggle((t) => t.setValue(!s.homeHidden.includes(id)).onChange(async (on) => {
          s.homeHidden = on ? s.homeHidden.filter((x) => x !== id) : [...s.homeHidden, id];
          await save();
        }));
    }

    new Setting(containerEl).setName("Other pages").setHeading();
    const text = (name: string, desc: string, key: "reviewCategory" | "decisionCategory" | "letterCategory" | "writeCategory") =>
      new Setting(containerEl).setName(name).setDesc(desc).addText((t) => t.setValue(s[key]).onChange(async (v) => { s[key] = v.trim() || DEFAULT_SETTINGS[key]; await save(); }));
    text("Review category", "Weekly review notes are filed under this category page, e.g. [[Reviews]].", "reviewCategory");
    text("Decision category", "Decision log notes use this category.", "decisionCategory");
    text("Letter category", "Letters to future you use this category.", "letterCategory");
    text("Writing category", "Freewrite notes from the Write page use this category.", "writeCategory");
    const num = (name: string, desc: string, key: "writeGoal" | "gardenDays" | "gardenCount", min: number) =>
      new Setting(containerEl).setName(name).setDesc(desc).addText((t) => t.setValue(String(s[key])).onChange(async (v) => { s[key] = Math.max(min, parseInt(v) || DEFAULT_SETTINGS[key]); await save(); }));
    num("Daily word goal", "Shown on Write and Home.", "writeGoal", 1);
    num("Garden: untouched for (days)", "A note is a candidate once it has not been edited for this long.", "gardenDays", 7);
    num("Garden: notes at a time", "", "gardenCount", 1);
    new Setting(containerEl)
      .setName("Garden: ignore these folders")
      .setDesc("Comma separated. Daily and weekly notes and your inbox are skipped by default.")
      .addText((t) => t.setValue(s.gardenExcludeFolders).onChange(async (v) => { s.gardenExcludeFolders = v; await save(); }));

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
