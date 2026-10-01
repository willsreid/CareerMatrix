import type {
  AddedBullet,
  BulletEdit,
  JobAnalysis,
  MasterProfile,
  ProjectEdit,
  ResumeEdits,
  RoleEdit,
  TailoredBullet,
  TailoredResume,
} from "./types";
import { auditResume, RESUME_SECTIONS, wrapSkillItems } from "./resumeTailorer";
import { makeId } from "./utils";

/**
 * The hand-edit layer.
 *
 * Manual edits are applied *after* tailoring, so the engine's ranking, trimming
 * and page-fit still run on your real profile first, and your words then
 * override the result. Nothing here writes back to the Master Profile — an edit
 * belongs to this draft, for this posting.
 *
 * Because a hand-written line is no longer traceable to the profile, the layer
 * keeps a count and a manifest of every touch, and re-runs the ATS audit so the
 * score reflects the sheet you are actually looking at (including keyword
 * coverage an edit may have cost).
 */

export const EMPTY_EDITS: ResumeEdits = {};

/** Count of individual fields the user has touched. */
export function countEdits(edits: ResumeEdits | undefined): number {
  if (!edits) return 0;
  let total = 0;
  if (edits.headline !== undefined) total += 1;
  if (edits.summary !== undefined) total += 1;
  if (edits.certLines) total += 1;
  if (edits.hiddenSections) total += edits.hiddenSections.length;

  for (const items of Object.values(edits.skillGroups ?? {})) {
    if (items) total += 1;
  }

  const countBulletBlock = (block: {
    role?: string;
    company?: string;
    location?: string;
    dates?: string;
    name?: string;
    meta?: string;
    hidden?: boolean;
    bullets?: Record<string, BulletEdit>;
    hiddenBullets?: string[];
    addedBullets?: AddedBullet[];
  }) => {
    for (const key of ["role", "company", "location", "dates", "name", "meta"] as const) {
      if (block[key] !== undefined) total += 1;
    }
    if (block.hidden) total += 1;
    total += Object.keys(block.bullets ?? {}).length;
    total += (block.hiddenBullets ?? []).length;
    total += (block.addedBullets ?? []).length;
  };

  for (const role of Object.values(edits.roles ?? {})) countBulletBlock(role);
  for (const project of Object.values(edits.projects ?? {})) countBulletBlock(project);

  return total;
}

/** One-line manifest for the audit trail and version rows. */
export function describeEdits(edits: ResumeEdits | undefined): string[] {
  if (!edits) return [];
  const lines: string[] = [];
  if (edits.summary !== undefined) lines.push("summary rewritten by hand");
  if (edits.headline !== undefined) lines.push("headline changed");
  if (edits.certLines) lines.push("credential lines replaced");
  if (edits.hiddenSections?.length) {
    lines.push(`${edits.hiddenSections.length} section(s) hidden: ${edits.hiddenSections.join(", ")}`);
  }

  const skills = Object.keys(edits.skillGroups ?? {}).length;
  if (skills) lines.push(`${skills} skill group(s) retyped`);

  const bulletEdits: string[] = [];
  const addedBullets: string[] = [];
  const headerEdits: string[] = [];
  const hidden: string[] = [];

  const walk = (block: RoleEdit | ProjectEdit, owner: string, isProject: boolean) => {
    const fields: readonly string[] = isProject
      ? ["name", "meta"]
      : ["role", "company", "location", "dates"];
    const record = block as Record<string, unknown>;
    for (const key of fields) {
      if (record[key] !== undefined) headerEdits.push(`${owner} ${key}`);
    }
    if (block.hidden) hidden.push(`${owner} block`);
    for (const [bulletId, edit] of Object.entries(block.bullets ?? {})) {
      bulletEdits.push(`${owner} ${bulletId}${edit.label !== undefined ? " label" : ""}${edit.text !== undefined ? " text" : ""}`);
    }
    for (const id of block.hiddenBullets ?? []) hidden.push(`${owner} bullet ${id}`);
    for (const bullet of block.addedBullets ?? []) addedBullets.push(`${owner}: "${bullet.label || bullet.text.slice(0, 30)}…"`);
  };

  for (const [roleId, role] of Object.entries(edits.roles ?? {})) walk(role, roleId, false);
  for (const [projectId, project] of Object.entries(edits.projects ?? {})) walk(project, projectId, true);

  if (headerEdits.length) lines.push(`${headerEdits.length} header field(s) rewritten`);
  if (bulletEdits.length) lines.push(`${bulletEdits.length} bullet(s) rewritten`);
  if (addedBullets.length) lines.push(`${addedBullets.length} bullet(s) added: ${addedBullets.join("; ")}`);
  if (hidden.length) lines.push(`${hidden.length} item(s) hidden: ${hidden.join(", ")}`);

  return lines;
}

function manualBullet(bullet: AddedBullet): TailoredBullet {
  return {
    id: bullet.id,
    label: bullet.label,
    text: bullet.text,
    relevance: 0,
    hot: false,
    adjustment: "manual",
  };
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Applies the edit layer to a tailored resume and refreshes the ATS audit.
 * Returns the same object untouched when there is nothing to apply.
 */
export function applyEdits(
  resume: TailoredResume,
  edits: ResumeEdits | undefined,
  context?: { profile?: MasterProfile; analysis?: JobAnalysis | null },
): TailoredResume {
  if (!edits || countEdits(edits) === 0) return resume;

  const hiddenSections = edits.hiddenSections ?? [];
  const isHidden = (section: string) => hiddenSections.includes(section);
  const fontPt = resume.options.fontPt;

  const next: TailoredResume = {
    ...resume,
    header:
      edits.headline !== undefined
        ? { ...resume.header, headline: edits.headline }
        : resume.header,
    summary: isHidden(RESUME_SECTIONS[0]) ? "" : edits.summary ?? resume.summary,
    skillGroups: isHidden(RESUME_SECTIONS[1])
      ? []
      : resume.skillGroups.map((group) => {
          const replacement = edits.skillGroups?.[group.id];
          if (!replacement) return group;
          return { ...group, items: replacement, lines: wrapSkillItems(replacement, fontPt) };
        }),
    roles: isHidden(RESUME_SECTIONS[2]) ? [] : applyRoleEdits(resume, edits),
    projects: isHidden(RESUME_SECTIONS[3]) ? [] : applyProjectEdits(resume, edits),
    certifications: isHidden(RESUME_SECTIONS[4])
      ? { ...resume.certifications, lines: [] }
      : edits.certLines
        ? { ...resume.certifications, lines: edits.certLines }
        : resume.certifications,
    hiddenSections,
  };

  const notes = [...resume.notes];
  notes.push(
    `Applied ${countEdits(edits)} manual edit(s): ${describeEdits(edits).join("; ")}. These are your words, not the profile's, and the audit below reflects them.`,
  );

  if (context?.profile) {
    const audit = auditResume(context.profile, context.analysis ?? null, next);
    return { ...next, ats: audit.ats, notes };
  }

  return { ...next, notes };
}

function applyRoleEdits(resume: TailoredResume, edits: ResumeEdits): TailoredResume["roles"] {
  return resume.roles
    .map((role) => {
      const edit: RoleEdit | undefined = edits.roles?.[role.id];
      if (!edit) return role;
      if (edit.hidden) return null;
      const visible = role.bullets.filter(
        (bullet) => !(edit.hiddenBullets ?? []).includes(bullet.id),
      );
      const edited = visible.map((bullet) => {
        const bulletEdit = edit.bullets?.[bullet.id];
        if (!bulletEdit) return bullet;
        return {
          ...bullet,
          label: bulletEdit.label ?? bullet.label,
          text: bulletEdit.text ?? bullet.text,
          adjustment: "manual" as const,
        };
      });
      return {
        ...role,
        role: edit.role ?? role.role,
        company: edit.company ?? role.company,
        location: edit.location ?? role.location,
        dates: edit.dates ?? role.dates,
        bullets: [...edited, ...(edit.addedBullets ?? []).map(manualBullet)],
      };
    })
    .filter((role): role is TailoredResume["roles"][number] => role !== null);
}

function applyProjectEdits(resume: TailoredResume, edits: ResumeEdits): TailoredResume["projects"] {
  return resume.projects
    .map((project) => {
      const edit: ProjectEdit | undefined = edits.projects?.[project.id];
      if (!edit) return project;
      if (edit.hidden) return null;
      const visible = project.bullets.filter(
        (bullet) => !(edit.hiddenBullets ?? []).includes(bullet.id),
      );
      const edited = visible.map((bullet) => {
        const bulletEdit = edit.bullets?.[bullet.id];
        if (!bulletEdit) return bullet;
        return {
          ...bullet,
          label: bulletEdit.label ?? bullet.label,
          text: bulletEdit.text ?? bullet.text,
          adjustment: "manual" as const,
        };
      });
      return {
        ...project,
        name: edit.name ?? project.name,
        meta: edit.meta ?? project.meta,
        bullets: [...edited, ...(edit.addedBullets ?? []).map(manualBullet)],
      };
    })
    .filter((project): project is TailoredResume["projects"][number] => project !== null);
}


/* -------------------------------------------------------------------------- */
/* Immutable setters used by the editor UI                                     */
/* -------------------------------------------------------------------------- */

export function setBulletEdit(
  edits: ResumeEdits,
  owner: "roles" | "projects",
  blockId: string,
  bulletId: string,
  patch: BulletEdit,
): ResumeEdits {
  const block = edits[owner]?.[blockId] ?? {};
  return {
    ...edits,
    [owner]: {
      ...(edits[owner] ?? {}),
      [blockId]: {
        ...block,
        bullets: {
          ...(block.bullets ?? {}),
          [bulletId]: { ...block.bullets?.[bulletId], ...patch },
        },
      } as RoleEdit,
    },
  };
}

export function setBlockField(
  edits: ResumeEdits,
  owner: "roles" | "projects",
  blockId: string,
  patch: RoleEdit | ProjectEdit,
): ResumeEdits {
  const block = edits[owner]?.[blockId] ?? {};
  return {
    ...edits,
    [owner]: {
      ...(edits[owner] ?? {}),
      [blockId]: { ...block, ...(patch as RoleEdit) },
    },
  };
}

export function addMyBullet(
  edits: ResumeEdits,
  owner: "roles" | "projects",
  blockId: string,
): { edits: ResumeEdits; id: string } {
  const block = edits[owner]?.[blockId] ?? {};
  const bullet: AddedBullet = { id: makeId("mine"), label: "", text: "" };
  return {
    id: bullet.id,
    edits: {
      ...edits,
      [owner]: {
        ...(edits[owner] ?? {}),
        [blockId]: { ...block, addedBullets: [...(block.addedBullets ?? []), bullet] },
      } as RoleEdit,
    },
  };
}

export function removeMyBullet(
  edits: ResumeEdits,
  owner: "roles" | "projects",
  blockId: string,
  bulletId: string,
): ResumeEdits {
  const block = edits[owner]?.[blockId];
  if (!block) return edits;
  return {
    ...edits,
    [owner]: {
      ...(edits[owner] ?? {}),
      [blockId]: {
        ...block,
        addedBullets: (block.addedBullets ?? []).filter((bullet) => bullet.id !== bulletId),
      },
    },
  };
}

/** Hides a tailorable bullet without deleting it from the profile. */
export function toggleHiddenBullet(
  edits: ResumeEdits,
  owner: "roles" | "projects",
  blockId: string,
  bulletId: string,
): ResumeEdits {
  const block = edits[owner]?.[blockId] ?? {};
  const current = block.hiddenBullets ?? [];
  return {
    ...edits,
    [owner]: {
      ...(edits[owner] ?? {}),
      [blockId]: {
        ...block,
        hiddenBullets: current.includes(bulletId)
          ? current.filter((id) => id !== bulletId)
          : [...current, bulletId],
      } as RoleEdit,
    },
  };
}

export function toggleHiddenSection(edits: ResumeEdits, section: string): ResumeEdits {
  const current = edits.hiddenSections ?? [];
  return {
    ...edits,
    hiddenSections: current.includes(section)
      ? current.filter((entry) => entry !== section)
      : [...current, section],
  };
}

export function setSkillItems(edits: ResumeEdits, groupId: string, items: string[]): ResumeEdits {
  return { ...edits, skillGroups: { ...(edits.skillGroups ?? {}), [groupId]: items } };
}

/** Just the tailorable bullets currently hidden by the edit layer. */
export function hiddenBulletIds(edits: ResumeEdits | undefined): Set<string> {
  const ids = new Set<string>();
  if (!edits) return ids;
  for (const block of [...Object.values(edits.roles ?? {}), ...Object.values(edits.projects ?? {})]) {
    for (const id of block.hiddenBullets ?? []) ids.add(id);
  }
  return ids;
}
