import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable, human-readable id for list items created in the editor. */
export function makeId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word.length <= 2 && !/^(hr|it|qa|qc|vdc|bim|mep)$/i.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function truncate(input: string, max = 120): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max - 1).trimEnd()}…`;
}

/** Format an ISO timestamp for the dashboard without pulling in a date lib. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

/** Escape a string for use inside a RegExp. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, mime = "text/plain") {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function slugify(input: string, fallback = "resume"): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

/** Length of the shared opening between two strings. */
export function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

/** Length of the shared ending between two strings. */
export function commonSuffixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[a.length - 1 - index] === b[b.length - 1 - index]) index += 1;
  return index;
}

/**
 * Decides whether a text change replaced the content outright (a paste into an
 * empty box, or a select-all overwrite) rather than editing it in place.
 *
 * The workspace uses this to know when to drop the user's manual corrections to
 * the parser output: those corrections belong to the posting that was in the box
 * when they were made, so carrying them onto a different posting would silently
 * put the wrong company name on a resume.
 *
 * Similarity is the surviving prefix *plus* suffix — a typo fix in the middle of
 * a posting leaves almost the whole string intact and must not count as a
 * replacement, whereas a different posting shares almost nothing.
 */
export function isWholesaleTextChange(previous: string, next: string): boolean {
  const before = previous.trim();
  const after = next.trim();
  if (after.length < 60) return false;
  if (before.length === 0) return true;

  const shared = commonPrefixLength(before, after) + commonSuffixLength(before, after);
  const longest = Math.max(before.length, after.length);
  return shared / longest < 0.5;
}
