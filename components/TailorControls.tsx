"use client";

import {
  AlertTriangle,
  AlignHorizontalDistributeCenter,
  Code2,
  FileText,
  HardHat,
  Info,
  Ruler,
  ScrollText,
  Sliders,
  Type,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  EMPHASIS_HINTS,
  EMPHASIS_LABELS,
  SHEET_LAYOUT_LABELS,
  type Emphasis,
  type SheetLayout,
} from "@/lib/types";
import { autoFitFontPt, bandFor, maxFontPt, minFontPt } from "@/lib/resumeTailorer";

const BANDS: {
  id: "baseline" | "balanced" | "aggressive";
  label: string;
  range: string;
  hint: string;
}[] = [
  {
    id: "baseline",
    label: "Factual baseline",
    range: "0-30%",
    hint: "Exact profile wording and the original ordering. Use it when the posting already looks like your existing resume.",
  },
  {
    id: "balanced",
    label: "Balanced ATS optimisation",
    range: "40-70%",
    hint: "Bullets re-ranked by relevance, matching skills lifted into the top category, and field/BIM terms swapped for the posting's wording. No new claims.",
  },
  {
    id: "aggressive",
    label: "Aggressive alignment",
    range: "80-100%",
    hint: "Exact phrase matching for automated filters: the posting's own terms are reused in bullet labels and the skills block, but only where the profile already proves them.",
  },
];

const EMPHASIS_META: { id: Emphasis; icon: typeof Code2; blurb: string }[] = [
  {
    id: "balanced",
    icon: AlignHorizontalDistributeCenter,
    blurb: EMPHASIS_HINTS.balanced,
  },
  {
    id: "technical",
    icon: Code2,
    blurb: `${EMPHASIS_HINTS.technical} Promotes the skill groups and bullets you tagged for it.`,
  },
  {
    id: "delivery",
    icon: HardHat,
    blurb: `${EMPHASIS_HINTS.delivery} Promotes the skill groups and bullets you tagged for it.`,
  },
];

export function TailorControls() {
  const { draft, patchDraft, resume } = useWorkspace();
  const band = bandFor(draft.intensity);
  const activeBand = BANDS.find((entry) => entry.id === band) ?? BANDS[0];

  const handleAutoFit = () => {
    const next = autoFitFontPt({
      summary: resume.summary,
      skillGroups: resume.skillGroups,
      roles: resume.roles,
      projects: resume.projects,
      certifications: resume.certifications,
    });
    patchDraft({ fontPt: next });
    toast.success(`Type size set to ${next}pt, the largest that still prints on one page.`);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" />
            Keyword density / tailoring
          </CardTitle>
          <CardDescription>
            How hard the engine pushes toward this posting. It never adds experience you do not have.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">{draft.intensity}%</span>
            <Badge
              variant={band === "aggressive" ? "warn" : band === "balanced" ? "success" : "muted"}
            >
              {activeBand.label} · {activeBand.range}
            </Badge>
          </div>

          <Slider
            value={[draft.intensity]}
            onValueChange={([value]) => patchDraft({ intensity: value })}
            min={0}
            max={100}
            step={5}
            aria-label="Tailoring intensity"
          />

          <div className="flex flex-wrap gap-1.5">
            {BANDS.map((entry) => (
              <Button
                key={entry.id}
                size="sm"
                variant={band === entry.id ? "secondary" : "ghost"}
                className="h-7 px-2 text-[11px]"
                onClick={() =>
                  patchDraft({
                    intensity: entry.id === "baseline" ? 20 : entry.id === "balanced" ? 60 : 90,
                  })
                }
              >
                {entry.range} {entry.label}
              </Button>
            ))}
          </div>

          <p className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {activeBand.hint}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Tone / emphasis
          </CardTitle>
          <CardDescription>
            Chooses which truthful pitch variant leads and which skill category is promoted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Tabs
            value={draft.emphasis}
            onValueChange={(value) => patchDraft({ emphasis: value as Emphasis })}
          >
            <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
              {EMPHASIS_META.map((entry) => {
                const Icon = entry.icon;
                return (
                  <TabsTrigger key={entry.id} value={entry.id} className="flex-1 gap-1.5 py-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {EMPHASIS_LABELS[entry.id]}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {EMPHASIS_META.find((entry) => entry.id === draft.emphasis)?.blurb}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Type className="h-4 w-4 text-primary" />
            Sheet layout
          </CardTitle>
          <CardDescription>
            {draft.layout === "continuous"
              ? "Continuous: the sheet flows onto as many Letter pages as the content needs. Nothing is cut or shrunk — read-first."
              : "One page: a fixed Letter sheet. The engine will shrink the type and trim spare project bullets to hold it to a single page — print-first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {(["page", "continuous"] as SheetLayout[]).map((mode) => {
              const active = draft.layout === mode;
              const Icon = mode === "page" ? FileText : ScrollText;
              return (
                <Button
                  key={mode}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="justify-start gap-2"
                  onClick={() => patchDraft({ layout: mode })}
                >
                  <Icon className="h-4 w-4" />
                  {SHEET_LAYOUT_LABELS[mode]}
                </Button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Body type size</Label>
              <span className="text-xs font-medium tabular-nums">{draft.fontPt.toFixed(1)}pt</span>
            </div>
            <Slider
              value={[draft.fontPt]}
              onValueChange={([value]) => patchDraft({ fontPt: Math.round(value * 10) / 10 })}
              min={minFontPt()}
              max={maxFontPt()}
              step={0.1}
              aria-label="Body type size"
            />
            {resume.options.fontPt < draft.fontPt - 0.05 ? (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] leading-relaxed">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  The engine printed at <span className="font-medium">{resume.options.fontPt}pt</span>{" "}
                  instead, because {draft.fontPt}pt would spill past one page with the current
                  content.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => patchDraft({ fontPt: resume.options.fontPt })}
                  >
                    Accept {resume.options.fontPt}pt
                  </button>{" "}
                  or shorten a bullet in Master Profile.
                </span>
              </p>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={draft.layout === "continuous"}
              onClick={handleAutoFit}
            >
              <Ruler className="h-4 w-4" />
              {draft.layout === "continuous"
                ? "Auto-fit is off in continuous layout"
                : "Auto-fit to one page"}
            </Button>
            {draft.layout === "continuous" ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                There is nothing to fit into, so the type dial is entirely yours here. Page breaks
                fall between blocks, never through a line.
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border p-2">
            <div>
              <p className="text-xs font-medium">Highlight matched keywords</p>
              <p className="text-[11px] text-muted-foreground">
                Screen only. Highlights are stripped from print and PDF.
              </p>
            </div>
            <Switch
              checked={draft.showKeywordMarks}
              onCheckedChange={(checked) => patchDraft({ showKeywordMarks: checked })}
              aria-label="Highlight matched keywords"
            />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
