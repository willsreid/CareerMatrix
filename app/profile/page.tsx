"use client";

import * as React from "react";
import {
  Braces,
  Download,
  FolderUp,
  Plus,
  RefreshCcw,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/WorkspaceProvider";
import { ResumeImportCard } from "@/components/ResumeImportCard";
import { WorkspaceFileCard } from "@/components/WorkspaceFileCard";
import { useApplyImport } from "@/components/useApplyImport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_KEYS, buildBackup, parseImport, type StorageKey } from "@/lib/storage";
import {
  EMPHASIS_IDS,
  EMPHASIS_LABELS,
  type ProfileBullet,
  type ProfileProject,
  type ProfileRole,
  type SkillGroup,
  type WorkMode,
} from "@/lib/types";
import { downloadText, makeId, relativeTime } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Small editors                                                              */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Comma/enter separated plain string list — locations, target titles, etc. */
function ChipListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.some((value) => value.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...values, trimmed]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2 py-0.5 text-[11px]"
          >
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((entry) => entry !== value))}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}
        {values.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">Nothing listed yet.</span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" className="shrink-0" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

function BulletEditor({
  bullet,
  onChange,
  onRemove,
}: {
  bullet: ProfileBullet;
  onChange: (bullet: ProfileBullet) => void;
  onRemove: () => void;
}) {
  const [openVariants, setOpenVariants] = React.useState(false);
  const emphasis = bullet.emphasis ?? [];

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={bullet.label}
          placeholder="Label (e.g. Model Coordination)"
          onChange={(event) => onChange({ ...bullet, label: event.target.value })}
          className="h-7 max-w-[240px] text-xs font-medium"
        />
        <div className="ml-auto flex items-center gap-1">
          {EMPHASIS_IDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                onChange({
                  ...bullet,
                  emphasis: emphasis.includes(value)
                    ? emphasis.filter((entry) => entry !== value)
                    : [...emphasis, value],
                })
              }
              className={
                emphasis.includes(value)
                  ? "rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground"
                  : "rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
              }
              title={`Promote under ${EMPHASIS_LABELS[value]}`}
            >
              {EMPHASIS_LABELS[value].split(" ")[0]}
            </button>
          ))}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={onRemove}
            aria-label="Remove bullet"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Textarea
        value={bullet.text}
        onChange={(event) => onChange({ ...bullet, text: event.target.value })}
        className="min-h-[58px] text-xs"
        placeholder="The bullet as it prints. Keep it factual."
      />

      <Input
        value={(bullet.tags ?? []).join(", ")}
        placeholder="keyword tags, comma separated (these drive relevance scoring)"
        onChange={(event) =>
          onChange({
            ...bullet,
            tags: event.target.value
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          })
        }
        className="h-7 text-[11px]"
      />

      <button
        type="button"
        onClick={() => setOpenVariants((value) => !value)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        <Wand2 className="h-3 w-3" />
        {(bullet.variants ?? []).length} higher-intensity rephrasing(s)
      </button>

      {openVariants ? (
        <div className="space-y-1.5">
          {(bullet.variants ?? []).map((variant, index) => (
            <div key={index} className="flex gap-2">
              <Input
                type="number"
                min={40}
                max={100}
                value={variant.minIntensity}
                onChange={(event) => {
                  const next = [...(bullet.variants ?? [])];
                  next[index] = { ...variant, minIntensity: Number(event.target.value) };
                  onChange({ ...bullet, variants: next });
                }}
                className="h-7 w-16 text-[11px]"
                aria-label="Unlock at intensity"
              />
              <Textarea
                value={variant.text}
                onChange={(event) => {
                  const next = [...(bullet.variants ?? [])];
                  next[index] = { ...variant, text: event.target.value };
                  onChange({ ...bullet, variants: next });
                }}
                className="min-h-[48px] text-[11px]"
                placeholder="Same fact, rephrased in the posting's vocabulary."
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() =>
                  onChange({
                    ...bullet,
                    variants: (bullet.variants ?? []).filter((_, i) => i !== index),
                  })
                }
                aria-label="Remove rephrasing"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() =>
              onChange({
                ...bullet,
                variants: [...(bullet.variants ?? []), { minIntensity: 80, text: "" }],
              })
            }
          >
            <Plus className="h-3 w-3" />
            Add rephrasing
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function BulletList({
  bullets,
  onChange,
  addLabel,
}: {
  bullets: ProfileBullet[];
  onChange: (bullets: ProfileBullet[]) => void;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {bullets.map((bullet, index) => (
        <BulletEditor
          key={bullet.id}
          bullet={bullet}
          onChange={(next) => onChange(bullets.map((entry, i) => (i === index ? next : entry)))}
          onRemove={() => onChange(bullets.filter((_, i) => i !== index))}
        />
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          onChange([
            ...bullets,
            { id: makeId("b"), label: "", text: "", tags: [], emphasis: ["balanced"] },
          ])
        }
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}

/** Simple id+text list editor for education / certifications / background. */
function TextListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
}: {
  items: { id: string; text: string }[];
  onChange: (items: { id: string; text: string }[]) => void;
  addLabel: string;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-2">
          <Input
            value={item.text}
            placeholder={placeholder}
            onChange={(event) =>
              onChange(
                items.map((entry, i) =>
                  i === index ? { ...entry, text: event.target.value } : entry,
                ),
              )
            }
            className="h-8 text-xs"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            aria-label="Remove entry"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...items, { id: makeId("t"), text: "" }])}
      >
        <Plus className="h-4 w-4" />
        {addLabel}
      </Button>
    </div>
  );
}



/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const TABS = [
  { id: "header", label: "Header & pitch" },
  { id: "skills", label: "Skills" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "market", label: "Target market" },
  { id: "credentials", label: "Credentials" },
];

export default function ProfilePage() {
  const { profile, updateProfile } = useWorkspace();
  /** Opening a folder of files restores the same way a pasted backup does. */
  const openFolder = useApplyImport();

  const updateHeader = (patch: Partial<typeof profile.header>) =>
    updateProfile((current) => ({ ...current, header: { ...current.header, ...patch } }));

  const updateSkillGroup = (index: number, patch: Partial<SkillGroup>) =>
    updateProfile((current) => ({
      ...current,
      skillGroups: current.skillGroups.map((group, i) =>
        i === index ? { ...group, ...patch } : group,
      ),
    }));

  const updateRole = (index: number, patch: Partial<ProfileRole>) =>
    updateProfile((current) => ({
      ...current,
      roles: current.roles.map((role, i) => (i === index ? { ...role, ...patch } : role)),
    }));

  const updateProject = (index: number, patch: Partial<ProfileProject>) =>
    updateProfile((current) => ({
      ...current,
      projects: current.projects.map((project, i) =>
        i === index ? { ...project, ...patch } : project,
      ),
    }));

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Master Profile</h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            The single source of truth. The tailoring engine can only reorder, relabel and re-phrase
            what lives here — if it is not in this file it will never appear on a resume.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted">Auto-saved · {relativeTime(profile.updatedAt)}</Badge>
          <Button
            size="sm"
            onClick={() => {
              downloadText(
                JSON.stringify(profile, null, 2),
                "master-profile.json",
                "application/json",
              );
              toast.success("Master Profile exported as JSON.");
            }}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </header>

      <ResumeImportCard />

      <Tabs defaultValue="header" className="space-y-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="py-1.5">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ------------------------------ header ------------------------------ */}
        <TabsContent value="header" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Header block</CardTitle>
              <CardDescription>
                Prints at the top of the sheet. Alternate headlines are swapped in automatically when
                one matches a posting better.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Name"
                value={profile.header.name}
                onChange={(name) => updateHeader({ name })}
              />
              <Field
                label="Primary headline"
                value={profile.header.headline}
                onChange={(headline) => updateHeader({ headline })}
              />
              <Field
                label="Market label"
                value={profile.header.location}
                onChange={(location) => updateHeader({ location })}
              />
              <Field
                label="Relocation / availability note"
                value={profile.header.locationNote}
                onChange={(locationNote) => updateHeader({ locationNote })}
                hint="Printed under the market label, so an out-of-market posting still reads as a planned move."
              />
              <Field
                label="Email"
                value={profile.header.email}
                onChange={(email) => updateHeader({ email })}
              />
              <Field
                label="Phone"
                value={profile.header.phone}
                onChange={(phone) => updateHeader({ phone })}
              />
              <Field
                label="LinkedIn"
                value={profile.header.linkedin}
                onChange={(linkedin) => updateHeader({ linkedin })}
              />
              <Field
                label="Portfolio / repo"
                value={profile.header.portfolio}
                onChange={(portfolio) => updateHeader({ portfolio })}
              />
              <div className="space-y-1 sm:col-span-2">
                <Label>Alternate headlines</Label>
                <ChipListEditor
                  values={profile.header.altHeadlines}
                  onChange={(altHeadlines) => updateHeader({ altHeadlines })}
                  placeholder="e.g. VDC Automation Lead · BIM Developer"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Core pitch and focus variants</CardTitle>
              <CardDescription>
                The baseline pitch prints at 0-30% intensity. The three variants take over from 40%,
                selected by the tone toggle on the workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>Baseline pitch</Label>
                <Textarea
                  value={profile.pitch}
                  onChange={(event) =>
                    updateProfile((current) => ({ ...current, pitch: event.target.value }))
                  }
                  className="min-h-[70px] text-xs"
                />
              </div>
              {EMPHASIS_IDS.map((key) => (
                <div key={key} className="space-y-1">
                  <Label>{EMPHASIS_LABELS[key]} variant</Label>
                  <Textarea
                    value={profile.pitchVariants[key] ?? ""}
                    onChange={(event) =>
                      updateProfile((current) => ({
                        ...current,
                        pitchVariants: { ...current.pitchVariants, [key]: event.target.value },
                      }))
                    }
                    className="min-h-[70px] text-xs"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------- skills ------------------------------ */}
        <TabsContent value="skills" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Skill categories</CardTitle>
              <CardDescription>
                Each category prints as one line. Category and item order are re-ranked against the
                posting; the terms and tags here are the vocabulary the analyzer matches on.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.skillGroups.map((group, groupIndex) => (
                <div key={group.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex gap-2">
                    <Input
                      value={group.title}
                      onChange={(event) => updateSkillGroup(groupIndex, { title: event.target.value })}
                      className="h-8 font-medium"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      aria-label="Remove category"
                      onClick={() =>
                        updateProfile((current) => ({
                          ...current,
                          skillGroups: current.skillGroups.filter((_, i) => i !== groupIndex),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {group.items.map((item, itemIndex) => (
                    <div
                      key={item.id}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]"
                    >
                      <Input
                        value={item.term}
                        placeholder="Skill as it prints"
                        onChange={(event) =>
                          updateSkillGroup(groupIndex, {
                            items: group.items.map((skill, j) =>
                              j === itemIndex ? { ...skill, term: event.target.value } : skill,
                            ),
                          })
                        }
                        className="h-8 text-xs"
                      />
                      <Input
                        value={(item.tags ?? []).join(", ")}
                        placeholder="matching tags, comma separated"
                        onChange={(event) =>
                          updateSkillGroup(groupIndex, {
                            items: group.items.map((skill, j) =>
                              j === itemIndex
                                ? {
                                    ...skill,
                                    tags: event.target.value
                                      .split(",")
                                      .map((tag) => tag.trim())
                                      .filter(Boolean),
                                  }
                                : skill,
                            ),
                          })
                        }
                        className="h-8 text-[11px]"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        aria-label="Remove skill"
                        onClick={() =>
                          updateSkillGroup(groupIndex, {
                            items: group.items.filter((_, j) => j !== itemIndex),
                          })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() =>
                      updateSkillGroup(groupIndex, {
                        items: [...group.items, { id: makeId("sk"), term: "", tags: [] }],
                      })
                    }
                  >
                    <Plus className="h-3 w-3" />
                    Add skill
                  </Button>
                </div>
              ))}

              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateProfile((current) => ({
                    ...current,
                    skillGroups: [
                      ...current.skillGroups,
                      { id: makeId("sg"), title: "New category", items: [] },
                    ],
                  }))
                }
              >
                <Plus className="h-4 w-4" />
                Add category
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------------------- experience ---------------------------- */}
        <TabsContent value="experience" className="space-y-3">
          {profile.roles.map((role, index) => (
            <Card key={role.id}>
              <CardHeader className="pb-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Role title" value={role.role} onChange={(value) => updateRole(index, { role: value })} />
                  <Field label="Company" value={role.company} onChange={(value) => updateRole(index, { company: value })} />
                  <Field label="Location" value={role.location} onChange={(value) => updateRole(index, { location: value })} />
                  <Field
                    label="Dates"
                    value={role.dates}
                    onChange={(value) => updateRole(index, { dates: value })}
                    hint="e.g. 2026 – Present"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Bullets</Label>
                  <BulletList
                    bullets={role.bullets}
                    onChange={(bullets) => updateRole(index, { bullets })}
                    addLabel="Add bullet"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Tags decide which bullets surface for a given posting. Emphasis decides which tone
                    toggle promotes them. Higher-intensity rephrasings are optional.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    updateProfile((current) => ({
                      ...current,
                      roles: current.roles.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Remove role
                </Button>
              </CardContent>
            </Card>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              updateProfile((current) => ({
                ...current,
                roles: [
                  ...current.roles,
                  {
                    id: makeId("role"),
                    role: "",
                    company: "",
                    location: "",
                    dates: "",
                    bullets: [],
                  },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add role
          </Button>
        </TabsContent>

        {/* ------------------------------ projects ----------------------------- */}
        <TabsContent value="projects" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>
                Automation projects print in the Key Automation Projects block. Order and trimming are
                relevance-driven, so keep the bullets tight.
              </CardDescription>
            </CardHeader>
          </Card>
          {profile.projects.map((project, index) => (
            <Card key={project.id}>
              <CardHeader className="pb-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Project name"
                    value={project.name}
                    onChange={(value) => updateProject(index, { name: value })}
                  />
                  <Field
                    label="Stack / link"
                    value={project.meta}
                    onChange={(value) => updateProject(index, { meta: value })}
                    hint="e.g. Python / PySide6 · github.com/…"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <BulletList
                  bullets={project.bullets}
                  onChange={(bullets) => updateProject(index, { bullets })}
                  addLabel="Add bullet"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() =>
                    updateProfile((current) => ({
                      ...current,
                      projects: current.projects.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Remove project
                </Button>
              </CardContent>
            </Card>
          ))}
          <Button
            variant="outline"
            onClick={() =>
              updateProfile((current) => ({
                ...current,
                projects: [
                  ...current.projects,
                  { id: makeId("proj"), name: "", meta: "", bullets: [] },
                ],
              }))
            }
          >
            <Plus className="h-4 w-4" />
            Add project
          </Button>
        </TabsContent>

        {/* ------------------------------- market ------------------------------ */}
        <TabsContent value="market" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Target market</CardTitle>
              <CardDescription>
                Drives the market-fit check on every posting: locations, accepted work modes and the
                titles the analyzer looks for.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field
                label="Market label"
                value={profile.targetMarket.label}
                onChange={(value) =>
                  updateProfile((current) => ({
                    ...current,
                    targetMarket: { ...current.targetMarket, label: value },
                  }))
                }
              />
              <div className="space-y-1">
                <Label>Target locations</Label>
                <ChipListEditor
                  values={profile.targetMarket.locations}
                  onChange={(locations) =>
                    updateProfile((current) => ({
                      ...current,
                      targetMarket: { ...current.targetMarket, locations },
                    }))
                  }
                  placeholder="e.g. Portland, OR"
                />
              </div>
              <div className="space-y-2">
                <Label>Accepted work modes</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(["Remote", "Hybrid", "In-Office"] as WorkMode[]).map((mode) => {
                    const active = profile.targetMarket.workModes.includes(mode);
                    return (
                      <Button
                        key={mode}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs"
                        onClick={() =>
                          updateProfile((current) => ({
                            ...current,
                            targetMarket: {
                              ...current.targetMarket,
                              workModes: active
                                ? current.targetMarket.workModes.filter((entry) => entry !== mode)
                                : [...current.targetMarket.workModes, mode],
                            },
                          }))
                        }
                      >
                        {mode}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Target titles</Label>
                <ChipListEditor
                  values={profile.targetMarket.titles}
                  onChange={(titles) =>
                    updateProfile((current) => ({
                      ...current,
                      targetMarket: { ...current.targetMarket, titles },
                    }))
                  }
                  placeholder="e.g. VDC Coordinator"
                />
                <p className="text-[10px] text-muted-foreground">
                  These titles boost the parser's confidence when it reads a job title, and they are
                  the words the headline check aligns against.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------------------- credentials --------------------------- */}
        <TabsContent value="credentials" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Certifications &amp; Background</CardTitle>
              <CardDescription>
                These print as the final section, re-ordered by relevance. Empty certifications show
                up as an ATS warning, since many filters look for specific credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Certifications</Label>
                <TextListEditor
                  items={profile.certifications}
                  onChange={(certifications) => updateProfile((current) => ({ ...current, certifications }))}
                  addLabel="Add certification"
                  placeholder="e.g. OSHA 30 (2024)"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Education</Label>
                <TextListEditor
                  items={profile.education}
                  onChange={(education) => updateProfile((current) => ({ ...current, education }))}
                  addLabel="Add education"
                  placeholder="e.g. Technical Certification in Computer Programming"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Trade background lines</Label>
                <TextListEditor
                  items={profile.background}
                  onChange={(background) => updateProfile((current) => ({ ...current, background }))}
                  addLabel="Add background line"
                  placeholder="e.g. 10 years of field trade & site coordination"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>




      </Tabs>

      <Separator />
      <WorkspaceFileCard onOpen={openFolder} />
      <DataCard />
    </div>
  );
}


/* -------------------------------------------------------------------------- */
/* Data card — export, import, reset                                          */
/* -------------------------------------------------------------------------- */

function DataCard() {
  const { profile, draft, applications, resetProfile } = useWorkspace();
  /** The same restore path the folder panel uses, so the two doors into the app agree. */
  const applyImport = useApplyImport();
  const [importText, setImportText] = React.useState("");
  const [importOpen, setImportOpen] = React.useState(false);
  const [stats, setStats] = React.useState<{ key: string; bytes: number }[]>([]);

  React.useEffect(() => {
    setStats(
      (Object.values(STORAGE_KEYS) as StorageKey[]).map((key) => ({
        key,
        bytes: (window.localStorage.getItem(key) ?? "").length,
      })),
    );
  }, [profile, draft, applications]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-primary" />
          Data, backup and restore
        </CardTitle>
        <CardDescription>
          Everything lives in localStorage under versioned keys. Export often — clearing site data
          wipes it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              downloadText(
                JSON.stringify(buildBackup(), null, 2),
                "career-matrix-backup.json",
                "application/json",
              );
              toast.success("Full backup exported (profile, draft, saved applications).");
            }}
          >
            <Download className="h-4 w-4" />
            Export full backup
          </Button>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <FolderUp className="h-4 w-4" />
                Import JSON
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import a profile or a full backup</DialogTitle>
                <DialogDescription>
                  Paste an exported profile or a backup bundle. A bare profile replaces the Master
                  Profile; a bundle also restores the draft and the saved applications.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder='{ "header": { "name": "..." }, "roles": [ ... ] }'
                className="scroll-pane h-48 font-mono text-[11px]"
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  size="sm"
                  disabled={!importText.trim()}
                  onClick={() => {
                    applyImport(parseImport(importText));
                    setImportText("");
                    setImportOpen(false);
                  }}
                >
                  Import
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <label className="inline-flex">
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then((text) => applyImport(parseImport(text)));
                event.target.value = "";
              }}
            />
            <span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent">
              <FolderUp className="h-4 w-4" />
              Load file
            </span>
          </label>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!window.confirm("Reset the Master Profile to the seeded default?")) return;
              resetProfile();
              toast.success("Master Profile reset to the seed.");
            }}
          >
            <RefreshCcw className="h-4 w-4" />
            Reset profile
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {stats.map((stat) => (
            <div
              key={stat.key}
              className="flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px]"
            >
              <span className="font-mono text-muted-foreground">{stat.key}</span>
              <span className="tabular-nums">{(stat.bytes / 1024).toFixed(1)} KB</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

