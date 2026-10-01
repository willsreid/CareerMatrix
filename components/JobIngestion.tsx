"use client";

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardPaste,
  Eraser,
  FileText,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Sparkles,
  Target,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { SAMPLE_POSTINGS } from "@/lib/samplePostings";
import type { WorkMode } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";

const WORK_MODES: WorkMode[] = ["Remote", "Hybrid", "In-Office", "Unspecified"];

function scoreTone(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}


export function KeywordChip({
  label,
  mentions,
  tone,
  detail,
}: {
  label: string;
  mentions: number;
  tone: "matched" | "missing";
  detail: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      title={detail}
      className={cn(
        "rounded-full border px-2 py-0.5 text-left text-[11px] transition-colors",
        tone === "matched"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300",
      )}
    >
      {label}
      <span className="ml-1 opacity-60">x{mentions}</span>
      {open ? (
        <span className="mt-1 block max-w-[22rem] whitespace-normal text-[10px] font-normal leading-snug opacity-80">
          {detail}
        </span>
      ) : null}
    </button>
  );
}

export function JobIngestion() {
  const { draft, patchDraft, patchJobText, clearJob, analysis, processing, refreshAnalysis, lastProcessedAt, lastProcessMs } =
    useWorkspace();
  const [showSamples, setShowSamples] = React.useState(false);

  const meta = analysis?.meta;
  const overrides = draft.overrides;
  const matched = analysis?.matched ?? [];
  const missing = analysis?.missing ?? [];

  const setOverride = (
    key: "title" | "company" | "location" | "workMode",
    value: string | undefined,
  ) => {
    const next = { ...overrides };
    if (!value) delete next[key];
    else next[key] = value as never;
    patchDraft({ overrides: next });
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.error("Clipboard is empty.");
        return;
      }
      const hadCorrections = Object.keys(overrides).length > 0;
      patchJobText(text);
      toast.success(
        hadCorrections
          ? "Posting replaced — your manual corrections to the previous posting were cleared."
          : "Posting pasted. Analysis is live; no refresh needed.",
      );
    } catch {
      toast.error("Clipboard read was blocked — paste into the box with Cmd+V instead.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Raw job posting
              </CardTitle>
              <CardDescription>
                Paste the whole posting. LinkedIn, Indeed, AGC and company career pages all parse.
              </CardDescription>
            </div>
            <Badge variant="muted" className="shrink-0">
              {meta ? `${meta.wordCount} words` : "waiting"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea
            value={draft.rawText}
            onChange={(event) => patchJobText(event.target.value)}
            placeholder={
              "Paste the full job description here.\n\nVDC Coordinator\nSome GC · Portland, OR · Hybrid\n\nResponsibilities\n- Run federated model coordination in Navisworks..."
            }
            className="scroll-pane h-56 font-mono text-[12px] leading-relaxed"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handlePaste}>
              <ClipboardPaste className="h-4 w-4" />
              Paste
            </Button>
            <Button
              size="sm"
              variant={draft.rawText.trim().length >= 60 ? "default" : "outline"}
              disabled={processing || draft.rawText.trim().length < 60}
              onClick={() => {
                void refreshAnalysis().then(() => {
                  toast.success("Re-analysed this posting — see the keyword panel for the new counts.");
                });
              }}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysing…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Re-analyse
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSamples((value) => !value)}
              aria-expanded={showSamples}
            >
              <Sparkles className="h-4 w-4" />
              Sample postings
            </Button>
            <Button size="sm" variant="ghost" onClick={clearJob} disabled={!draft.rawText}>
              <Eraser className="h-4 w-4" />
              Clear
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {processing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Parsing the posting…
              </>
            ) : analysis ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                Parsed {analysis.keywords.length} keywords, {analysis.matched.length} of them backed by
                your profile
                {lastProcessedAt
                  ? ` · last re-run ${relativeTime(lastProcessedAt)}${lastProcessMs ? ` in ${lastProcessMs}ms` : ""}`
                  : " · live as you type"}
              </>
            ) : (
              <>
                <ScanSearch className="h-3.5 w-3.5" />
                Analysis starts once the posting is at least a sentence or two. Hit Re-analyse if you
                want to force a fresh pass after swapping roles.
              </>
            )}
          </p>

          {showSamples ? (
            <div className="grid gap-2 rounded-md border bg-muted/40 p-2">
              {SAMPLE_POSTINGS.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => {
                    patchDraft({ rawText: sample.text, overrides: {} });
                    setShowSamples(false);
                    toast.success(`Loaded: ${sample.label}`);
                  }}
                  className="rounded-md border border-transparent bg-background p-2 text-left transition-colors hover:border-border hover:bg-accent"
                >
                  <span className="block text-xs font-medium">{sample.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{sample.blurb}</span>
                </button>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {meta ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Extracted job
                </CardTitle>
                <CardDescription>
                  Heuristics guess; you decide. Every field here overrides the parser.
                </CardDescription>
              </div>
              {Object.keys(overrides).length ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patchDraft({ overrides: {} })}
                  className="shrink-0"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              <div className="space-y-1">
                <Label htmlFor="job-title">Job title</Label>
                <Input
                  id="job-title"
                  value={meta.title}
                  onChange={(event) => setOverride("title", event.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="job-company">Company</Label>
                  <Input
                    id="job-company"
                    value={meta.company}
                    onChange={(event) => setOverride("company", event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="job-location">Location</Label>
                  <Input
                    id="job-location"
                    value={meta.location}
                    onChange={(event) => setOverride("location", event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Work mode</Label>
              <div className="flex flex-wrap gap-1.5">
                {WORK_MODES.map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={meta.workMode === mode ? "default" : "outline"}
                    onClick={() => setOverride("workMode", mode)}
                    className="h-7 px-2.5 text-xs"
                  >
                    {mode}
                  </Button>
                ))}
              </div>
              {meta.workModeEvidence ? (
                <p className="text-[11px] italic text-muted-foreground">…{meta.workModeEvidence}…</p>
              ) : null}
            </div>

            <Separator />

            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <Badge variant="outline">Source: {meta.source}</Badge>
              <Badge variant="outline">Level: {meta.seniority}</Badge>
              <Badge variant="outline">{meta.employmentType}</Badge>
              {meta.salary ? <Badge variant="outline">{meta.salary}</Badge> : null}
              <Badge variant={meta.titleConfidence >= 0.75 ? "success" : "warn"}>
                Title confidence {Math.round(meta.titleConfidence * 100)}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {analysis ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Keyword match
              </CardTitle>
              <CardDescription>
                Weighted coverage of this posting&apos;s vocabulary. Chips show mention counts; click
                one to see which profile line backs it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Progress
                  value={analysis.matchScore}
                  className="h-2.5"
                  indicatorClassName={scoreTone(analysis.matchScore)}
                />
                <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {analysis.matchScore}%
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {analysis.matched.length} of {analysis.keywords.length} tracked terms are evidenced in
                the Master Profile. Gaps are listed, never silently invented.
              </p>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-medium">In your profile ({matched.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {matched.length ? (
                    matched.map((hit) => (
                      <KeywordChip
                        key={hit.term}
                        label={hit.term}
                        mentions={hit.mentions}
                        tone="matched"
                        detail={`Backed by: ${hit.evidence.join(" · ") || "profile entries"}`}
                      />
                    ))
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      No overlap detected yet — check the posting text.
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-medium">
                    Wants it, you do not have it ({missing.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missing.length ? (
                    missing.map((hit) => (
                      <KeywordChip
                        key={hit.term}
                        label={hit.term}
                        mentions={hit.mentions}
                        tone="missing"
                        detail="Not evidenced anywhere in the Master Profile. Address it in the cover note or add real experience to the profile — do not put it on the resume."
                      />
                    ))
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Nothing missing. This posting is fully covered.
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Market fit check
              </CardTitle>
              <CardDescription>{analysis.marketFit.headline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant={
                    analysis.marketFit.location === "strong"
                      ? "success"
                      : analysis.marketFit.location === "partial"
                        ? "warn"
                        : "destructive"
                  }
                >
                  Location: {analysis.marketFit.location}
                </Badge>
                <Badge
                  variant={
                    analysis.marketFit.workMode === "strong"
                      ? "success"
                      : analysis.marketFit.workMode === "partial"
                        ? "warn"
                        : "destructive"
                  }
                >
                  Work mode: {analysis.marketFit.workMode}
                </Badge>
                <Badge
                  variant={
                    analysis.marketFit.roleShape === "strong"
                      ? "success"
                      : analysis.marketFit.roleShape === "partial"
                        ? "warn"
                        : "destructive"
                  }
                >
                  Role shape: {analysis.marketFit.roleShape}
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {analysis.marketFit.detail}
              </p>
              {analysis.marketFit.location !== "strong" ? (
                <p className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  The header carries the relocation note, so an out-of-market posting still reads as
                  a planned move rather than a relocation surprise.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}


    </div>
  );
}
