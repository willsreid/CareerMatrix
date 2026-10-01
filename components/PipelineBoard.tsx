"use client";

import * as React from "react";
import { AlarmClock, ArrowRight, Bell, Clock, Percent, Target, TrendingUp, Trophy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  NEVER_CHASED_AFTER_DAYS,
  STALE_AFTER_DAYS,
  describeRate,
  percentLabel,
  pipelineReport,
  type WaitingRow,
} from "@/lib/pipeline";
import { STAGE_INK, type SavedApplication } from "@/lib/types";

/**
 * How the search is going, not just where everything is.
 *
 * The calendar says what is due, the map says where it is, and the saved list says what it is. None of them
 * answers the question that actually decides things: is any of this working? This board does, from the same
 * records — where the applications leak out of the funnel, which ones have gone quiet on you, and whether a
 * higher match score has ever converted into a reply.
 *
 * Everything it shows is a count of what is already in the records, and the two places where that is not enough
 * — how long each *stage* took, and which archived applications got anywhere — are said out loud rather than
 * filled in with a plausible-looking number. See `lib/pipeline.ts` for the reasoning.
 */

/** How many rows a list shows before it counts the rest instead. */
const LIST_LIMIT = 5;

/** The three kinds of "worth a look", so a row can be found by either. */
type RowKind = "quiet" | "unchased" | "unsent";

/** One headline number: what it is, how many, and the share it is out of. */
function Stat({
  name,
  label,
  value,
  rate,
  hint,
  Icon,
}: {
  name: string;
  label: string;
  value: number;
  rate?: string;
  hint: string;
  Icon: typeof TrendingUp;
}) {
  return (
    <div data-stat={name} className="rounded-lg border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span data-stat-value className="text-xl font-semibold tabular-nums">
          {value}
        </span>
        {rate ? (
          <span data-stat-rate className="text-[11px] text-muted-foreground">
            {rate}
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

/** A horizontal bar, for a funnel step or a rate. */
function Bar({ share, ink }: { share: number; ink: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.max(2, Math.min(100, share * 100))}%`, backgroundColor: ink }}
      />
    </div>
  );
}

/**
 * One list of applications that need something, with the reason in the heading.
 *
 * The three lists overlap on purpose: "out three weeks with no reply" and "never chased" can be the same
 * application seen two ways, and they lead to different actions — chase it, or decide it is dead.
 */
function LookList({
  kind,
  label,
  note,
  rows,
  ink,
}: {
  kind: RowKind;
  label: string;
  note: string;
  rows: WaitingRow[];
  ink: string;
}) {
  if (!rows.length) return null;
  const shown = rows.slice(0, LIST_LIMIT);
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ink }} aria-hidden />
        {label} ({rows.length})
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{note}</p>
      {shown.map((row) => (
        /*
          The whole row is the link to the record: a to-do list you cannot act on from where it is written is
          just a list. A plain anchor, so this renders anywhere the records do — including a harness with no
          router mounted.
        */
        <a
          key={row.entry.id}
          data-kind={kind}
          data-entry={row.entry.id}
          href={`/saved?open=${encodeURIComponent(row.entry.id)}`}
          title={`Open the ${row.entry.company || "saved"} record`}
          className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] transition-colors hover:border-primary"
        >
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-foreground">{row.entry.jobTitle}</span>
            {row.entry.company ? (
              <span className="text-muted-foreground"> · {row.entry.company}</span>
            ) : null}
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{row.days} days</span>
          {row.chases ? (
            <Badge variant="muted" className="h-4 shrink-0 px-1.5 text-[10px]">
              chased {row.chases}×
            </Badge>
          ) : null}
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      ))}
      {rows.length > shown.length ? (
        <p className="text-[11px] text-muted-foreground">and {rows.length - shown.length} more.</p>
      ) : null}
    </div>
  );
}

/**
 * The board.
 *
 * It takes the applications as a prop rather than reading the provider, so the suite can render it with a
 * fixture, and so it can be dropped anywhere the records already are.
 */
export function PipelineBoard({ applications }: { applications: SavedApplication[] }) {
  const report = React.useMemo(() => pipelineReport(applications), [applications]);

  if (!report.total) {
    return (
      <Card data-empty="yes">
        <CardContent className="space-y-1 p-6 text-center">
          <p className="text-sm font-medium">Nothing to measure yet</p>
          <p className="mx-auto max-w-lg text-xs leading-relaxed text-muted-foreground">
            The numbers start when applications do: save a variant, record the day it went out, and move it
            along as it moves. Everything here is a count of what those records say — nothing is estimated, and
            a stage nobody has reached yet reads as a gap rather than a zero.
          </p>
        </CardContent>
      </Card>
    );
  }

  const anythingToDo =
    report.overdueFollowUps > 0 ||
    report.waiting.length > 0 ||
    report.neverChased.length > 0 ||
    report.unsent.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          name="sent"
          label="Went out"
          value={report.sent}
          Icon={ArrowRight}
          hint={`past “Saved”, ${report.appliedThisMonth} of them this month`}
        />
        <Stat
          name="replied"
          label="Replied"
          value={report.replied}
          rate={percentLabel(report.replyRate)}
          Icon={Bell}
          hint={report.sent ? `${describeRate(report.replied, report.sent)} got an answer` : "nothing sent yet"}
        />
        <Stat
          name="interviewed"
          label="Interviewed"
          value={report.interviewed}
          rate={percentLabel(report.interviewRate)}
          Icon={Target}
          hint="reached at least one interview"
        />
        <Stat
          name="offers"
          label="Offers"
          value={report.offers}
          rate={percentLabel(report.offerRate)}
          Icon={Trophy}
          hint={report.offers === 1 ? "one is on the table" : "so far"}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" aria-hidden /> Where they are
          </CardTitle>
          <CardDescription>
            How many got at least this far. A stage only ever moves forwards here, so standing at Interview
            means it got there.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.funnel.map((step) => (
            <div
              key={step.stage}
              data-funnel={step.stage}
              data-funnel-count={step.count}
              className="space-y-1"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-medium">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ backgroundColor: STAGE_INK[step.stage] }}
                    aria-hidden
                  />
                  {step.stage}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {step.count} · {Math.round(step.share * 100)}% of {report.live} in play
                </span>
              </div>
              <Bar share={step.share} ink={STAGE_INK[step.stage]} />
            </div>
          ))}

          <div className="space-y-1 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
            {report.medianDaysOut !== null ? (
              <p className="flex items-center gap-1.5" data-median-days={report.medianDaysOut}>
                <Clock className="h-3.5 w-3.5" aria-hidden />
                The ones still waiting to hear have been out a median of{" "}
                <span className="font-medium text-foreground">{report.medianDaysOut}</span> days.
              </p>
            ) : null}
            {report.closed ? (
              <p data-archived={report.closed}>
                {report.closed} archived {report.closed === 1 ? "record is" : "records are"} counted in the
                totals and left out of every rate on this board: archiving says the search moved on, not how far
                that application got.
              </p>
            ) : null}
            <p>
              There is no “days per stage” here, because nothing records *when* a stage changed — only how long
              an application has been out. A number invented for that panel would be worse than the gap.
            </p>
          </div>
        </CardContent>
      </Card>

      {anythingToDo ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" aria-hidden /> Worth a look now
            </CardTitle>
            <CardDescription>
              The part of a pipeline that is really a to-do list, in the order the dates put it in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.overdueFollowUps ? (
              <p
                data-overdue={report.overdueFollowUps}
                className="flex items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-300"
              >
                <AlarmClock className="h-3.5 w-3.5" aria-hidden />
                {report.overdueFollowUps === 1
                  ? "One follow-up is overdue"
                  : `${report.overdueFollowUps} follow-ups are overdue`}
                {report.dueThisWeek ? `, and ${report.dueThisWeek} fall due this week` : ""} — the calendar has
                the dates.
              </p>
            ) : null}

            <LookList
              kind="quiet"
              label={`No reply after ${STALE_AFTER_DAYS} days`}
              note="Still at Applied, past the point a reply usually comes. A short note costs five minutes; the alternative is wondering for another three weeks."
              rows={report.waiting}
              ink="#d97706"
            />
            <LookList
              kind="unchased"
              label="Never chased"
              note={`Out ${NEVER_CHASED_AFTER_DAYS} days or more with no follow-up ever recorded against it.`}
              rows={report.neverChased}
              ink="#4f46e5"
            />
            <LookList
              kind="unsent"
              label="Saved, never applied"
              note="Saved and then left alone. Either send it or archive it — the list is more useful when it means something."
              rows={report.unsent}
              ink="#94a3b8"
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-4 w-4" aria-hidden /> Does the matching hold up?
          </CardTitle>
          <CardDescription>
            Replied, by band of match score and by work mode. At one person&apos;s scale this is a mirror, not a
            proof: worth looking at, not worth concluding from.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            {report.bands
              .filter((band) => band.sent > 0)
              .map((band) => (
                <div
                  key={band.label}
                  data-band={band.label}
                  data-band-rate={band.rate === null ? "" : String(Math.round(band.rate * 100))}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span className="w-20 shrink-0 font-medium tabular-nums">{band.label}</span>
                  <div className="min-w-0 flex-1">
                    <Bar share={band.rate ?? 0} ink="#059669" />
                  </div>
                  <span className="w-32 shrink-0 text-right tabular-nums text-muted-foreground">
                    {describeRate(band.replied, band.sent)}
                  </span>
                </div>
              ))}
          </div>

          {report.byMode.length > 1 ? (
            <div className="space-y-1.5 border-t pt-2">
              {report.byMode.map((row) => (
                <div key={row.mode} data-mode={row.mode} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 shrink-0 font-medium">{row.mode}</span>
                  <div className="min-w-0 flex-1">
                    <Bar share={row.rate ?? 0} ink="#2563eb" />
                  </div>
                  <span className="w-32 shrink-0 text-right tabular-nums text-muted-foreground">
                    {describeRate(row.replied, row.sent)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {report.sent === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Nothing has gone out yet, so there is nothing to convert. Record the day an application is sent —
              or move it to Applied — and these numbers start meaning something.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}



