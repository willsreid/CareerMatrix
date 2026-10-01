"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookmarkPlus,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileWarning,
  Pencil,
  Plus,
  Printer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PdfExportButton } from "@/components/PdfExportButton";
import { SaveVariantDialog } from "@/components/SaveVariantDialog";
import { EditableText } from "@/components/EditableText";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { highlightSegments } from "@/lib/keywordAnalyzer";
import { RESUME_SECTIONS, contentHeightPt, lastPageFill, pageCountFor, toPlainText } from "@/lib/resumeTailorer";
import {
  addMyBullet,
  countEdits,
  removeMyBullet,
  setBlockField,
  setBulletEdit,
  setSkillItems,
  toggleHiddenBullet,
  toggleHiddenSection,
} from "@/lib/resumeEdits";
import type { ResumeEdits, TailoredResume } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Marks the runs of sheet text that came from the active posting. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const segments = highlightSegments(text, terms);
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <span
            key={index}
            className="kwd rounded-[2px] bg-navy/10 px-[1px] shadow-[0_0_0_1px_hsl(var(--navy)/0.14)]"
          >
            {segment.text}
          </span>
        ) : (
          <React.Fragment key={index}>{segment.text}</React.Fragment>
        ),
      )}
    </>
  );
}

/**
 * Section heading with an edit-mode-only toggle in the margin.
 *
 * The heading itself is the same plain `.h2` element as always — the toggle is
 * absolutely positioned in the gutter, is never printed, and does not touch the
 * text flow.
 */
function SectionHeading({
  title,
  editing,
  hidden,
  onToggle,
}: {
  title: string;
  editing: boolean;
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="h2 relative">
      {title}
      {editing ? (
        <button
          type="button"
          onClick={onToggle}
          style={{ display: "flex" }}
          className="absolute -left-[1.35em] top-0 h-3.5 w-3.5 items-center justify-center rounded-sm border border-dashed border-muted-foreground/60 text-muted-foreground print-hide hover:border-foreground hover:text-foreground"
          title={hidden ? "Show this section again" : "Leave this section off the sheet"}
          aria-label={hidden ? `Show ${title}` : `Hide ${title}`}
        >
          {hidden ? <Eye className="h-2 w-2" /> : <EyeOff className="h-2 w-2" />}
        </button>
      ) : null}
    </div>
  );
}

/** Bullet-level control, parked in the left margin so the text is untouched. */
function GutterButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="absolute -left-[1.35em] top-[0.15em] flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-dashed border-muted-foreground/50 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground print-hide"
    >
      {children}
    </button>
  );
}

/**
 * Edit-mode control panel.
 *
 * Everything here lives *outside* the sheet: adding a bullet, un-hiding one, or
 * dropping a line you wrote by hand. Bullet hiding is the only edit that removes
 * content, and it is reversible from this panel, so the sheet itself never gains
 * a control that could disturb its formatting.
 */
function SheetEditPanel({
  edits,
  resume,
  onAddRole,
  onAddProject,
  onRemoveMyBullet,
  onRestoreBullet,
}: {
  edits: ResumeEdits;
  resume: TailoredResume;
  onAddRole: (roleId: string) => void;
  onAddProject: (projectId: string) => void;
  onRemoveMyBullet: (owner: "roles" | "projects", blockId: string, bulletId: string) => void;
  onRestoreBullet: (owner: "roles" | "projects", blockId: string, bulletId: string) => void;
}) {
  const rows: {
    owner: "roles" | "projects";
    blockId: string;
    ownerLabel: string;
    hidden: { id: string; label: string }[];
    mine: { id: string; label: string }[];
  }[] = [];

  const collect = (
    owner: "roles" | "projects",
    id: string,
    ownerLabel: string,
    bullets: TailoredResume["roles"][number]["bullets"],
  ) => {
    const block = edits[owner]?.[id];
    if (!block) {
      rows.push({ owner, blockId: id, ownerLabel, hidden: [], mine: [] });
      return;
    }
    const hidden = (block.hiddenBullets ?? []).map((bulletId) => {
      const bullet = bullets.find((entry) => entry.id === bulletId);
      return {
        id: bulletId,
        label: bullet ? bullet.label || bullet.text.slice(0, 42) : bulletId,
      };
    });
    const mine = (block.addedBullets ?? []).map((bullet) => ({
      id: bullet.id,
      label: bullet.label || bullet.text.slice(0, 42) || "untitled bullet",
    }));
    rows.push({ owner, blockId: id, ownerLabel, hidden, mine });
  };

  for (const role of resume.roles) {
    collect("roles", role.id, `${role.role} — ${role.company}`, role.bullets);
  }
  for (const project of resume.projects) {
    collect("projects", project.id, project.name, project.bullets);
  }

  const hiddenCount = rows.reduce((sum, row) => sum + row.hidden.length, 0);
  const mineCount = rows.reduce((sum, row) => sum + row.mine.length, 0);

  return (
    <div className="space-y-3 rounded-md border bg-card p-3 print-hide">
      <div>
        <p className="text-xs font-medium">Edit controls</p>
        <p className="text-[11px] text-muted-foreground">
          The sheet keeps its own formatting; these controls sit outside it. {hiddenCount} hidden
          bullet(s), {mineCount} bullet(s) written by hand.
        </p>
      </div>

      {rows.map((row) => (
        <div key={`${row.owner}-${row.blockId}`} className="space-y-1.5 border-t pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium">{row.ownerLabel}</span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 text-[10px]"
              onClick={() =>
                row.owner === "roles" ? onAddRole(row.blockId) : onAddProject(row.blockId)
              }
            >
              <Plus className="h-3 w-3" />
              Add bullet
            </Button>
          </div>

          {row.mine.map((bullet) => (
            <div key={bullet.id} className="flex items-center gap-2 text-[11px]">
              <Badge variant="warn" className="text-[10px]">
                yours
              </Badge>
              <span className="truncate">{bullet.label}</span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 text-[10px] text-destructive"
                onClick={() => onRemoveMyBullet(row.owner, row.blockId, bullet.id)}
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </Button>
            </div>
          ))}

          {row.hidden.map((bullet) => (
            <div key={bullet.id} className="flex items-center gap-2 text-[11px]">
              <Badge variant="muted" className="text-[10px]">
                hidden
              </Badge>
              <span className="truncate">{bullet.label}</span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 text-[10px]"
                onClick={() => onRestoreBullet(row.owner, row.blockId, bullet.id)}
              >
                <Eye className="h-3 w-3" />
                Show
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function ResumePreview() {
  const {
    resume,
    analysis,
    draft,
    edits,
    patchEdits,
    resetEdits,
    saveApplication,
    applications,
  } = useWorkspace();
  const [scale, setScale] = React.useState(1);
  const [fill, setFill] = React.useState(0);
  const [sheetHeightPx, setSheetHeightPx] = React.useState(0);
  const [editing, setEditing] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const editCount = countEdits(edits);

  React.useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const measure = () => {
      const sheetPx = 8.5 * 96;
      setScale(Math.min(1, element.clientWidth / sheetPx));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Real DOM measurement, so the on-screen sheet agrees with the estimator — and
  // so the continuous sheet can reserve exactly the height it occupies, which is
  // what keeps the panels below it from sliding underneath.
  React.useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const measure = () => {
      setFill(element.offsetHeight / contentHeightPt());
      const sheet = sheetRef.current;
      if (sheet) setSheetHeightPx(sheet.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const sheet = sheetRef.current;
    if (sheet) observer.observe(sheet);
    return () => observer.disconnect();
  }, [resume, editing]);

  const terms = React.useMemo(
    () =>
      draft.showKeywordMarks && analysis && !editing
        ? [...new Set(analysis.matched.flatMap((hit) => [hit.term, ...hit.matchedAliases]))]
        : [],
    [draft.showKeywordMarks, analysis, editing],
  );

  const overflows = fill > 1.002;
  const continuous = resume.options.layout === "continuous";
  const pages = pageCountFor(fill);
  const lastFill = lastPageFill(fill);


  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toPlainText(resume));
      toast.success("Plain-text resume copied — paste it into any application form.");
    } catch {
      toast.error("Clipboard write was blocked by the browser.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 print-hide">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Eye className="h-4 w-4 text-primary" />
          Live ATS draft
        </div>
        <Badge variant={continuous ? "secondary" : overflows ? "destructive" : "success"}>
          {continuous
            ? `${pages} page${pages === 1 ? "" : "s"} · last ${Math.round(lastFill * 100)}% full`
            : `${Math.round(fill * 100)}% of one page`}
        </Badge>
        <Badge variant={resume.ats.score >= 75 ? "success" : "warn"}>
          ATS score {resume.ats.score}
        </Badge>
        {analysis ? (
          <Badge variant="muted">{resume.ats.coverage}% keyword coverage</Badge>
        ) : (
          <Badge variant="muted">Baseline (no posting loaded)</Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Saving a variant sits next to the edit toggle because both act on the
              sheet itself, rather than reporting on it like the audit panel. */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => setSaveOpen(true)}
            >
              <BookmarkPlus className="h-4 w-4" />
              Save variant
            </Button>
            <Link
              href="/saved"
              className="whitespace-nowrap text-[10px] text-muted-foreground underline"
              title="Frozen snapshots linked to their posting and stage"
            >
              {applications.length} saved
            </Link>
          </div>
          <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            <label
              htmlFor="edit-sheet"
              className="cursor-pointer select-none text-[11px] font-medium"
            >
              Edit sheet
            </label>
            <Switch id="edit-sheet" checked={editing} onCheckedChange={setEditing} />
            {editCount ? (
              <Badge variant="warn" className="text-[10px]">
                {editCount}
              </Badge>
            ) : null}
          </div>
          {editCount ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                resetEdits();
                toast.success("Manual edits cleared — back to the tailored text.");
              }}
            >
              <Trash2 className="h-4 w-4" />
              Reset edits
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={handleCopy}>
            <ClipboardCheck className="h-4 w-4" />
            Copy text
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <PdfExportButton />
        </div>
      </div>

      {editing ? (
        <p className="rounded-md border border-dashed bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground print-hide">
          Click any line on the sheet to rework it. Text is edited in place, so the font, spacing,
          indentation and bullet structure stay exactly as they are — nothing is reformatted and
          nothing reaches the Master Profile. Enter commits a line, Esc reverts it. Keyword
          highlighting pauses while editing and returns when you switch back.
        </p>
      ) : null}

      {overflows && !continuous ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] print-hide">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>
            The draft runs {Math.round((fill - 1) * 100)}% over one page. The engine trims spare
            project bullets automatically — for anything longer, lower the type size or shorten a
            bullet in Master Profile. Content past the dashed rule is the overflow. Switching to{" "}
            <span className="font-medium">Continuous</span> layout stops trimming entirely and lets
            the sheet run to a second page.
          </span>
        </div>
      ) : null}

      {continuous && pages > 1 ? (
        <p className="rounded-md border bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground print-hide">
          Continuous layout: the sheet flows onto {pages} pages and nothing was cut or shrunk to
          prevent it. Page breaks fall between blocks rather than through a line, and the last page
          is {Math.round(lastFill * 100)}% full.
        </p>
      ) : null}

      <div ref={wrapperRef} className="w-full print:static print:overflow-visible">
        <div
          className="relative w-full print:static print:h-auto"
          style={
            continuous
              ? {
                  // Reserve the sheet's real height so the panels below stay below
                  // it. `sheetHeightPx` is measured, so this trims exactly; before
                  // the first measurement (in the server-rendered HTML) it falls
                  // back to a full page so nothing can ever sit on the sheet.
                  height: sheetHeightPx ? `${sheetHeightPx * scale}px` : undefined,
                  minHeight: sheetHeightPx ? undefined : `calc(11in * ${scale})`,
                }
              : { height: `calc(11in * ${scale})` }
          }
        >
          <div
            ref={sheetRef}
            id="resume-sheet"
            className={cn(
              "sheet sheet-shell print-sheet absolute left-0 top-0",
              continuous && "sheet--continuous print-sheet--continuous",
            )}
            style={{
              fontSize: `${resume.options.fontPt}pt`,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              overflow: "visible",
            }}
          >
            <div ref={contentRef}>
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h1>{resume.header.name}</h1>
                  <EditableText
                    as="p"
                    className="headline"
                    value={resume.header.headline}
                    editable={editing}
                    placeholder="Headline"
                    hint="Click to adjust the headline for this posting"
                    onCommit={(next) => patchEdits((current) => ({ ...current, headline: next }))}
                  />
                </div>
                <div className="contact shrink-0 text-right">
                  <div>{resume.header.locationNote || resume.header.location}</div>
                  <div>{resume.header.email}</div>
                  <div>{resume.header.phone}</div>
                  <div>{resume.header.linkedin}</div>
                </div>
              </header>

              <SectionHeading
                title={RESUME_SECTIONS[0]}
                editing={editing}
                hidden={(edits.hiddenSections ?? []).includes(RESUME_SECTIONS[0])}
                onToggle={() => patchEdits((current) => toggleHiddenSection(current, RESUME_SECTIONS[0]))}
              />
              <EditableText
                as="p"
                multiline
                value={resume.summary}
                editable={editing}
                placeholder="Summary"
                hint="Click to rework the summary in place — the formatting does not change"
                renderValue={(value) => <Highlight text={value} terms={terms} />}
                onCommit={(next) => patchEdits((current) => ({ ...current, summary: next }))}
              />

              <SectionHeading
                title={RESUME_SECTIONS[1]}
                editing={editing}
                hidden={(edits.hiddenSections ?? []).includes(RESUME_SECTIONS[1])}
                onToggle={() => patchEdits((current) => toggleHiddenSection(current, RESUME_SECTIONS[1]))}
              />
              {resume.skillGroups.map((group) => (
                <p key={group.id}>
                  <strong className="text-navy">{group.title}: </strong>
                  <EditableText
                    value={group.items.join(" · ")}
                    editable={editing}
                    placeholder="Skill list"
                    hint="Separate skills with · or a comma"
                    onCommit={(next) =>
                      patchEdits((current) =>
                        setSkillItems(
                          current,
                          group.id,
                          next
                            .split(/[·,]/)
                            .map((item) => item.trim())
                            .filter(Boolean),
                        ),
                      )
                    }
                    renderValue={(value) => <Highlight text={value} terms={terms} />}
                  />
                </p>
              ))}

              <SectionHeading
                title={RESUME_SECTIONS[2]}
                editing={editing}
                hidden={(edits.hiddenSections ?? []).includes(RESUME_SECTIONS[2])}
                onToggle={() => patchEdits((current) => toggleHiddenSection(current, RESUME_SECTIONS[2]))}
              />
              {resume.roles.map((role) => (
                <div key={role.id}>
                  <div className="job">
                    {role.dates || editing ? (
                      <EditableText
                        className="dates"
                        value={role.dates}
                        editable={editing}
                        placeholder="Dates"
                        onCommit={(next) =>
                          patchEdits((current) => setBlockField(current, "roles", role.id, { dates: next }))
                        }
                      />
                    ) : null}
                    <EditableText
                      value={role.role}
                      editable={editing}
                      placeholder="Role title"
                      onCommit={(next) =>
                        patchEdits((current) => setBlockField(current, "roles", role.id, { role: next }))
                      }
                    />
                  </div>
                  <div className="jobmeta">
                    <EditableText
                      className="co"
                      value={role.company}
                      editable={editing}
                      placeholder="Company"
                      onCommit={(next) =>
                        patchEdits((current) => setBlockField(current, "roles", role.id, { company: next }))
                      }
                    />
                    {role.location || editing ? (
                      <>
                        {" · "}
                        <EditableText
                          value={role.location}
                          editable={editing}
                          placeholder="Location"
                          onCommit={(next) =>
                            patchEdits((current) =>
                              setBlockField(current, "roles", role.id, { location: next }),
                            )
                          }
                        />
                      </>
                    ) : null}
                  </div>
                  <ul>
                    {role.bullets.map((bullet) => (
                      <li key={bullet.id} className={editing ? "relative" : undefined}>
                        {editing ? (
                          <GutterButton
                            label="Hide this bullet from the sheet (it stays in your profile)"
                            onClick={() =>
                              patchEdits((current) =>
                                toggleHiddenBullet(current, "roles", role.id, bullet.id),
                              )
                            }
                          >
                            <EyeOff className="h-2.5 w-2.5" />
                          </GutterButton>
                        ) : null}
                        {bullet.label || editing ? (
                          <strong className={bullet.hot ? "text-navy" : undefined}>
                            <EditableText
                              value={bullet.label}
                              editable={editing}
                              placeholder="Label"
                              onCommit={(next) =>
                                patchEdits((current) =>
                                  setBulletEdit(current, "roles", role.id, bullet.id, { label: next }),
                                )
                              }
                            />
                            {": "}
                          </strong>
                        ) : null}
                        <EditableText
                          value={bullet.text}
                          editable={editing}
                          placeholder="Bullet text"
                          hint="Rework it in place — same font, same spacing, same layout"
                          renderValue={(value) => <Highlight text={value} terms={terms} />}
                          onCommit={(next) =>
                            patchEdits((current) =>
                              setBulletEdit(current, "roles", role.id, bullet.id, { text: next }),
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {resume.projects.length || editing ? (
                <>
                  <SectionHeading
                    title={RESUME_SECTIONS[3]}
                    editing={editing}
                    hidden={(edits.hiddenSections ?? []).includes(RESUME_SECTIONS[3])}
                    onToggle={() =>
                      patchEdits((current) => toggleHiddenSection(current, RESUME_SECTIONS[3]))
                    }
                  />
                  {resume.projects.map((project) => (
                    <div key={project.id}>
                      <div className="job">
                        <EditableText
                          value={project.name}
                          editable={editing}
                          placeholder="Project name"
                          onCommit={(next) =>
                            patchEdits((current) =>
                              setBlockField(current, "projects", project.id, { name: next }),
                            )
                          }
                        />
                      </div>
                      {project.meta || editing ? (
                        <div className="jobmeta">
                          <EditableText
                            value={project.meta}
                            editable={editing}
                            placeholder="Stack / link"
                            onCommit={(next) =>
                              patchEdits((current) =>
                                setBlockField(current, "projects", project.id, { meta: next }),
                              )
                            }
                          />
                        </div>
                      ) : null}
                      <ul>
                        {project.bullets.map((bullet) => (
                          <li key={bullet.id} className={editing ? "relative" : undefined}>
                            {editing ? (
                              <GutterButton
                                label="Hide this bullet from the sheet"
                                onClick={() =>
                                  patchEdits((current) =>
                                    toggleHiddenBullet(current, "projects", project.id, bullet.id),
                                  )
                                }
                              >
                                <EyeOff className="h-2.5 w-2.5" />
                              </GutterButton>
                            ) : null}
                            <EditableText
                              value={bullet.text}
                              editable={editing}
                              placeholder="Bullet text"
                              renderValue={(value) => <Highlight text={value} terms={terms} />}
                              onCommit={(next) =>
                                patchEdits((current) =>
                                  setBulletEdit(current, "projects", project.id, bullet.id, {
                                    text: next,
                                  }),
                                )
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </>
              ) : null}

              {resume.certifications.lines.length || editing ? (
                <>
                  <SectionHeading
                    title={RESUME_SECTIONS[4]}
                    editing={editing}
                    hidden={(edits.hiddenSections ?? []).includes(RESUME_SECTIONS[4])}
                    onToggle={() =>
                      patchEdits((current) => toggleHiddenSection(current, RESUME_SECTIONS[4]))
                    }
                  />
                  <ul>
                    {resume.certifications.lines.map((line, index) => (
                      <li key={index}>
                        <EditableText
                          value={line}
                          editable={editing}
                          placeholder="Credential line"
                          renderValue={(value) => <Highlight text={value} terms={terms} />}
                          onCommit={(next) => {
                            const lines = [...resume.certifications.lines];
                            lines[index] = next;
                            patchEdits((current) => ({ ...current, certLines: lines }));
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>

          {overflows && !continuous ? (
            <div
              className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-destructive/70 print-hide"
              style={{ top: `calc(9.78in * ${scale})` }}
            >
              <span className="absolute right-0 top-0 translate-y-1 rounded bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">
                page 1 ends here
              </span>
            </div>
          ) : null}

          {/* Screen-only page boundaries. On screen the continuous sheet is one
              tall strip of paper; the printer and the PDF insert the real breaks
              between blocks, so these lines are a reading aid, not a layout. */}
          {continuous
            ? Array.from({ length: Math.max(0, pages - 1) }, (_, index) => (
                <div
                  key={index}
                  className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-muted-foreground/40 print-hide"
                  style={{ top: `calc(11in * ${(index + 1) * scale})` }}
                >
                  <span className="absolute right-0 top-0 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    page {index + 2}
                  </span>
                </div>
              ))
            : null}
        </div>
      </div>

      <SaveVariantDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        jobTitle={analysis?.meta.title ?? "this role"}
        company={analysis?.meta.company ?? ""}
        onSave={(details) => {
          saveApplication(details);
          toast.success("Saved to Saved Target Roles with its dates and notes.");
        }}
      />

      <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-[11px] text-muted-foreground print-hide">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          The sheet is rendered at true 8.5in x 11in with the print margins baked in as padding, so
          what you see is what the PDF and the printer produce. Highlights are screen-only.
        </span>
      </div>

      {editing ? (
        <SheetEditPanel
          edits={edits}
          resume={resume}
          onAddRole={(roleId) => patchEdits((current) => addMyBullet(current, "roles", roleId).edits)}
          onAddProject={(projectId) =>
            patchEdits((current) => addMyBullet(current, "projects", projectId).edits)
          }
          onRemoveMyBullet={(owner, blockId, bulletId) =>
            patchEdits((current) => removeMyBullet(current, owner, blockId, bulletId))
          }
          onRestoreBullet={(owner, blockId, bulletId) =>
            patchEdits((current) => toggleHiddenBullet(current, owner, blockId, bulletId))
          }
        />
      ) : null}

      <details className="rounded-md border bg-card p-3 text-xs print-hide">
        <summary className="cursor-pointer font-medium">
          What the engine changed ({resume.notes.length} entries)
        </summary>
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
          {resume.notes.map((note, index) => (
            <li key={index} className="flex gap-1.5">
              <span className="text-primary">•</span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </details>

    </div>
  );
}
