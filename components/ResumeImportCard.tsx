"use client";

import * as React from "react";
import { AlertTriangle, FileUp, Loader2, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  applyImport,
  extractResumeText,
  importImpact,
  parseResumeText,
  profileDataFromParse,
  type ImportedProfileData,
  type ParsedResume,
} from "@/lib/resumeImport";

/**
 * Resume import.
 *
 * Two steps on purpose. Reading a document and rewriting the Master Profile are
 * different decisions: this shows what was read — counts, the parsed jobs, and
 * everything the parser was unsure about — and only touches the profile when you
 * press Apply. A parser that wrote straight into your profile would be one bad
 * guess away from losing work you typed by hand.
 */
export function ResumeImportCard() {
  const { profile, updateProfile } = useWorkspace();
  const [busy, setBusy] = React.useState(false);
  const [fileName, setFileName] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedResume | null>(null);
  const [data, setData] = React.useState<ImportedProfileData | null>(null);
  const [notes, setNotes] = React.useState<string[]>([]);
  const [mode, setMode] = React.useState<"merge" | "replace">("merge");
  const [useSummary, setUseSummary] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsed(null);
    setData(null);
    setNotes([]);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setNotes([]);
    setParsed(null);
    setData(null);
    try {
      const extracted = await extractResumeText(file);
      if (extracted.kind === "unknown") {
        toast.error(extracted.notes[0] ?? "That file cannot be read.");
        reset();
        return;
      }
      const result = parseResumeText(extracted.text);
      const built = profileDataFromParse(result);
      setFileName(file.name);
      setParsed(result);
      setData(built);
      setNotes([...extracted.notes, ...result.warnings]);
      // Only offer to overwrite the pitch when there is nothing there to lose.
      setUseSummary(!profile.pitch.trim() && Boolean(result.summary));
      const found = importImpact(built, true);
      toast.success(
        `Read ${found.roles} job(s), ${found.bullets} bullet(s) and ${found.skills} skill(s) from ${file.name}.`,
      );
    } catch (error) {
      console.error(error);
      toast.error(
        "Could not read that file. A text or Word version imports more reliably than a scan.",
      );
      reset();
    } finally {
      setBusy(false);
    }
  };

  const impact = data ? importImpact(data, useSummary) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <FileUp className="h-4 w-4 text-primary" />
          Import a resume
        </CardTitle>
        <CardDescription>
          Pull an existing resume in as PDF, DOCX or plain text and use it to fill the profile below.
          Parsing happens in this browser — nothing is uploaded — and nothing changes until you press
          Apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id="resume-import"
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? "Reading" : parsed ? "Choose another file" : "Choose a file"}
          </Button>
          {fileName ? <Badge variant="muted">{fileName}</Badge> : null}
          {parsed ? (
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Discard
            </Button>
          ) : null}
        </div>

        {parsed && data && impact ? (
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="success">{impact.roles} jobs</Badge>
              <Badge variant="muted">{impact.bullets} bullets</Badge>
              <Badge variant="muted">{impact.skills} skills</Badge>
              <Badge variant="muted">{impact.projects} projects</Badge>
              <Badge variant="muted">{impact.education} education</Badge>
              <Badge variant="muted">{impact.certifications} credentials</Badge>
              {impact.headerFields.length ? (
                <Badge variant="outline">contact: {impact.headerFields.join(", ")}</Badge>
              ) : null}
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium">Read as</p>
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {data.roles.slice(0, 6).map((role) => (
                  <li key={role.id}>
                    <span className="text-foreground">{role.role || "(no title)"}</span>
                    {role.company ? ` — ${role.company}` : ""}
                    {role.dates ? ` · ${role.dates}` : ""} · {role.bullets.length} bullet(s)
                  </li>
                ))}
                {data.roles.length > 6 ? <li>…and {data.roles.length - 6} more</li> : null}
                {data.roles.length === 0 ? (
                  <li>No jobs were recognised — the Roles tab is the place to add them.</li>
                ) : null}
              </ul>
            </div>

            {notes.length ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <ul className="space-y-0.5">
                  {notes.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Switch
                  id="import-mode"
                  checked={mode === "replace"}
                  onCheckedChange={(checked) => setMode(checked ? "replace" : "merge")}
                />
                <label htmlFor="import-mode" className="cursor-pointer text-[11px] font-medium">
                  Replace my {profile.roles.length} job(s) instead of adding
                </label>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch
                  id="import-pitch"
                  checked={useSummary}
                  onCheckedChange={setUseSummary}
                  disabled={!data.pitch}
                />
                <Label htmlFor="import-pitch" className="cursor-pointer text-[11px] font-medium">
                  Use the summary as my pitch
                </Label>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              {mode === "merge"
                ? "Adding keeps everything already in the profile and skips anything that looks like a duplicate. Empty contact fields get filled; fields you have already written are left alone."
                : "Replacing swaps the jobs, skills, projects, education and credentials for the ones in this file, and overwrites contact fields the file has a value for."}{" "}
              Export the JSON first if you want a guaranteed way back.
            </p>

            <Button
              size="sm"
              onClick={() => {
                updateProfile((current) => applyImport(current, data, { mode, useSummaryAsPitch: useSummary }));
                toast.success(
                  `Imported — ${impact.roles} job(s) and ${impact.skills} skill(s) are on the Roles and Skills tabs.`,
                );
                reset();
              }}
            >
              Apply to Master Profile
            </Button>
          </div>
        ) : null}

        <p className="text-[10px] text-muted-foreground">
          Text layers only: a scanned PDF has no text to read. Imported bullets start with no labels,
          tags or emphasis, so nothing is claimed on your behalf — add those on the Roles tab to
          steer the tailoring.
        </p>
      </CardContent>
    </Card>
  );
}
