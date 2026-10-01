/**
 * What the pipeline is actually doing.
 *
 * The saved applications are a record of stages and dates, and until now the app has only ever shown where each
 * one *stands* — a list, a calendar, a map. This module answers the other question, the one a job search
 * actually turns on: is this working? Where do applications leak out of the funnel, which ones have gone quiet,
 * and does a higher match score convert into a reply at all.
 *
 * Three things it deliberately does **not** do.
 *
 * It does not invent timing nobody recorded. There is no timestamp for "when did this move to Screen", so there
 * is no "median days in stage" here, and a dashboard that guessed one would be worse than a dashboard with a gap
 * in it. What can be measured honestly is how long each application has been *out* — `appliedAt` against today
 * — and that is what it uses.
 *
 * It does not count an archived record as a stage anybody reached. Archiving says the search moved on, not how
 * far that application got: it might have been a rejection at Screen or a job that closed in week one, and the
 * record cannot tell them apart. So archived records are counted in the totals and kept out of every rate, and
 * the board says which numbers they are missing from.
 *
 * And it does not dress a correlation up as a cause. If reply rates climb with the match score that is worth
 * knowing and worth acting on, but at the scale of one person's search these numbers are a mirror, not a proof.
 */

import { daysBetween, isIsoDate, todayIso } from "./dates";
import { pipelineSummary } from "./applications";
import { APPLICATION_STAGES, type ApplicationStage, type SavedApplication, type WorkMode } from "./types";

/** Out this long with no reply, and a nudge is the only thing left to try. */
export const STALE_AFTER_DAYS = 21;
/** Out this long with nothing ever sent after it: not a metric, a gap. */
export const NEVER_CHASED_AFTER_DAYS = 14;

/** The stages that mean it actually went out, which is the only honest base for a reply rate. */
const SENT_STAGES: ApplicationStage[] = ["Applied", "Screen", "Interview", "Offer"];
/** The stages that mean a human answered. */
const REPLIED_STAGES: ApplicationStage[] = ["Screen", "Interview", "Offer"];

/** How many records are standing at each stage right now. */
export interface StageCount {
  stage: ApplicationStage;
  count: number;
  /** Share of everything still in play. */
  share: number;
}

/** One step of the funnel: how many got at least this far. */
export interface StageReach {
  stage: ApplicationStage;
  count: number;
  share: number;
}

/** An application that has gone quiet, or was never chased. */
export interface WaitingRow {
  entry: SavedApplication;
  /** Whole days since it went out. */
  days: number;
  /** Follow-up dates it has already had. */
  chases: number;
}

/** Sent and replied within one band of match score, for "does tailoring convert?". */
export interface ScoreBand {
  label: string;
  floor: number;
  sent: number;
  replied: number;
  /** Null rather than 0 when nothing was sent in this band: an empty band has no rate. */
  rate: number | null;
}

/** The same question for a work mode: was the commute worth it? */
export interface ModeRow {
  mode: WorkMode;
  sent: number;
  replied: number;
  rate: number | null;
}

export interface PipelineReport {
  today: string;
  total: number;
  /** Still in play: not archived. */
  live: number;
  /** Archived, and therefore missing from every rate below. */
  closed: number;
  /** Went out: Applied or further along. */
  sent: number;
  /** Got a human answer: Screen or further. */
  replied: number;
  /** Reached at least one interview. */
  interviewed: number;
  offers: number;
  replyRate: number | null;
  interviewRate: number | null;
  offerRate: number | null;
  byStage: StageCount[];
  funnel: StageReach[];
  /** Out at least `STALE_AFTER_DAYS` with no reply, longest first. */
  waiting: WaitingRow[];
  /** Out at least `NEVER_CHASED_AFTER_DAYS` with no follow-up ever recorded, longest first. */
  neverChased: WaitingRow[];
  /** Saved and never applied to, oldest first — the pile everybody has. */
  unsent: WaitingRow[];
  overdueFollowUps: number;
  dueThisWeek: number;
  appliedThisMonth: number;
  /** Median days out across the applications still waiting on somebody, or null if none are. */
  medianDaysOut: number | null;
  bands: ScoreBand[];
  byMode: ModeRow[];
}

/**
 * The middle of a set of numbers, or null when there are none.
 *
 * The mean of the two middle values when the count is even, which is the honest answer rather than picking one of
 * them. Null for an empty set, because "0 days" and "no data" are different claims.
 */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A rate as a fraction, or null when the base is empty. */
function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Whole days since this application went out, or null if it never did. */
export function daysOut(
  entry: Pick<SavedApplication, "appliedAt">,
  today: string = todayIso(),
): number | null {
  if (!isIsoDate(entry.appliedAt)) return null;
  return daysBetween(entry.appliedAt, today);
}

/** Where a stage sits along the pipeline. `Archived` is not a place in it, so it is never ranked. */
function rank(stage: ApplicationStage): number {
  return APPLICATION_STAGES.indexOf(stage);
}

/** The bands, widest first, because that is the order they matter in. */
const BAND_FLOORS: { label: string; floor: number }[] = [
  { label: "85+", floor: 85 },
  { label: "75–84", floor: 75 },
  { label: "60–74", floor: 60 },
  { label: "under 60", floor: 0 },
];

/** A rate as a person reads it: "3 of 6 (50%)", or "—" when there is nothing to divide. */
export function describeRate(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${part} of ${whole} (${Math.round((part / whole) * 100)}%)`;
}

/** The short form, for a tile that already shows both numbers. */
export function percentLabel(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}


/**
 * The report.
 *
 * `today` is a parameter so the suite can pin a date instead of waiting for one; everything the report says is
 * relative to it, and nothing here reads a clock of its own.
 */
export function pipelineReport(
  applications: SavedApplication[],
  today: string = todayIso(),
): PipelineReport {
  const liveEntries = applications.filter((entry) => entry.stage !== "Archived");
  const sentEntries = liveEntries.filter((entry) => SENT_STAGES.includes(entry.stage));
  const repliedEntries = liveEntries.filter((entry) => REPLIED_STAGES.includes(entry.stage));
  const interviewedEntries = liveEntries.filter(
    (entry) => entry.stage === "Interview" || entry.stage === "Offer",
  );
  const offers = liveEntries.filter((entry) => entry.stage === "Offer").length;

  const byStage: StageCount[] = APPLICATION_STAGES.filter((stage) =>
    applications.some((entry) => entry.stage === stage),
  ).map((stage) => {
    const count = applications.filter((entry) => entry.stage === stage).length;
    return { stage, count, share: rate(count, liveEntries.length) ?? 0 };
  });

  // "Saved" here means the record exists and is still in play; every further step is "got at least this far",
  // which is why the counts can only fall.
  const funnel: StageReach[] = (["Saved", ...SENT_STAGES] as ApplicationStage[]).map((stage) => {
    const count =
      rank(stage) === 0
        ? liveEntries.length
        : liveEntries.filter((entry) => rank(entry.stage) >= rank(stage)).length;
    return { stage, count, share: rate(count, liveEntries.length) ?? 0 };
  });

  /** Every application that went out, with how long ago that was — the honest half of the timing. */
  const dated: { entry: SavedApplication; days: number }[] = [];
  for (const entry of sentEntries) {
    const days = daysOut(entry, today);
    if (days !== null) dated.push({ entry, days });
  }
  const asRow = ({ entry, days }: { entry: SavedApplication; days: number }): WaitingRow => ({
    entry,
    days,
    chases: (entry.followUpHistory ?? []).filter(isIsoDate).length,
  });
  const byLongestFirst = (left: WaitingRow, right: WaitingRow) => right.days - left.days;

  const waiting = dated
    .filter((row) => row.entry.stage === "Applied" && row.days >= STALE_AFTER_DAYS)
    .map(asRow)
    .sort(byLongestFirst);

  const neverChased = dated
    .filter(
      (row) =>
        row.days >= NEVER_CHASED_AFTER_DAYS &&
        (row.entry.followUpHistory ?? []).filter(isIsoDate).length === 0 &&
        !isIsoDate(row.entry.followUpAt),
    )
    .map(asRow)
    .sort(byLongestFirst);

  const unsent = liveEntries
    .filter((entry) => entry.stage === "Saved" && isIsoDate(entry.savedAt))
    .map((entry) => ({ entry, days: daysBetween(entry.savedAt, today), chases: 0 }))
    .filter((row) => row.days >= NEVER_CHASED_AFTER_DAYS)
    .sort(byLongestFirst);

  const bands: ScoreBand[] = BAND_FLOORS.map((band, index) => {
    const ceiling = index === 0 ? Infinity : BAND_FLOORS[index - 1].floor;
    const inBand = sentEntries.filter(
      (entry) => entry.matchScore >= band.floor && entry.matchScore < ceiling,
    );
    const replied = inBand.filter((entry) => REPLIED_STAGES.includes(entry.stage)).length;
    return {
      label: band.label,
      floor: band.floor,
      sent: inBand.length,
      replied,
      rate: rate(replied, inBand.length),
    };
  });

  const byMode: ModeRow[] = [...new Set(sentEntries.map((entry) => entry.workMode))].sort().map((mode) => {
    const inMode = sentEntries.filter((entry) => entry.workMode === mode);
    const replied = inMode.filter((entry) => REPLIED_STAGES.includes(entry.stage)).length;
    return { mode, sent: inMode.length, replied, rate: rate(replied, inMode.length) };
  });

  // The month/week counts come from the calendar's own summary, so the board and the calendar cannot disagree.
  const calendar = pipelineSummary(applications, today);

  return {
    today,
    total: applications.length,
    live: liveEntries.length,
    closed: applications.length - liveEntries.length,
    sent: sentEntries.length,
    replied: repliedEntries.length,
    interviewed: interviewedEntries.length,
    offers,
    replyRate: rate(repliedEntries.length, sentEntries.length),
    interviewRate: rate(interviewedEntries.length, sentEntries.length),
    offerRate: rate(offers, sentEntries.length),
    byStage,
    funnel,
    waiting,
    neverChased,
    unsent,
    overdueFollowUps: calendar.overdue,
    dueThisWeek: calendar.dueThisWeek,
    appliedThisMonth: calendar.appliedThisMonth,
    // Only the ones still waiting on somebody: an application that reached an interview is not "out" in the
    // sense this number means.
    medianDaysOut: median(dated.filter((row) => row.entry.stage === "Applied").map((row) => row.days)),
    bands,
    byMode,
  };
}

