"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ClipboardList, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/WorkspaceProvider";
import { ApplicationDetailsDialog } from "@/components/ApplicationDetailsDialog";
import { JobMap } from "@/components/JobMap";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  agenda,
  calendarEvents,
  completeFollowUp,
  eventsByDate,
  pipelineSummary,
  rescheduleCount,
  snoozeFollowUp,
  type CalendarEvent,
} from "@/lib/applications";
import {
  FOLLOW_UP_PRESETS,
  addDays,
  addMonths,
  formatIsoDate,
  formatIsoDateWithWeekday,
  dayOfMonth,
  isSameMonth,
  isWeekend,
  monthLabel,
  monthMatrix,
  relativeDayLabel,
  startOfMonth,
  todayIso,
  weekdayLabels,
} from "@/lib/dates";
import { buildIcs, icsEventsFromPipeline } from "@/lib/ics";
import type { SavedApplication } from "@/lib/types";
import { cn, downloadText } from "@/lib/utils";

/**
 * Follow-up calendar.
 *
 * Built on the dates the save form collects, and deliberately not a second place
 * where pipeline data lives: the month grid, the agenda and the .ics export all read
 * one event list, so they cannot disagree about what is on a given day.
 *
 * Overdue follow-ups are surfaced first and every one can be snoozed or closed from
 * here — a reminder you cannot act on is just a list of guilt.
 */
export default function CalendarPage() {
  const { applications, updateApplication, loadApplication } = useWorkspace();
  const router = useRouter();
  const today = todayIso();
  const [month, setMonth] = React.useState(() => startOfMonth(today));
  const [selected, setSelected] = React.useState(today);
  /**
   * Which record's details are open, if any.
   *
   * The calendar is where the dates live, so it is also where the things that *arrive* with a date get written
   * down: the office address, who called, what they said. Opening details keeps you on this page rather than
   * throwing the whole workspace at you.
   */
  const [detailsId, setDetailsId] = React.useState<string | null>(null);

  const events = React.useMemo(() => calendarEvents(applications, today), [applications, today]);
  const byDate = React.useMemo(() => eventsByDate(events), [events]);
  const summary = React.useMemo(() => pipelineSummary(applications, today), [applications, today]);
  const upcoming = React.useMemo(() => agenda(events, today, 21), [events, today]);
  const overdue = React.useMemo(() => events.filter((event) => event.outstanding), [events]);
  const grid = React.useMemo(() => monthMatrix(month), [month]);
  const labels = React.useMemo(() => weekdayLabels(), []);
  const dayEvents = byDate.get(selected) ?? [];

  const entryFor = (applicationId: string) =>
    applications.find((entry) => entry.id === applicationId);

  const goTo = (target: string) => {
    setMonth(startOfMonth(target));
    setSelected(target);
  };

  const handleExport = () => {
    const entries = icsEventsFromPipeline(events, today);
    if (!entries.length) {
      toast.info("Nothing to export yet — set a follow-up date on a saved variant first.");
      return;
    }
    downloadText(
      buildIcs(entries, { calendarName: "Career Matrix follow-ups" }),
      "career-matrix-follow-ups.ics",
      "text/calendar",
    );
    toast.success(
      `${entries.length} follow-up${entries.length === 1 ? "" : "s"} exported — import the file into your own calendar.`,
    );
  };

  const snooze = (event: CalendarEvent, days: number) => {
    const entry = entryFor(event.applicationId);
    if (!entry) return;
    updateApplication(entry.id, snoozeFollowUp(entry, days));
    toast.success(`Follow-up moved to ${formatIsoDate(addDays(event.date, days))}.`);
  };

  const close = (event: CalendarEvent) => {
    const entry = entryFor(event.applicationId);
    if (!entry) return;
    updateApplication(entry.id, completeFollowUp(entry));
    toast.success(`Follow-up closed for ${entry.company}.`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <CalendarDays className="h-5 w-5 text-primary" />
            Follow-up calendar
          </h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Every applied date and follow-up you recorded when saving a variant. Applications that
            reached an offer or were archived stop chasing themselves.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{summary.appliedThisMonth} applied this month</Badge>
          <Badge variant={summary.dueThisWeek ? "warn" : "muted"}>
            {summary.dueThisWeek} due this week
          </Badge>
          <Badge variant={summary.overdue ? "destructive" : "muted"}>
            {summary.overdue} overdue
          </Badge>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <CalendarPlus className="h-4 w-4" />
            Export .ics
          </Button>
        </div>
      </header>

      {overdue.length ? (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {overdue.length} follow-up{overdue.length === 1 ? "" : "s"} past due
            </CardTitle>
            <CardDescription>
              Still in play, and past the date you set. Snooze it or close it out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-[11px]"
              >
                <span className="font-medium text-foreground">{event.jobTitle}</span>
                <span className="text-muted-foreground">{event.company}</span>
                <Badge variant="destructive" className="text-[10px]">
                  {relativeDayLabel(event.date, today)}
                </Badge>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px]"
                    data-details={event.applicationId}
                    onClick={() => setDetailsId(event.applicationId)}
                  >
                    <ClipboardList className="h-3 w-3" />
                    Details
                  </Button>
                  {FOLLOW_UP_PRESETS.filter(
                    (preset) => preset.days === 7 || preset.days === 14,
                  ).map((preset) => (
                    <Button
                      key={preset.id}
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px]"
                      onClick={() => snooze(event, preset.days)}
                    >
                      +{preset.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px]"
                    onClick={() => close(event)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <CalendarGrid
        grid={grid}
        labels={labels}
        month={month}
        today={today}
        selected={selected}
        byDate={byDate}
        onMonthChange={setMonth}
        onSelect={(day) => {
          setSelected(day);
          if (!isSameMonth(day, month)) setMonth(startOfMonth(day));
        }}
        onToday={() => goTo(today)}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <DayPanel
          selected={selected}
          dayEvents={dayEvents}
          entryFor={entryFor}
          onSnooze={snooze}
          onClose={close}
          onDetails={(applicationId) => setDetailsId(applicationId)}
          onOpen={(applicationId) => {
            loadApplication(applicationId);
            router.push("/");
          }}
        />
        <AgendaCard upcoming={upcoming} onPick={goTo} />
      </div>

      {/*
        The map sits below the calendar rather than beside it: it answers a different question — not "what is
        due" but "where is all this" — and it wants the full width to be worth looking at.
      */}
      <JobMap applications={applications} />

      {/*
        The details editor, opened from any role on this page. It stays mounted with a null record rather than
        being conditionally rendered, so the dialog's open/close animation is the dialog's own business.
      */}
      <ApplicationDetailsDialog
        application={detailsId ? (entryFor(detailsId) ?? null) : null}
        onClose={() => setDetailsId(null)}
        onOpenWorkspace={(applicationId) => {
          loadApplication(applicationId);
          router.push("/");
        }}
      />
    </div>
  );

/* -------------------------------------------------------------------------- */
/* The month grid                                                             */
/* -------------------------------------------------------------------------- */

function CalendarGrid({
  grid,
  labels,
  month,
  today,
  selected,
  byDate,
  onMonthChange,
  onSelect,
  onToday,
}: {
  grid: string[][];
  labels: string[];
  month: string;
  today: string;
  selected: string;
  byDate: Map<string, CalendarEvent[]>;
  onMonthChange: (month: string) => void;
  onSelect: (day: string) => void;
  onToday: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm">{monthLabel(month)}</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous month"
            onClick={() => onMonthChange(addMonths(month, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onToday}>
            Today
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next month"
            onClick={() => onMonthChange(addMonths(month, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="grid grid-cols-7 gap-1">
          {labels.map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.flat().map((day) => (
            <DayCell
              key={day}
              day={day}
              isToday={day === today}
              isSelected={day === selected}
              inMonth={isSameMonth(day, month)}
              weekend={isWeekend(day)}
              events={byDate.get(day) ?? []}
              onSelect={() => onSelect(day)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * One day. Markers rather than text, because a cell has room for a number and a dot
 * and nothing else — the detail lives in the day panel.
 */
function DayCell({
  day,
  isToday,
  isSelected,
  inMonth,
  weekend,
  events,
  onSelect,
}: {
  day: string;
  isToday: boolean;
  isSelected: boolean;
  inMonth: boolean;
  weekend: boolean;
  events: CalendarEvent[];
  onSelect: () => void;
}) {
  const applied = events.filter((event) => event.kind === "applied").length;
  const followUps = events.filter((event) => event.kind === "followUp").length;
  const late = events.some((event) => event.outstanding);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${formatIsoDateWithWeekday(day)}${events.length ? `, ${events.length} event(s)` : ""}`}
      className={cn(
        "flex h-16 flex-col items-start gap-1 rounded-md border p-1.5 text-left transition-colors",
        inMonth ? "bg-background" : "bg-muted/40 text-muted-foreground",
        weekend && inMonth && "bg-muted/20",
        isSelected ? "border-primary ring-1 ring-primary" : "hover:border-primary/60",
        isToday && !isSelected && "border-primary/60",
      )}
    >
      <span
        className={cn(
          "text-[11px] tabular-nums",
          isToday && "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground",
        )}
      >
        {dayOfMonth(day)}
      </span>
      <span className="flex flex-wrap gap-1">
        {applied ? (
          <span
            title={`${applied} applied`}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {applied}
          </span>
        ) : null}
        {followUps ? (
          <span
            title={`${followUps} follow-up(s)`}
            className={cn(
              "flex items-center gap-0.5 text-[10px]",
              late ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", late ? "bg-destructive" : "bg-emerald-500")}
            />
            {followUps}
          </span>
        ) : null}
      </span>
    </button>
  );
}


/* -------------------------------------------------------------------------- */
/* Day detail and agenda                                                      */
/* -------------------------------------------------------------------------- */

function DayPanel({
  selected,
  dayEvents,
  entryFor,
  onSnooze,
  onClose,
  onDetails,
  onOpen,
}: {
  selected: string;
  dayEvents: CalendarEvent[];
  entryFor: (applicationId: string) => SavedApplication | undefined;
  onSnooze: (event: CalendarEvent, days: number) => void;
  onClose: (event: CalendarEvent) => void;
  onDetails: (applicationId: string) => void;
  onOpen: (applicationId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{formatIsoDateWithWeekday(selected)}</CardTitle>
        <CardDescription>
          {dayEvents.length
            ? `${dayEvents.length} thing${dayEvents.length === 1 ? "" : "s"} on this day`
            : "Nothing on this day."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {dayEvents.map((event) => {
          const entry = entryFor(event.applicationId);
          const chases = entry ? rescheduleCount(entry) : 0;
          return (
            <div key={event.id} className="space-y-2 rounded-md border p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={event.kind === "applied" ? "secondary" : "outline"}>
                  {event.label}
                </Badge>
                <span className="text-[11px] font-medium text-foreground">{event.jobTitle}</span>
                <span className="text-[11px] text-muted-foreground">{event.company}</span>
                {event.outstanding ? (
                  <Badge variant="destructive" className="text-[10px]">
                    past due
                  </Badge>
                ) : null}
                {chases ? (
                  <Badge variant="muted" className="text-[10px]">
                    chased {chases}×
                  </Badge>
                ) : null}
              </div>

              {event.detail ? (
                <p className="text-[11px] text-muted-foreground">{event.detail}</p>
              ) : null}

              {/* The office, when you have recorded one: this is the line you navigate from on the day. */}
              {entry?.address ? (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" aria-hidden />
                  {entry.address}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  data-details={event.applicationId}
                  onClick={() => onDetails(event.applicationId)}
                >
                  <ClipboardList className="h-3 w-3" />
                  Details
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() => onOpen(event.applicationId)}
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in workspace
                </Button>
                {event.kind === "followUp" ? (
                  <>
                    {FOLLOW_UP_PRESETS.filter((preset) => preset.days !== 30).map((preset) => (
                      <Button
                        key={preset.id}
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => onSnooze(event, preset.days)}
                      >
                        +{preset.label}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={() => onClose(event)}
                    >
                      Close
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AgendaCard({
  upcoming,
  onPick,
}: {
  upcoming: CalendarEvent[];
  onPick: (day: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Next three weeks</CardTitle>
        <CardDescription>Applied dates and follow-ups, soonest first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {upcoming.length ? (
          upcoming.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onPick(event.date)}
              className="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] hover:border-primary"
            >
              <span className="w-14 shrink-0 text-muted-foreground">
                {formatIsoDate(event.date).replace(/, \d{4}$/, "")}
              </span>
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  event.kind === "applied" ? "bg-primary" : "bg-emerald-500",
                )}
              />
              <span className="truncate">
                <span className="font-medium text-foreground">{event.jobTitle}</span>
                {event.company ? ` · ${event.company}` : ""}
              </span>
            </button>
          ))
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Nothing scheduled in the next three weeks. Save a variant with a follow-up date and it
            will appear here.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

}
