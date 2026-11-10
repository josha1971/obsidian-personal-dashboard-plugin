# Personal Dashboard (Obsidian plugin)

A rule-based dashboard for a mostly folderless vault. No AI, no network access. Everything it decides is a simple rule you can read in the code.

A navigation bar on every page moves between them in the same tab. **Capture** and **Log** buttons are always in the corner.

| Page | What it does |
| --- | --- |
| **Home** | Capture box, a New note box, today's rhythm, **Favorites**, next steps, recent logs, a letter from past you when one arrives, and a few notes from the garden. Sections can be switched off in settings. |
| **Write** | Freewrite with a word goal, prompts drawn from your own notes, and your unfinished drafts (`status: draft`). The draft you're typing survives a restart. |
| **Tasks** | Every `- [ ]` in the vault. Filter by status, due date, priority, tag, or any property of the note it lives in. Tick off with Undo. |
| **Search** | Notes, inbox lines and tasks together. |
| **Library** | List, board and calendar over any property. Drag a card between board columns to change that one property (with Undo). Click a note for its overview: properties, linked notes grouped by a property, activity by month, and notes sharing a property. |
| **Logs** | Everything you've logged. Filter, sort, search, favorite. **Explore** with charts: count, rating or spend by month, split by any field, plus a ranking table. |
| **Garden** | Brings back a few notes you haven't touched for a while (same ones all day, shuffle for more). Recall mode shows only the title first. |
| **Review** | Your week in numbers and a three-question review saved as one new note. |
| **Look back** | Letters to future you (they return on Home on the date you pick) and a decision log with a look-back date and outcome. |
| **Choose for me** | Dinner out, cook tonight, movie night, what to read... picked from your own ratings, or from things you saved but haven't tried. |

**Quick capture** turns `call Sam ~15m !low @fri` into a task (15 minutes, low priority, due Friday) and shows how it was read before saving. New lines go to the top of one inbox note, so the mobile widget can open it.

**Quick Log** covers books, films, TV, music, restaurants and bars, cooked food, drinks made and thoughts. Each saves a new note with `category: ["[[Books]]"]` etc. and shows the exact note first. Log types are JSON in settings, so you can add or rename types and fields.

**Favorites**: toggle from the command palette, a note's menu, or the star. Notes get `favorite: true`. Canvases and other non-note files are remembered in the plugin settings.

## Rules it follows

- It never edits existing notes in bulk. Anything it creates is a new note, after you press a button.
- Single changes (a tick, a favorite, a board move, a look-back) change one note and offer Undo.
- Everything has a hover explanation.
- No AI: anything the plugin decides is a rule.
- Letters to future you stay out of the dashboard until they arrive: Search, Library, overviews, Garden, Write prompts and Favorites all skip them. (The note itself is still an ordinary file, so Obsidian can open it.)

## Install

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/personal-dashboard/`, then enable **Personal Dashboard** under Settings, Community plugins. Needs Obsidian 1.8.7 or newer. Works on mobile.

Build from source: `npm install && npm run build`. Tests: `npm test` (parsing, note building, and a smoke test that renders every page against a fake vault).

## Settings

Inbox note path and where new captures go (top or bottom), category property, where new notes go, folders to ignore, favorite property, Home sections, category names for reviews, decisions, letters and writing, daily word goal, garden rules, and the log types as JSON.

Review, decision, letter and writing notes are filed under category pages named in settings (`Reviews`, `Decisions`, `Letters`, `Writing` by default). Create those pages in your Categories folder if you'd like to see them there.
