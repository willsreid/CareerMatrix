"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { JobIngestion } from "@/components/JobIngestion";
import { ResumePreview } from "@/components/ResumePreview";
import { TailorControls } from "@/components/TailorControls";
import { VersionHistory } from "@/components/VersionHistory";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function AtsPanel() {
  const { resume } = useWorkspace();

  const iconFor = (status: "pass" | "warn" | "fail") => {
    if (status === "pass") {
      return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />;
    }
    if (status === "warn") {
      return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />;
    }
    return <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />;
  };

  const passCount = resume.ats.checks.filter((check) => check.status === "pass").length;
  const warnCount = resume.ats.checks.filter((check) => check.status === "warn").length;
  const failCount = resume.ats.checks.length - passCount - warnCount;

  return (
    <CollapsibleCard
      title="ATS audit"
      icon={ShieldCheck}
      meta={
        <>
          <Badge
            variant={
              resume.ats.score >= 75 ? "success" : resume.ats.score >= 55 ? "warn" : "destructive"
            }
          >
            Score {resume.ats.score}/100
          </Badge>
          {failCount ? (
            <Badge variant="destructive" className="text-[10px]">
              {failCount} fail
            </Badge>
          ) : null}
          {warnCount ? (
            <Badge variant="warn" className="text-[10px]">
              {warnCount} warn
            </Badge>
          ) : null}
          {resume.ats.score >= 75 && !warnCount && !failCount ? (
            <Badge variant="success" className="text-[10px]">
              clean
            </Badge>
          ) : null}
        </>
      }
      description="Structural checks against how parsers and recruiters actually read a resume."
    >
      <ul className="space-y-2">
          {resume.ats.checks.map((check) => (
            <li key={check.id} className="flex gap-2 text-[11px] leading-relaxed">
              {iconFor(check.status)}
              <span>
                <span className="font-medium text-foreground">{check.label}: </span>
                <span className="text-muted-foreground">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>

        {resume.ats.keywordLines.length || resume.ats.gaps.length ? (
          <>
            <Separator />
            <div className="space-y-2">
              {resume.ats.keywordLines.length ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">On the sheet and matching this posting</p>
                  <div className="flex flex-wrap gap-1">
                    {resume.ats.keywordLines.map((term) => (
                      <Badge key={term} variant="success" className="text-[10px]">
                        {term}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {resume.ats.gaps.length ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-medium">Cannot be added (no profile evidence)</p>
                  <div className="flex flex-wrap gap-1">
                    {resume.ats.gaps.map((term) => (
                      <Badge key={term} variant="warn" className="text-[10px]">
                        {term}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Raise these in the cover note, or add real experience in{" "}
                    <Link href="/profile" className="underline">
                      Master Profile
                    </Link>
                    . The engine will not put them on the resume for you.
                  </p>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </CollapsibleCard>
  );
}

export default function WorkspacePage() {
  const { draft, applications } = useWorkspace();

  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] print:block print:p-0">
      <div className="scroll-pane flex flex-col gap-3 lg:h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-1 print:hidden">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Target a role</h1>
          <p className="text-xs text-muted-foreground">
            Drop in the posting, tune the match, take the one-page sheet. Everything stays in this
            browser.
          </p>
        </header>

        {draft.rawText ? null : (
          <div className="rounded-md border border-dashed bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Nothing loaded yet. Paste a posting, or open{" "}
            <span className="font-medium">Sample postings</span> to watch the analyzer work: a
            Portland hybrid VDC role, a remote automation role, a Hillsboro data center lead, and a
            deliberate non-match.
            {applications.length ? " Saved variants live under Saved Target Roles." : ""}
          </div>
        )}

        <JobIngestion />
        <TailorControls />
      </div>

      <div
        className={cn(
          "scroll-pane flex flex-col gap-3 lg:h-[calc(100vh-6.5rem)] lg:overflow-y-auto lg:pr-1",
          "print:static print:h-auto print:overflow-visible print:pr-0",
        )}
      >
        <ResumePreview />
        <VersionHistory />
        <AtsPanel />
        <div className="flex items-center gap-2 pb-4 text-[10px] text-muted-foreground print-hide">
          <FolderOpen className="h-3 w-3" />
          Profile edits, draft state and saved applications live in localStorage, with JSON
          import/export on the Master Profile page.
        </div>
      </div>
    </div>
  );
}

