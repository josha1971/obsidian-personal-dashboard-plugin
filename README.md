# Personal Dashboard (Obsidian plugin)

A rule-based dashboard for a mostly folderless vault. No AI, no network access.

- **Home**: today's date, a capture box, a "next best step" chosen by simple rules, open/overdue/inbox/logged-this-week counts, next tasks, recent logs.
- **Capture**: one line becomes a note or a task in a single inbox note. `call Sam ~15m !low @fri` is read as a task (15 minutes, low priority, due Friday). The preview shows how it was understood and the exact line that will be saved.
- **Tasks**: every `- [ ]` in the vault. Filter by status, due date, priority, tag, or any property of the note a task lives in. Group, search, tick off with Undo.
- **Quick Log**: books, films, TV, music, restaurants/bars, food cooked, drinks made, and thoughts. Each saves a new note with `category: ["[[Books]]"]` etc. and shows the exact note before saving.
- **Favorites**: flag any note as a favorite (`favorite: true`) and it appears on Home. Canvases and other non-note files can be favorites too (remembered in the plugin settings, since they have no properties). Toggle from the note menu, the command palette, or the star in Logs.
- **Logs**: browse everything you've logged. Filter by kind and time range, sort, search (including note text), and read excerpts without opening the notes.

Rules it follows: it never edits existing notes in bulk, new notes are created only after you press Save, single changes have Undo, and everything has a hover explanation.

## Install

Copy `main.js`, `manifest.json` and `styles.css` into `<your vault>/.obsidian/plugins/personal-dashboard/`, then enable **Personal Dashboard** under Settings, Community plugins. (Works on Obsidian mobile too.)

To build from source: `npm install && npm run build`. Run the tests with `npm test`.

## Configuring

Settings has the inbox note path, the category property (default `category`), where new log notes go (default: vault root), folders to ignore, and the log types as JSON (add types, rename them, change fields). Field kinds: `text`, `longtext`, `number`, `rating`, `date`, `choice`, `multi`.

A log note is recognised by its `category` link matching a log type's `category`, so notes you already have (e.g. `category: ["[[Drinks]]"]`) show up in Logs automatically.

## Mobile

Capture goes to one note (`Inbox.md` by default). Point the Obsidian mobile widget at it for one-tap capture, or open Quick capture from the command palette.
