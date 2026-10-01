import type {
  Emphasis,
  ResumeEdits,
  TailoredResume,
  VersionSnapshot,
} from "./types";
import { EMPHASIS_LABELS } from "./types";
import { countEdits } from "./resumeEdits";
import { makeId } from "./utils";

/**
 * Draft versions.
 *
 * A snapshot is the whole tailored sheet plus the edit layer that produced it,
 * so restoring one is a true restore: intensity, emphasis, type size, edits and
 * the posting text all come back together. That is what makes it safe to
 * experiment — push the slider to 90%, hate it, and step back.
 */

const MAX_VERSIONS = 40;

/** Cheap, stable, non-cryptographic content hash (FNV-1a, 32 bit). */
export function contentHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Everything that makes the sheet look the way it looks. */
function resumeSignature(resume: TailoredResume, edits: ResumeEdits): string {
  return JSON.stringify({
    headline: resume.header.headline,
    summary: resume.summary,
    fontPt: resume.options.fontPt,
    intensity: resume.options.intensity,
    emphasis: resume.options.emphasis,
    hidden: resume.hiddenSections,
    skills: resume.skillGroups.map((group) => [group.id, group.items]),
    roles: resume.roles.map((role) => [
      role.id,
      role.role,
      role.company,
      role.location,
      role.dates,
      role.bullets.map((bullet) => [bullet.id, bullet.label, bullet.text]),
    ]),
    projects: resume.projects.map((project) => [
      project.id,
      project.name,
      project.meta,
      project.bullets.map((bullet) => [bullet.id, bullet.label, bullet.text]),
    ]),
    certs: resume.certifications.lines,
    editCount: countEdits(edits),
  });
}

export function versionHash(resume: TailoredResume, edits: ResumeEdits): string {
  return contentHash(resumeSignature(resume, edits));
}

export function jobHashOf(rawText: string): string {
  return contentHash(rawText.trim().toLowerCase().replace(/\s+/g, " "));
}

export const VERSION_LIMIT = MAX_VERSIONS;
export { EMPHASIS_LABELS };
export type { Emphasis };


/* -------------------------------------------------------------------------- */
/* Diffing                                                                    */
/* -------------------------------------------------------------------------- */

function bulletMap(resume: TailoredResume): Map<string, string> {
  const map = new Map<string, string>();
  for (const role of resume.roles) {
    for (const bullet of role.bullets) map.set(bullet.id, `${bullet.label}|${bullet.text}`);
  }
  for (const project of resume.projects) {
    for (const bullet of project.bullets) map.set(bullet.id, `${bullet.label}|${bullet.text}`);
  }
  return map;
}

/** Human-readable structural difference between two snapshots. */
export function diffResumes(
  before: { resume: TailoredResume; edits?: ResumeEdits },
  after: { resume: TailoredResume; edits?: ResumeEdits },
): string[] {
  const lines: string[] = [];
  const a = before.resume;
  const b = after.resume;

  if (a.header.headline !== b.header.headline) lines.push("headline changed");
  if (a.summary !== b.summary) lines.push("summary changed");
  if (a.options.intensity !== b.options.intensity) {
    lines.push(`intensity ${a.options.intensity}% to ${b.options.intensity}%`);
  }
  if (a.options.emphasis !== b.options.emphasis) {
    lines.push(`tone ${a.options.emphasis} to ${b.options.emphasis}`);
  }
  if (a.options.fontPt !== b.options.fontPt) {
    lines.push(`type ${a.options.fontPt}pt to ${b.options.fontPt}pt`);
  }

  const skillsA = a.skillGroups.flatMap((group) => group.items);
  const skillsB = b.skillGroups.flatMap((group) => group.items);
  if (skillsA.length !== skillsB.length) {
    const delta = skillsB.length - skillsA.length;
    lines.push(`${delta > 0 ? "+" : ""}${delta} skills`);
  } else if (skillsA.join("|") !== skillsB.join("|")) {
    lines.push("skill order changed");
  }

  const bulletsA = bulletMap(a);
  const bulletsB = bulletMap(b);
  let edited = 0;
  let added = 0;
  for (const [id, value] of bulletsB) {
    if (!bulletsA.has(id)) added += 1;
    else if (bulletsA.get(id) !== value) edited += 1;
  }
  let removed = 0;
  for (const id of bulletsA.keys()) if (!bulletsB.has(id)) removed += 1;
  if (edited) lines.push(`${edited} bullet(s) reworded`);
  if (added) lines.push(`${added} bullet(s) added`);
  if (removed) lines.push(`${removed} bullet(s) dropped`);

  if (a.projects.map((p) => p.name).join("|") !== b.projects.map((p) => p.name).join("|")) {
    lines.push("project list changed");
  }
  if (a.certifications.lines.join("|") !== b.certifications.lines.join("|")) {
    lines.push("credentials changed");
  }
  if ((a.hiddenSections ?? []).join("|") !== (b.hiddenSections ?? []).join("|")) {
    lines.push("hidden sections changed");
  }

  const editsA = countEdits(before.edits);
  const editsB = countEdits(after.edits);
  if (editsA !== editsB) lines.push(`${editsB - editsA > 0 ? "+" : ""}${editsB - editsA} manual edits`);

  if (a.ats.score !== b.ats.score) lines.push(`ATS ${a.ats.score} to ${b.ats.score}`);

  return lines.length ? lines : ["no visible change"];
}

/* -------------------------------------------------------------------------- */
/* Snapshot creation and eviction                                             */
/* -------------------------------------------------------------------------- */

export function createVersion(args: {
  resume: TailoredResume;
  edits: ResumeEdits;
  rawText: string;
  jobTitle: string;
  company: string;
  previous?: VersionSnapshot;
  index: number;
  label?: string;
}): VersionSnapshot {
  const { resume, edits, rawText, jobTitle, company, previous, index } = args;
  const base = {
    id: makeId("ver"),
    createdAt: new Date().toISOString(),
    label: args.label?.trim() || `v${index}`,
    pinned: false,
    hash: versionHash(resume, edits),
    jobHash: jobHashOf(rawText),
    jobTitle,
    company,
    intensity: resume.options.intensity,
    emphasis: resume.options.emphasis,
    fontPt: resume.options.fontPt,
    atsScore: resume.ats.score,
    coverage: resume.ats.coverage,
    editCount: countEdits(edits),
    resume,
    edits,
    rawText,
  };
  return {
    ...base,
    changes: previous ? diffResumes(previous, base) : ["initial draft"],
  };
}

/** Bounded list: pinned versions always survive, oldest unpinned go first. */
export function pruneVersions(versions: VersionSnapshot[]): VersionSnapshot[] {
  if (versions.length <= MAX_VERSIONS) return versions;
  const pinned = versions.filter((version) => version.pinned);
  const unpinned = versions.filter((version) => !version.pinned);
  const keep = new Set(
    unpinned.slice(0, Math.max(0, MAX_VERSIONS - pinned.length)).map((version) => version.id),
  );
  return versions
    .filter((version) => version.pinned || keep.has(version.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** True when this state is already the newest snapshot — nothing to record. */
export function isDuplicateOfLatest(
  versions: VersionSnapshot[],
  resume: TailoredResume,
  edits: ResumeEdits,
): boolean {
  const latest = versions[0];
  return Boolean(latest) && latest.hash === versionHash(resume, edits);
}

/** Manifest shown on a version row. */
export function versionSummary(version: VersionSnapshot): string {
  const parts = [
    `${version.intensity}% intensity`,
    EMPHASIS_LABELS[version.emphasis],
    `${version.fontPt}pt`,
    `ATS ${version.atsScore}`,
    `${version.coverage}% coverage`,
  ];
  if (version.editCount) parts.push(`${version.editCount} manual edit(s)`);
  return parts.join(" · ");
}

