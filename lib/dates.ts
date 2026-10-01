/**
 * Dates for the application pipeline.
 *
 * Everything here works on ISO date strings (`YYYY-MM-DD`) rather than Date
 * objects, because that is what the application record stores and what a
 * `<input type="date">` reads and writes. Two rules make the arithmetic safe:
 *
 *  - Dates are built and read in **local** time. `new Date("2026-09-29")` parses as
 *    UTC midnight, which is the previous day west of Greenwich — the classic
 *    off-by-one that makes a follow-up land a day early.
 *  - Comparison happens on the `YYYY-MM-DD` strings themselves, which sort
 *    lexicographically, so no timezone can creep in at all.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as `YYYY-MM-DD` in the viewer's own timezone. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses `YYYY-MM-DD` as a local date, or `null` if it is not one. */
export function fromIsoDate(iso: string): Date | null {
  // Shape-checked here rather than via `isIsoDate`, which delegates to this
  // function — calling each other would recurse until the stack blew.
  if (typeof iso !== "string" || !ISO_DATE.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects nonsense like 2026-02-31, which rolls over to March.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && fromIsoDate(value) !== null;
}

/**
 * Shifts a date by whole days.
 *
 * Built through the local `Date` constructor rather than by adding milliseconds,
 * so a daylight-saving boundary cannot shift the result by an hour and land on
 * the wrong day.
 */
export function addDays(iso: string, days: number): string {
  const date = fromIsoDate(iso);
  if (!date || !Number.isFinite(days)) return iso;
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + Math.trunc(days)));
}

/** Whole days from `fromIso` to `toIso`; negative when `toIso` is earlier. */
export function daysBetween(fromIso: string, toIso: string): number {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso)) return 0;
  const a = fromIsoDate(fromIso)!;
  const b = fromIsoDate(toIso)!;
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bUtc - aUtc) / 86_400_000);
}

/** "Sep 29, 2026" — the short form used across the pipeline screens. */
export function formatIsoDate(iso: string): string {
  const date = fromIsoDate(iso);
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "today" / "in 3 days" / "5 days ago", for badges and rows. */
export function relativeDayLabel(iso: string, now: string = todayIso()): string {
  if (!isIsoDate(iso)) return "";
  const gap = daysBetween(now, iso);
  if (gap === 0) return "today";
  if (gap === -1) return "yesterday";
  if (gap === 1) return "tomorrow";
  return gap > 0 ? `in ${gap} days` : `${Math.abs(gap)} days ago`;
}

/** A weekday-weekdate label, e.g. "Tue, Sep 29, 2026". */
export function formatIsoDateWithWeekday(iso: string): string {
  const date = fromIsoDate(iso);
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface DateOffset {
  id: string;
  label: string;
  days: number;
}

/** The follow-up offsets worth one click. */
export const FOLLOW_UP_PRESETS: DateOffset[] = [
  { id: "d3", label: "3 days", days: 3 },
  { id: "w1", label: "1 week", days: 7 },
  { id: "w2", label: "2 weeks", days: 14 },
  { id: "w3", label: "3 weeks", days: 21 },
  { id: "d30", label: "1 month", days: 30 },
];

/** "2 weeks" / "5 days", for describing an offset in prose. */
export function describeOffset(days: number): string {
  if (!Number.isFinite(days) || days === 0) return "same day";
  const abs = Math.abs(days);
  const prefix = days < 0 ? "-" : "";
  if (abs % 7 === 0) {
    const weeks = abs / 7;
    return `${prefix}${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  return `${prefix}${abs} day${abs === 1 ? "" : "s"}`;
}

/* -------------------------------------------------------------------------- */
/* Month and week grids                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Shifts by whole months, clamped to a day the target month actually has.
 *
 * `new Date(2026, 0 + 1, 31)` is 31 February, which JavaScript rolls forward to
 * 3 March — so navigating a month at a time from the 31st would skip February
 * entirely. Month arithmetic has to clamp.
 */
export function addMonths(iso: string, months: number): string {
  const date = fromIsoDate(iso);
  if (!date || !Number.isFinite(months)) return iso;
  const anchor = new Date(date.getFullYear(), date.getMonth() + Math.trunc(months), 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return toIsoDate(
    new Date(anchor.getFullYear(), anchor.getMonth(), Math.min(date.getDate(), lastDay)),
  );
}

export function startOfMonth(iso: string): string {
  const date = fromIsoDate(iso);
  if (!date) return iso;
  return toIsoDate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonth(iso: string): string {
  const date = fromIsoDate(iso);
  if (!date) return iso;
  return toIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

/** Week start is configurable because Sunday-first is not universal. */
export function startOfWeek(iso: string, weekStartsOn = 0): string {
  const date = fromIsoDate(iso);
  if (!date) return iso;
  const shift = (date.getDay() - weekStartsOn + 7) % 7;
  return addDays(iso, -shift);
}

export function endOfWeek(iso: string, weekStartsOn = 0): string {
  return addDays(startOfWeek(iso, weekStartsOn), 6);
}

export function isSameMonth(a: string, b: string): boolean {
  return isIsoDate(a) && isIsoDate(b) && a.slice(0, 7) === b.slice(0, 7);
}

export function monthLabel(iso: string): string {
  const date = fromIsoDate(iso);
  if (!date) return "";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function dayOfMonth(iso: string): number {
  return fromIsoDate(iso)?.getDate() ?? 0;
}

/** Every day of the month, in order. */
export function monthDays(iso: string): string[] {
  const days: string[] = [];
  const last = endOfMonth(iso);
  for (let day = startOfMonth(iso); day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

/**
 * A six-week grid covering the month, Sunday-first by default.
 *
 * Always six rows so the calendar doesn't change height as you page through it,
 * and so any month fits: a 31-day month starting on a Saturday needs six.
 */
export function monthMatrix(iso: string, weekStartsOn = 0): string[][] {
  const first = startOfWeek(startOfMonth(iso), weekStartsOn);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(first, week * 7 + day)),
  );
}

export function weekdayLabels(
  weekStartsOn = 0,
  format: "short" | "narrow" = "short",
): string[] {
  // A known Sunday, then rotated, so the labels always match the grid columns.
  const sunday = "2026-01-04";
  return Array.from({ length: 7 }, (_, index) => {
    const date = fromIsoDate(addDays(sunday, (index + weekStartsOn) % 7));
    return date ? date.toLocaleDateString(undefined, { weekday: format }) : "";
  });
}

export function isWeekend(iso: string): boolean {
  const day = fromIsoDate(iso)?.getDay();
  return day === 0 || day === 6;
}
