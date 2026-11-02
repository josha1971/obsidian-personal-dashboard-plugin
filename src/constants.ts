export const VIEW_HOME = "personal-dashboard-home";
export const VIEW_TASKS = "personal-dashboard-tasks";
export const VIEW_LOGS = "personal-dashboard-logs";
export const VIEW_WRITE = "personal-dashboard-write";
export const VIEW_SEARCH = "personal-dashboard-search";
export const VIEW_LIBRARY = "personal-dashboard-library";
export const VIEW_GARDEN = "personal-dashboard-garden";
export const VIEW_REVIEW = "personal-dashboard-review";
export const VIEW_LOOKBACK = "personal-dashboard-lookback";
export const VIEW_CHOOSE = "personal-dashboard-choose";
export const VIEW_OVERVIEW = "personal-dashboard-overview";

export type PageId = "home" | "write" | "tasks" | "search" | "library" | "logs" | "garden" | "review" | "lookback" | "choose" | "overview";

/** The pages shown in the navigation bar, in order. */
export const NAV: { id: PageId; label: string; icon: string; type: string; tip: string }[] = [
  { id: "home", label: "Home", icon: "layout-dashboard", type: VIEW_HOME, tip: "Today at a glance" },
  { id: "write", label: "Write", icon: "pencil", type: VIEW_WRITE, tip: "Freewrite, prompts from your own notes, unfinished drafts" },
  { id: "tasks", label: "Tasks", icon: "check-square", type: VIEW_TASKS, tip: "Every checkbox in the vault" },
  { id: "search", label: "Search", icon: "search", type: VIEW_SEARCH, tip: "Notes, inbox lines and tasks together" },
  { id: "library", label: "Library", icon: "library", type: VIEW_LIBRARY, tip: "List, board and calendar over any property" },
  { id: "logs", label: "Logs", icon: "book-open", type: VIEW_LOGS, tip: "Everything you've logged, with charts" },
  { id: "garden", label: "Garden", icon: "sprout", type: VIEW_GARDEN, tip: "Old notes brought back a few at a time" },
  { id: "review", label: "Review", icon: "calendar-check", type: VIEW_REVIEW, tip: "Your week in numbers and a short guided review" },
  { id: "lookback", label: "Look back", icon: "history", type: VIEW_LOOKBACK, tip: "Letters to future you and your decision log" },
  { id: "choose", label: "Choose for me", icon: "dices", type: VIEW_CHOOSE, tip: "Pick dinner, a film or a book from your own ratings" },
];

export const PAGE_TYPES: Record<string, string> = Object.fromEntries([...NAV.map((n) => [n.id, n.type]), ["overview", VIEW_OVERVIEW]]);
