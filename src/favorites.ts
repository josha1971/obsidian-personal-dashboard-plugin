/** True when a frontmatter value means "yes": true, "true", "yes". */
export function isFlagged(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === "string") return ["true", "yes"].includes(v.trim().toLowerCase());
  return false;
}
