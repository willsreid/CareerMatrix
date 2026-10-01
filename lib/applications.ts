/**
 * The application pipeline's own logic, kept out of the React provider so it can
 * be asserted directly.
 *
 * Saving a variant used to be a single notes string. It is now a small record —
 * when you applied, when to follow up, who to write to, where it came from —
 * because that is the data a follow-up calendar needs, and reconstructing it
 * later from free text is not possible.
 */

import {
  addDays,
  daysBetween,
  describeOffset,
  endOfWeek,
  isIsoDate,
  isSameMonth,
  startOfWeek,
  todayIso,
} from "./dates";
import type { ApplicationStage, SaveVariantDetails, SavedApplication } from "./types";

/**
 * Accepts either the old shape (a bare notes string) or the record, so any caller
 * — or a restored old draft — keeps working.
 */
export function normalizeSaveDetails(
  input: string | SaveVariantDetails | undefined,
): SaveVariantDetails {
  if (typeof input === "string") return { notes: input };
  const details = input ?? {};
  // Every free-text field is type-checked rather than trusted: a restored backup, or a record written by an
  // older version, can hold anything at all in these slots, and `.trim()` on a number is a crash.
  const text = (value: unknown) => (typeof value === "string" ? value.trim() || undefined : undefined);
  return {
    notes: typeof details.notes === "string" ? details.notes : "",
    appliedAt: isIsoDate(details.appliedAt) ? details.appliedAt : undefined,
    followUpAt: isIsoDate(details.followUpAt) ? details.followUpAt : undefined,
    contact: text(details.contact),
    source: text(details.source),
    address: text(details.address),
    stage: details.stage,
  };
}

/**
 * Which pipeline stage the save implies.
 *
 * Recording an applied date *is* the act of applying, so a record that was merely
 * saved becomes Applied. An explicit stage always wins, and nothing ever moves
 * backwards: re-saving an application already at Interview must not demote it.
 */
export function resolveStage(
  details: SaveVariantDetails,
  fallback: ApplicationStage = "Saved",
): ApplicationStage {
  if (details.stage) return details.stage;
  if (details.appliedAt && fallback === "Saved") return "Applied";
  return fallback;
}

export type FollowUpState = "none" | "overdue" | "due" | "upcoming";

export interface FollowUpStatus {
  state: FollowUpState;
  /** Whole days until the follow-up; negative when it is late. */
  days: number;
  label: string;
  /** True when a calendar would put this on today's list. */
  needsAttention: boolean;
}

/** How a follow-up date reads today, for badges and a future calendar agenda. */
export function followUpStatus(
  followUpAt: string | undefined,
  now: string = todayIso(),
): FollowUpStatus {
  if (!isIsoDate(followUpAt)) {
    return { state: "none", days: 0, label: "No follow-up date", needsAttention: false };
  }
  const days = daysBetween(now, followUpAt);
  if (days < 0) {
    return {
      state: "overdue",
      days,
      label: `Follow-up ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`,
      needsAttention: true,
    };
  }
  if (days === 0) {
    return { state: "due", days, label: "Follow up today", needsAttention: true };
  }
  return {
    state: "upcoming",
    days,
    label: `Follow up ${days === 1 ? "tomorrow" : `in ${days} days`}`,
    needsAttention: false,
  };
}

export interface ApplicationTimeline {
  appliedAt?: string;
  followUpAt?: string;
  /** "2 weeks after applying", when both dates are known. */
  followUpGap?: string;
}

/** The date facts about one application, for the saved list and the calendar. */
export function applicationTimeline(entry: {
  appliedAt?: string;
  followUpAt?: string;
}): ApplicationTimeline {
  const hasBoth = isIsoDate(entry.appliedAt) && isIsoDate(entry.followUpAt);
  return {
    appliedAt: isIsoDate(entry.appliedAt) ? entry.appliedAt : undefined,
    followUpAt: isIsoDate(entry.followUpAt) ? entry.followUpAt : undefined,
    followUpGap: hasBoth
      ? describeOffset(daysBetween(entry.appliedAt!, entry.followUpAt!))
      : undefined,
  };
}

/**
 * Whether a proposed follow-up makes sense against the applied date.
 *
 * A follow-up before the application is a data error that would put the wrong day
 * on the calendar, so it is refused rather than stored and explained later.
 */
export function validateSaveDetails(details: SaveVariantDetails): string | null {
  if (details.appliedAt && !isIsoDate(details.appliedAt)) {
    return "That applied date is not a real date.";
  }
  if (details.followUpAt && !isIsoDate(details.followUpAt)) {
    return "That follow-up date is not a real date.";
  }
  if (details.appliedAt && details.followUpAt && details.followUpAt < details.appliedAt) {
    return "The follow-up date is before the applied date.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* The calendar's data                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Stages where a follow-up is still worth making.
 *
 * An offer doesn't need chasing, and an archived application needs nothing at all —
 * so a follow-up date that falls in the past on one of those is history, not an
 * overdue task. Without this rule the calendar would nag about jobs already
 * resolved, which is how a reminder list stops being trusted.
 */
export const ACTIVE_STAGES: ApplicationStage[] = ["Saved", "Applied", "Screen", "Interview"];

export function needsChasing(entry: Pick<SavedApplication, "stage">): boolean {
  return ACTIVE_STAGES.includes(entry.stage);
}

export type CalendarEventKind = "applied" | "followUp";

export interface CalendarEvent {
  /** Stable across renders, and reused as the iCalendar UID. */
  id: string;
  date: string;
  kind: CalendarEventKind;
  applicationId: string;
  jobTitle: string;
  company: string;
  stage: ApplicationStage;
  label: string;
  detail: string;
  /** A follow-up that is past due and still worth making. */
  outstanding: boolean;
}

/**
 * Flattens the applications into dated events.
 *
 * One list feeds the month grid, the agenda and the .ics export, so the three can
 * never disagree about what is on a given day.
 */
export function calendarEvents(
  applications: SavedApplication[],
  today: string = todayIso(),
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const entry of applications) {
    const chasing = needsChasing(entry);

    if (isIsoDate(entry.appliedAt)) {
      events.push({
        id: `${entry.id}:applied:${entry.appliedAt}`,
        date: entry.appliedAt,
        kind: "applied",
        applicationId: entry.id,
        jobTitle: entry.jobTitle,
        company: entry.company,
        stage: entry.stage,
        label: "Applied",
        detail: entry.contact ? `Contact: ${entry.contact}` : "",
        outstanding: false,
      });
    }

    if (isIsoDate(entry.followUpAt)) {
      const status = followUpStatus(entry.followUpAt, today);
      const gap = describeOffset(daysBetween(entry.appliedAt ?? entry.followUpAt, entry.followUpAt));
      events.push({
        id: `${entry.id}:followUp:${entry.followUpAt}`,
        date: entry.followUpAt,
        kind: "followUp",
        applicationId: entry.id,
        jobTitle: entry.jobTitle,
        company: entry.company,
        stage: entry.stage,
        label: "Follow up",
        detail: chasing
          ? status.state === "overdue"
            ? `${status.label} — ${gap} after applying.`
            : `${gap} after applying.`
          : `${entry.stage} — no longer needs chasing.`,
        outstanding: chasing && status.state === "overdue",
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Events grouped by day, for the month grid. */
export function eventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const bucket = map.get(event.date);
    if (bucket) bucket.push(event);
    else map.set(event.date, [event]);
  }
  return map;
}

/** Everything from `from` (inclusive) through `days` later, in date order. */
export function agenda(
  events: CalendarEvent[],
  from: string = todayIso(),
  days = 14,
): CalendarEvent[] {
  const until = addDays(from, days);
  return events.filter((event) => event.date >= from && event.date <= until);
}

export interface PipelineSummary {
  /** Applications sent in the current month. */
  appliedThisMonth: number;
  /** Outstanding follow-ups falling in the current week. */
  dueThisWeek: number;
  overdue: number;
  /** Applications still in play. */
  active: number;
}

export function pipelineSummary(
  applications: SavedApplication[],
  today: string = todayIso(),
): PipelineSummary {
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  let appliedThisMonth = 0;
  let dueThisWeek = 0;
  let overdue = 0;
  let active = 0;

  for (const entry of applications) {
    if (needsChasing(entry)) active += 1;
    if (isIsoDate(entry.appliedAt) && isSameMonth(entry.appliedAt, today)) appliedThisMonth += 1;
    if (!isIsoDate(entry.followUpAt) || !needsChasing(entry)) continue;
    if (followUpStatus(entry.followUpAt, today).state === "overdue") overdue += 1;
    if (entry.followUpAt >= weekStart && entry.followUpAt <= weekEnd) dueThisWeek += 1;
  }

  return { appliedThisMonth, dueThisWeek, overdue, active };
}

/* -------------------------------------------------------------------------- */
/* Rescheduling                                                               */
/* -------------------------------------------------------------------------- */

/** How many past dates to keep per application: enough for a chase log, bounded. */
const HISTORY_LIMIT = 20;

function withHistory(entry: SavedApplication, previous?: string): string[] {
  const history = [...(entry.followUpHistory ?? [])];
  if (isIsoDate(previous) && !history.includes(previous)) history.push(previous);
  return history.slice(-HISTORY_LIMIT);
}

/**
 * Pushes a follow-up out by whole days, keeping the date it replaced so the
 * calendar can show that this one has been chased twice.
 */
export function snoozeFollowUp(
  entry: SavedApplication,
  days: number,
): Pick<SavedApplication, "followUpAt" | "followUpHistory"> {
  const from = isIsoDate(entry.followUpAt) ? entry.followUpAt : todayIso();
  return {
    followUpAt: addDays(from, days),
    followUpHistory: withHistory(entry, isIsoDate(entry.followUpAt) ? entry.followUpAt : undefined),
  };
}

/** Moves a follow-up to a specific date, recording the one it replaced. */
export function rescheduleFollowUp(
  entry: SavedApplication,
  toIso: string,
): Pick<SavedApplication, "followUpAt" | "followUpHistory"> {
  return {
    followUpAt: isIsoDate(toIso) ? toIso : entry.followUpAt,
    followUpHistory: withHistory(entry, isIsoDate(entry.followUpAt) ? entry.followUpAt : undefined),
  };
}

/** Clears the follow-up: it was done, or it is no longer wanted. */
export function completeFollowUp(
  entry: SavedApplication,
): Pick<SavedApplication, "followUpAt" | "followUpHistory"> {
  return { followUpAt: undefined, followUpHistory: withHistory(entry, entry.followUpAt) };
}

/** How many times this application's follow-up has been moved. */
export function rescheduleCount(entry: Pick<SavedApplication, "followUpHistory">): number {
  return (entry.followUpHistory ?? []).filter(isIsoDate).length;
}

/* -------------------------------------------------------------------------- */
/* Links into a record                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The application a link was asking for, from a query string: `/saved?open=<id>`.
 *
 * The map's pins and the pipeline's to-do lists all point at the record they are about, and this is the one
 * place that reads the id back out. A query string rather than a route of its own because the record already
 * has a page — `/saved` — and a second one would be a second place for the same card to drift.
 *
 * Anything that is not an id comes back as null: a hand-edited URL should leave the list alone rather than
 * empty it.
 */
export function recordIdFromSearch(search: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(query).get("open");
  const id = value?.trim();
  return id ? id : null;
}
