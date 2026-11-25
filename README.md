# Personal Dashboard (Obsidian plugin)

A rule-based dashboard for a mostly folderless vault. No AI, no network access. Everything it decides is a simple rule you can read in the code.

Home has six shortcut buttons (Add Quick Thought, Log, Open Inbox, Tasks, Logs, Look Back). Every other page has a Home button at the top. The remaining pages (Write, Search, Library, Garden, Review, Choose for me) are opened from the command palette, e.g. "Open Garden".

| Page | What it does |
| --- | --- |
| **Home** | An Add box for your Random Notes, then **Favorites**, then a compact New note box (with Work, Journal and Clipboard category buttons) beside one box with two tabs: **Recently modified** (the last 10 files edited) and **Review Clipboard** (new notes waiting for a proper category) **Todos** (every open checkbox except the wishlist, oldest first, with a quick-add field that writes into your on-the-fly todo note) and **Wishlist** (only the todos in `Wishlist.md`, with its own quick-add). Wishlist todos are kept out of Tasks, Todos and Mark all done. The lists scroll. A letter from past you appears when one arrives. Click a title bar to fold a section shut. |
| **Write** | Freewrite with a word goal, prompts drawn from your own notes, and your unfinished drafts (`status: draft`). The draft you're typing survives a restart. |
| **Tasks** | Every `- [ ]` in the vault, newest first by when each item was created, with the note title beside the date. Filter by status, due date, priority, tag, or any property of the note it lives in. Tick off with Undo, or **Mark all done** for the whole list (it asks first, and one Undo puts everything back). |
| **Search** | Notes, inbox lines and tasks together. |
| **Library** | List, board and calendar over any property. Drag a card between board columns to change that one property (with Undo). Click a note for its overview: properties, linked notes grouped by a property, activity by month, and notes sharing a property. |
| **Logs** | Everything you've logged. Filter, sort, search, favorite. **Explore** with charts: count, rating or spend by month, split by any field, plus a ranking table. |
| **Garden** | Brings back a few notes you haven't touched for a while (same ones all day, shuffle for more). Recall mode shows only the title first. |
| **Review** | Your week in numbers and a three-question review saved as one new note. |
| **Look back** | Letters to future you (they return on Home on the date you pick), a decision log with a look-back date and outcome, and **On this day**: notes created or last edited on today's date in earlier years. |
| **Choose for me** | Dinner out, cook tonight, movie night, what to read... picked from your own ratings, or from things you saved but haven't tried. |

**The Add box** on Home adds what you type as a plain bullet at the top of your inbox note (your Random Notes), below any properties and a leading `# Title`.

**Quick Thoughts**: *Add Quick Thought* on Home (or the command) opens a box that saves a note named with the date and time to the minute (`2026-11-17 1430`) in the `Quick Thoughts` folder, filed under `[[Quick Thought]]`. *See all Quick Thoughts* opens `Quick Thoughts/All Quick Thoughts` in a new tab, a good place for a Bases table of that category. Folder and category are settings.

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
