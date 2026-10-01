"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileDown,
  Loader2,
  Search,
  Trash2,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/WorkspaceProvider";
import { ApplicationDetailsDialog } from "@/components/ApplicationDetailsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectlessStagePicker } from "@/components/SavedStagePicker";
import {
  APPLICATION_STAGES,
  EMPHASIS_LABELS,
  type ApplicationStage,
  type SavedApplication,
} from "@/lib/types";
import { toPlainText } from "@/lib/resumeTailorer";
import { applicationTimeline, followUpStatus, recordIdFromSearch } from "@/lib/applications";
import { formatIsoDate, formatIsoDateWithWeekday, relativeDayLabel } from "@/lib/dates";
import { downloadBlob, formatDate, relativeTime, slugify } from "@/lib/utils";

function stageVariant(stage: ApplicationStage) {
  switch (stage) {
    case "Offer":
      return "success" as const;
    case "Interview":
    case "Screen":
      return "default" as const;
    case "Applied":
      return "secondary" as const;
    case "Archived":
      return "muted" as const;
    default:
      return "outline" as const;
  }
}

function ApplicationCard({ entry, focused, onDetails }: { entry: SavedApplication; focused?: boolean; onDetails: () => void }) {
  const { loadApplication, deleteApplication, updateApplication, setApplicationStage, profile } =
    useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [notes, setNotes] = React.useState(entry.notes);
  const followUp = followUpStatus(entry.followUpAt);
  const timeline = applicationTimeline(entry);

  const handleOpen = () => {
    loadApplication(entry.id);
    router.push("/");
    toast.success(`Loaded ${entry.company} into the workspace.`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(entry.resume));
      toast.success("Snapshot copied as plain text.");
    } catch {
      toast.error("Clipboard write was blocked.");
    }
  };

  const handlePdf = async () => {
    setBusy(true);
    try {
      const [{ pdf }, { buildResumePdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/ResumePdfDocument"),
      ]);
      const blob = await pdf(
        buildResumePdfDocument({ resume: entry.resume, fontPt: entry.resume.options.fontPt }),
      ).toBlob();
      // Named after the profile it came from, not after whoever wrote this app: the file lands in somebody's
      // downloads beside four others called "resume.pdf".
      downloadBlob(
        blob,
        `${slugify(profile.header.name, "resume")}_${slugify(entry.jobTitle, "role")}_${slugify(entry.company, "company")}.pdf`,
      );
      toast.success("Snapshot downloaded as PDF.");
    } catch (error) {
      console.error(error);
      toast.error("Could not render that snapshot.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      data-record={entry.id}
      data-focused={focused ? "yes" : undefined}
      className={focused ? "ring-2 ring-primary ring-offset-1" : undefined}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm">{entry.jobTitle}</CardTitle>
            <CardDescription>
              {entry.company} · {entry.location} · {entry.workMode}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={entry.matchScore >= 70 ? "success" : entry.matchScore >= 45 ? "warn" : "muted"}
            >
              {entry.matchScore}% match
            </Badge>
            <Badge variant={stageVariant(entry.stage)}>{entry.stage}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            Saved {formatDate(entry.savedAt)} ({relativeTime(entry.savedAt)})
          </span>
          <span>
            Tailored at {entry.intensity}% · {EMPHASIS_LABELS[entry.emphasis]}
          </span>
          <span>
            ATS {entry.resume.ats.score}/100 · coverage {entry.resume.ats.coverage}%
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={entry.appliedAt ? "outline" : "muted"}>
            {entry.appliedAt
              ? `Applied ${formatIsoDate(entry.appliedAt)} · ${relativeDayLabel(entry.appliedAt)}`
              : "Not applied yet"}
          </Badge>
          {followUp.state !== "none" ? (
            <Badge
              variant={
                followUp.state === "overdue"
                  ? "destructive"
                  : followUp.state === "due"
                    ? "warn"
                    : "muted"
              }
              title={entry.followUpAt ? formatIsoDateWithWeekday(entry.followUpAt) : undefined}
            >
              {followUp.label}
              {timeline.followUpGap ? ` · ${timeline.followUpGap} after applying` : ""}
            </Badge>
          ) : (
            <Badge variant="muted">No follow-up date</Badge>
          )}
          {entry.contact ? <Badge variant="muted">Contact: {entry.contact}</Badge> : null}
          {entry.source ? <Badge variant="muted">via {entry.source}</Badge> : null}
        </div>

        {/* The office, once you know it — the address you navigate to, not the line the ad carried. */}
        {entry.address ? (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" aria-hidden />
            {entry.address}
            {entry.coords ? <span className="text-primary"> · pinned</span> : null}
          </p>
        ) : null}

        <SelectlessStagePicker
          value={entry.stage}
          onChange={(stage) => setApplicationStage(entry.id, stage)}
          stages={APPLICATION_STAGES}
        />

        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes !== entry.notes) updateApplication(entry.id, { notes });
          }}
          placeholder="Interview notes, recruiter, follow-up date…"
          className="h-8 text-xs"
        />

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onDetails}>
            <ClipboardList className="h-4 w-4" />
            Details
          </Button>
          <Button size="sm" onClick={handleOpen}>
            <ArrowUpRight className="h-4 w-4" />
            Open in workspace
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy}>
            <ClipboardCheck className="h-4 w-4" />
            Copy text
          </Button>
          <Button size="sm" variant="outline" onClick={handlePdf} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => {
              if (!window.confirm(`Delete the saved ${entry.company} application?`)) return;
              deleteApplication(entry.id);
              toast.success("Deleted.");
            }}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>

        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Raw posting text</summary>
          <pre className="scroll-pane mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-[10px] leading-relaxed">
            {entry.rawJobText}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}

export default function SavedPage() {
  const { applications, ready } = useWorkspace();
  const [query, setQuery] = React.useState("");
  const [stageFilter, setStageFilter] = React.useState<ApplicationStage | "All">("All");
  const [sort, setSort] = React.useState<"recent" | "score" | "company">("recent");
  /**
   * The record a link asked for, from `/saved?open=<id>` — a pin on the map, or a row on the pipeline board.
   *
   * Read from `window.location` rather than `useSearchParams`, so the page stays statically prerenderable. The
   * filters are cleared when a record is asked for, because a filter left over from last time could hide the
   * very record the link promised.
   */
  const [focus, setFocus] = React.useState<string | null>(null);
  /** Which record's details are open, if any: the address, the contact, the notes that arrive later. */
  const [detailsId, setDetailsId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const id = recordIdFromSearch(window.location.search);
    if (!id) return;
    setFocus(id);
    setQuery("");
    setStageFilter("All");
  }, []);

  /** And once the records are in, put it somewhere it can be seen. */
  React.useEffect(() => {
    if (!ready || !focus) return;
    try {
      document
        .querySelector(`[data-record="${focus}"]`)
        ?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    } catch {
      // A hand-edited id that is not a valid selector is not worth a crash; the list is still the list.
    }
  }, [ready, focus]);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = applications.filter((entry) => {
      const matchesStage = stageFilter === "All" || entry.stage === stageFilter;
      const matchesQuery =
        !needle ||
        `${entry.jobTitle} ${entry.company} ${entry.location} ${entry.notes}`
          .toLowerCase()
          .includes(needle);
      return matchesStage && matchesQuery;
    });
    return rows.sort((a, b) => {
      if (sort === "score") return b.matchScore - a.matchScore;
      if (sort === "company") return a.company.localeCompare(b.company);
      return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
    });
  }, [applications, query, stageFilter, sort]);

  const stats = React.useMemo(() => {
    const byStage = APPLICATION_STAGES.map((stage) => ({
      stage,
      count: applications.filter((entry) => entry.stage === stage).length,
    })).filter((row) => row.count > 0);
    const best = applications.reduce<SavedApplication | null>(
      (acc, entry) => (!acc || entry.matchScore > acc.matchScore ? entry : acc),
      null,
    );
    const average =
      applications.length > 0
        ? Math.round(
            applications.reduce((sum, entry) => sum + entry.matchScore, 0) / applications.length,
          )
        : 0;
    return { byStage, best, average };
  }, [applications]);

  /** The record the link named, if it is still here. */
  const focusedEntry = focus ? (applications.find((entry) => entry.id === focus) ?? null) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Saved Target Roles</h1>
          <p className="text-xs text-muted-foreground">
            Every saved variant is a frozen snapshot, so a resume you sent in March still renders
            exactly as it did in March.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">{applications.length} saved</Badge>
          {applications.length ? (
            <Badge variant={stats.average >= 70 ? "success" : "warn"}>
              avg match {stats.average}%
            </Badge>
          ) : null}
        </div>
      </header>

      {/* A record was linked to: say which one, and offer the way back to the whole list. */}
      {focus ? (
        <Card data-focused-record={focus} className="border-primary/50 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3 text-[11px]">
            <span className="font-medium">
              {focusedEntry ? focusedEntry.jobTitle : "That record is not here any more"}
            </span>
            <span className="text-muted-foreground">
              {focusedEntry
                ? `${focusedEntry.company} — highlighted below.`
                : "The link pointed at an application that has since been deleted."}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-[11px]"
              onClick={() => setFocus(null)}
            >
              show everything
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {applications.length ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, company, notes…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              {(["recent", "score", "company"] as const).map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={sort === key ? "secondary" : "ghost"}
                  className="h-8 text-[11px] capitalize"
                  onClick={() => setSort(key)}
                >
                  {key === "score" ? "Match score" : key}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant={stageFilter === "All" ? "secondary" : "ghost"}
                className="h-7 text-[11px]"
                onClick={() => setStageFilter("All")}
              >
                All stages
              </Button>
              {stats.byStage.map((row) => (
                <Button
                  key={row.stage}
                  size="sm"
                  variant={stageFilter === row.stage ? "secondary" : "ghost"}
                  className="h-7 text-[11px]"
                  onClick={() => setStageFilter(row.stage)}
                >
                  {row.stage} ({row.count})
                </Button>
              ))}
            </div>

            {stats.best ? (
              <p className="flex items-center gap-1.5 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
                <Trophy className="h-3.5 w-3.5 text-amber-500" />
                Best match so far: <span className="font-medium">{stats.best.jobTitle}</span> at{" "}
                {stats.best.company} ({stats.best.matchScore}%). Re-read that variant before the next
                interview.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!ready ? (
        <Card>
          <CardContent className="p-6 text-center text-xs text-muted-foreground">
            Loading saved applications…
          </CardContent>
        </Card>
      ) : applications.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No saved variants yet</CardTitle>
            <CardDescription>
              Load a posting in the workspace, tune the tailoring slider, then hit Save in the ATS
              audit panel. Each save keeps the posting, the analysis and the exact resume that
              produced it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <a href="/">Go to the workspace</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((entry) => (
            <ApplicationCard
              key={entry.id}
              entry={entry}
              focused={entry.id === focus}
              onDetails={() => setDetailsId(entry.id)}
            />
          ))}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-xs text-muted-foreground">
                No applications match that filter.
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {/* The details editor, shared with the calendar: same record, same fields, wherever you happen to be. */}
      <ApplicationDetailsDialog
        application={detailsId ? (applications.find((entry) => entry.id === detailsId) ?? null) : null}
        onClose={() => setDetailsId(null)}
      />
    </div>
  );
}

