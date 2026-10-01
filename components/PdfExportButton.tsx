"use client";

import * as React from "react";
import { AlertOctagon, FileDown, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { letterStatus } from "@/lib/coverLetterGenerator";
import { autoFitFontPt, estimateFit, maxFontPt, pageCountFor } from "@/lib/resumeTailorer";
import { cn, downloadBlob, slugify } from "@/lib/utils";

/**
 * PDF export.
 *
 * Two paths, both guaranteeing a single US Letter sheet:
 *  1. Download PDF — @react-pdf/renderer draws a true vector PDF with Helvetica
 *     base fonts, wrapped, unpaginated (`wrap={false}`), so it is always exactly
 *     one page. The type size is clamped to the largest size that fits.
 *  2. Print — the @media print stylesheet pins the on-screen sheet to the page
 *     box, so the browser's "Save as PDF" matches the preview pixel for pixel.
 *
 * The cover letter may travel as a second page, but only on request and only when
 * it provably belongs to the loaded posting: a letter aimed at a previous
 * employer is worse than no letter at all, so it is never bundled automatically.
 */
export function PdfExportButton() {
  const { resume, analysis, coverLetter, profile, draft } = useWorkspace();
  const [busy, setBusy] = React.useState(false);
  const [wantsLetter, setWantsLetter] = React.useState(false);

  const status = letterStatus(coverLetter, analysis, {
    intensity: draft.intensity,
    emphasis: draft.emphasis,
  });
  const bundling = wantsLetter && status.attachable;
  const continuous = resume.options.layout === "continuous";

  const label = {
    none: "No cover letter yet",
    stale: "Cover letter out of date",
    unverifiable: "Cover letter unverified",
    current: "Include cover letter",
  }[status.state];

  const fitFontPt = () =>
    autoFitFontPt({
      summary: resume.summary,
      skillGroups: resume.skillGroups,
      roles: resume.roles,
      projects: resume.projects,
      certifications: resume.certifications,
    });

  const handleDownload = async () => {
    setBusy(true);
    try {
      const [{ pdf }, { buildResumePdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/ResumePdfDocument"),
      ]);

      // One page is non-negotiable in `page` mode, so never hand the renderer a
      // size that cannot fit; tell the user when the clamp actually did something.
      // In `continuous` mode nothing is clamped — the sheet is allowed to flow.
      const ceiling = continuous ? maxFontPt() : fitFontPt();
      const fontPt = Math.min(resume.options.fontPt, ceiling);
      if (!continuous && fontPt < resume.options.fontPt) {
        toast.info(`Type size reduced to ${fontPt}pt so the PDF stays on one page.`);
      }

      // The toggle can still be on while the letter has gone stale underneath it
      // (loading another posting does that). Say so rather than silently dropping
      // the letter that was asked for.
      if (wantsLetter && !status.attachable) {
        toast.info(`${status.reason} Exporting the resume on its own.`);
      }

      const blob = await pdf(
        buildResumePdfDocument({
          resume,
          fontPt,
          letter: bundling ? coverLetter : null,
          profile,
        }),
      ).toBlob();

      // Self-check the artifact: the estimator keeps this at one page, but if
      // the layout engine disagrees the user must hear about it before the
      // resume reaches a recruiter.
      const structure = await blob.text();
      const pages = (structure.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      // What the sheet alone should have taken, so the letter's share falls out
      // of the page count without a second render.
      const resumePages = continuous
        ? pageCountFor(
            estimateFit(
              {
                summary: resume.summary,
                skillGroups: resume.skillGroups,
                roles: resume.roles,
                projects: resume.projects,
                certifications: resume.certifications,
              },
              fontPt,
            ).fill,
          )
        : 1;
      const letterPages = bundling ? pages - resumePages : 0;

      const company = slugify(analysis?.meta.company ?? "target", "target");
      const role = slugify(analysis?.meta.title ?? "resume", "resume");
      downloadBlob(
        blob,
        `${slugify(profile.header.name, "resume")}_${role}_${company}${bundling ? "_packet" : ""}.pdf`,
      );

      if (bundling && letterPages <= 0) {
        toast.warning(
          "The cover letter did not make it into the PDF as its own page. Export it on its own from the Cover letter page.",
          { duration: 9000 },
        );
      } else if (bundling && letterPages > 1) {
        toast.warning(
          `The cover letter ran to ${letterPages} pages. Trim a paragraph on the Cover letter page to keep it to one.`,
          { duration: 9000 },
        );
      } else if (bundling) {
        toast.success(
          `PDF downloaded — resume plus cover letter, ${pages} Letter pages, selectable text.`,
        );
      } else if (pages > 1 && !continuous) {
        toast.warning(
          `That PDF came out ${pages} pages, so the one-page limit was not met. Trim a bullet in Master Profile or lower the type size, then re-export.`,
          { duration: 9000 },
        );
      } else if (pages > 1) {
        toast.success(
          `PDF downloaded — ${pages} Letter pages, selectable text, nothing trimmed.`,
        );
      } else {
        toast.success("PDF downloaded — one page, selectable text, ATS-safe.");
      }
    } catch (error) {
      console.error(error);
      toast.error("PDF generation failed. The Print button produces the same sheet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-1.5 rounded-md border px-2 py-1"
        title={status.reason}
      >
        <Mail
          className={cn(
            "h-3.5 w-3.5",
            status.attachable ? "text-muted-foreground" : "text-muted-foreground/50",
          )}
        />
        <label
          htmlFor="include-letter"
          className={cn(
            "select-none whitespace-nowrap text-[11px] font-medium",
            status.attachable ? "cursor-pointer" : "text-muted-foreground",
          )}
        >
          {label}
        </label>
        <Switch
          id="include-letter"
          checked={bundling}
          onCheckedChange={setWantsLetter}
          disabled={!status.attachable}
        />
        {status.state === "stale" ? (
          <Badge variant="warn" className="text-[10px]">
            regenerate
          </Badge>
        ) : null}
      </div>
      <Button size="sm" onClick={handleDownload} disabled={busy}>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileDown className="h-4 w-4" />
        )}
        {busy ? "Rendering" : "Download PDF"}
      </Button>
      <span
        className="flex items-center gap-1 text-[10px] text-muted-foreground"
        title={
          continuous
            ? "Continuous mode flows onto as many pages as the content needs; nothing is trimmed or shrunk."
            : bundling
              ? "Page 1 is the one-page sheet; page 2 is the cover letter. Helvetica base fonts, no tables or icons."
              : "The PDF mirrors the sheet: Helvetica base fonts, real list bullets, no tables or icons."
        }
      >
        <AlertOctagon className="h-3 w-3" />
        {continuous ? "Flows, nothing trimmed" : bundling ? "1 page + letter" : "1 page guaranteed"}
      </span>
    </div>
  );
}
