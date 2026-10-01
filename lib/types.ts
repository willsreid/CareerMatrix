/**
 * Domain model for Career Matrix.
 *
 * Everything in here is plain, serialisable data so the whole workspace can be
 * persisted to localStorage and round-tripped through JSON import/export.
 */

/* -------------------------------------------------------------------------- */
/* Emphasis + tailoring                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Which side of your experience the sheet leads with.
 *
 * Deliberately industry-neutral: these are axes, not job families, so the same
 * three choices work for a coordination lead, a marketer, or an engineer. The
 * Master Profile tags bullets with them ("promote this bullet when I am leading
 * with tooling"), and the tailorer uses the tags plus the chosen pitch variant.
 */
export type Emphasis = "technical" | "delivery" | "balanced";

export const EMPHASIS_IDS: Emphasis[] = ["balanced", "technical", "delivery"];

export const EMPHASIS_LABELS: Record<Emphasis, string> = {
  balanced: "Balanced",
  technical: "Technical & Tools Heavy",
  delivery: "Delivery & Operations Heavy",
};

/**
 * One-line explanation per facet, shown under the picker. Kept here so the
 * wording lives next to the ids it describes.
 */
export const EMPHASIS_HINTS: Record<Emphasis, string> = {
  balanced: "The whole picture — no bias toward either side of the work.",
  technical: "Lead with systems, tooling, code and analysis.",
  delivery: "Lead with hands-on execution, coordination and field outcomes.",
};

/**
 * Slugs used before the facets were generalised. Kept so a profile, draft,
 * saved application or version written by an earlier build still reads back as
 * the facet it meant instead of silently collapsing to the default.
 */
const LEGACY_EMPHASIS: Record<string, Emphasis> = {
  automation: "technical",
  field: "delivery",
  "automation & code heavy": "technical",
  "field coordination & trades heavy": "delivery",
  "balanced vdc lead": "balanced",
};

/** Maps anything that might be a stored emphasis onto a current id. */
export function normalizeEmphasis(value: unknown): Emphasis {
  if (typeof value !== "string") return "balanced";
  const key = value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  if (key in EMPHASIS_LABELS) return key as Emphasis;
  return LEGACY_EMPHASIS[key] ?? LEGACY_EMPHASIS[key.replace(/\s+/g, " ")] ?? "balanced";
}

/** Label lookup that cannot return undefined, whatever is in storage. */
export function emphasisLabel(value: unknown): string {
  return EMPHASIS_LABELS[normalizeEmphasis(value)];
}

export type WorkMode = "Remote" | "Hybrid" | "In-Office" | "Unspecified";

/**
 * How the sheet is laid out.
 *
 * `page`     — a fixed US Letter sheet. The tailorer shrinks the type and trims
 *              spare project bullets to guarantee exactly one page. Print-first.
 * `continuous` — the same typography on an unbounded sheet that flows across as
 *              many Letter pages as the content needs. Nothing is cut and the
 *              type size is never reduced. Read-first.
 */
export type SheetLayout = "page" | "continuous";

export const SHEET_LAYOUT_LABELS: Record<SheetLayout, string> = {
  page: "One page",
  continuous: "Continuous",
};


/* -------------------------------------------------------------------------- */
/* Master profile                                                             */
/* -------------------------------------------------------------------------- */

export interface MasterHeader {
  name: string;
  headline: string;
  /** Truthful alternate headlines the tailorer may swap in at high intensity. */
  altHeadlines: string[];
  /** Short market label, e.g. "Texas / Pacific Northwest". */
  location: string;
  /** Long-form line printed under the market label, e.g. relocation timing. */
  locationNote: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
}

export interface BulletVariant {
  /** Only unlocked once the tailoring slider reaches this value. */
  minIntensity: number;
  text: string;
}

export interface ProfileBullet {
  id: string;
  /** Navy lead-in printed in bold, e.g. "Model Coordination". */
  label: string;
  text: string;
  /** Keywords this bullet genuinely evidences. Drives relevance scoring. */
  tags: string[];
  /** Alternate truthful phrasings unlocked at higher tailoring intensity. */
  variants?: BulletVariant[];
  /** Which focus bias this bullet should be promoted under. */
  emphasis?: Emphasis[];
}

export interface ProfileRole {
  id: string;
  role: string;
  company: string;
  location: string;
  dates: string;
  bullets: ProfileBullet[];
}

export interface ProfileProject {
  id: string;
  name: string;
  /** Tech stack + link line, e.g. "Python / PySide6 · github.com/…". */
  meta: string;
  bullets: ProfileBullet[];
}

export interface SkillItem {
  id: string;
  term: string;
  /** Extra keywords this skill item evidences, beyond its own term. */
  tags?: string[];
  emphasis?: Emphasis[];
}

export interface SkillGroup {
  id: string;
  title: string;
  items: SkillItem[];
  /**
   * Which focus bias promotes this group. Optional so a profile built by hand (or
   * by resume import) works without tagging; the seed's own group ids also carry
   * a fallback affinity map in the tailorer.
   */
  emphasis?: Emphasis[];
}

export interface MasterProfile {
  version: number;
  updatedAt: string;
  header: MasterHeader;
  /** The stored core pitch. Intensity + emphasis reshape it, never invent it. */
  pitch: string;
  pitchVariants: Record<Emphasis, string>;
  /** Stated explicitly so the analyzer can score market fit. */
  targetMarket: {
    label: string;
    locations: string[];
    workModes: WorkMode[];
    titles: string[];
  };
  skillGroups: SkillGroup[];
  roles: ProfileRole[];
  projects: ProfileProject[];
  education: { id: string; text: string }[];
  certifications: { id: string; text: string }[];
  background: { id: string; text: string }[];
}

/* -------------------------------------------------------------------------- */
/* Job posting analysis                                                       */
/* -------------------------------------------------------------------------- */

export interface JobMeta {
  title: string;
  titleConfidence: number;
  company: string;
  location: string;
  workMode: WorkMode;
  workModeEvidence: string;
  seniority: string;
  employmentType: string;
  salary: string;
  source: string;
  wordCount: number;
}

export interface KeywordHit {
  /** Canonical display term, e.g. "Navisworks Manage". */
  term: string;
  category: string;
  /** Raw occurrences found in the posting. */
  mentions: number;
  /** Intrinsic importance of the term in this job family (1-10). */
  weight: number;
  /** weight * (1 + ln(mentions)) — used for ordering and coverage maths. */
  score: number;
  inProfile: boolean;
  /** Where in the profile the term was found (for the "why" tooltip). */
  evidence: string[];
  /** Aliases that actually fired in the posting. */
  matchedAliases: string[];
  /** True when the hit came from the posting's requirements region. */
  inRequirements: boolean;
}

export interface JobAnalysis {
  rawText: string;
  meta: JobMeta;
  keywords: KeywordHit[];
  matched: KeywordHit[];
  missing: KeywordHit[];
  requirementLines: string[];
  responsibilityLines: string[];
  /** Weighted share of the posting's keyword mass that the profile covers. */
  matchScore: number;
  marketFit: {
    location: "strong" | "partial" | "weak";
    workMode: "strong" | "partial" | "weak";
    /** How much of the posting's vocabulary is actually VDC/BIM/field work. */
    roleShape: "strong" | "partial" | "weak";
    headline: string;
    detail: string;
  };
}

/* -------------------------------------------------------------------------- */
/* Tailored resume                                                            */
/* -------------------------------------------------------------------------- */

export interface TailoredBullet {
  id: string;
  label: string;
  text: string;
  relevance: number;
  /** True when this bullet is a direct hit on the active posting. */
  hot: boolean;
  /** How the bullet was reshaped, for the audit trail. */
  adjustment: "verbatim" | "relabelled" | "variant" | "manual";
}

/* -------------------------------------------------------------------------- */
/* Manual edits                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Hand edits layered on top of the tailored resume.
 *
 * Kept separate from the Master Profile on purpose: an edit belongs to *this*
 * draft for *this* posting. The engine still ranks and reorders the profile
 * first, then these override the result, so a hand-written line never disturbs
 * the relevance scoring for everything else.
 */
export interface BulletEdit {
  label?: string;
  text?: string;
}

export interface AddedBullet {
  id: string;
  label: string;
  text: string;
}

export interface RoleEdit {
  role?: string;
  company?: string;
  location?: string;
  dates?: string;
  hidden?: boolean;
  bullets?: Record<string, BulletEdit>;
  hiddenBullets?: string[];
  addedBullets?: AddedBullet[];
}

export interface ProjectEdit {
  name?: string;
  meta?: string;
  hidden?: boolean;
  bullets?: Record<string, BulletEdit>;
  hiddenBullets?: string[];
  addedBullets?: AddedBullet[];
}

export interface ResumeEdits {
  headline?: string;
  summary?: string;
  /** groupId -> replacement item list. */
  skillGroups?: Record<string, string[]>;
  roles?: Record<string, RoleEdit>;
  projects?: Record<string, ProjectEdit>;
  certLines?: string[];
  /** Names from RESUME_SECTIONS to leave off the sheet. */
  hiddenSections?: string[];
}

export interface TailoredSkillGroup {
  id: string;
  title: string;
  /** Items already ordered for this job and joined into print lines. */
  lines: string[];
  /** Every item that survived, in print order, for the highlight legend. */
  items: string[];
  relevance: number;
}

export interface TailoredRole {
  id: string;
  role: string;
  company: string;
  location: string;
  dates: string;
  bullets: TailoredBullet[];
}

export interface AtsCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface TailoredResume {
  header: MasterHeader;
  summary: string;
  skillGroups: TailoredSkillGroup[];
  roles: TailoredRole[];
  projects: { id: string; name: string; meta: string; bullets: TailoredBullet[] }[];
  certifications: { heading: string; lines: string[] };
  /** Section names deliberately left off this sheet (see ResumeEdits). */
  hiddenSections: string[];
  options: {
    intensity: number;
    emphasis: Emphasis;
    fontPt: number;
    showKeywordMarks: boolean;
    /** Which layout produced this sheet. */
    layout: SheetLayout;
  };
  ats: {
    score: number;
    coverage: number;
    checks: AtsCheck[];
    /** Terms from the posting that are genuinely backed by the profile. */
    keywordLines: string[];
    /** Terms the posting wants that the profile cannot evidence. */
    gaps: string[];
  };
  /** Human-readable log of every transform the tailorer applied. */
  notes: string[];
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

export type ApplicationStage =
  | "Saved"
  | "Applied"
  | "Screen"
  | "Interview"
  | "Offer"
  | "Archived";

export const APPLICATION_STAGES: ApplicationStage[] = [
  "Saved",
  "Applied",
  "Screen",
  "Interview",
  "Offer",
  "Archived",
];

/**
 * One colour per stage, in the order the pipeline moves.
 *
 * Here rather than in whichever view draws it first, because the stages are drawn in three places now — the
 * calendar's pins, the saved list's rows and the pipeline board's funnel — and a stage that is blue on one
 * screen and green on another is a stage people stop trusting.
 */
export const STAGE_INK: Record<ApplicationStage, string> = {
  Saved: "#94a3b8",
  Applied: "#2563eb",
  Screen: "#4f46e5",
  Interview: "#d97706",
  Offer: "#059669",
  Archived: "#a1a1aa",
};

/**
 * What a "Save variant" dialog collects.
 *
 * Dates are `YYYY-MM-DD` in the viewer's own timezone, which is what an
 * `<input type="date">` gives and what the follow-up calendar will consume.
 */
export interface SaveVariantDetails {
  notes?: string;
  /** The day the application went out. */
  appliedAt?: string;
  /** The day to chase it. */
  followUpAt?: string;
  /** The person you have spoken to, or will: recruiter, referral, hiring manager. */
  contact?: string;
  /** Where it came from: job board, referral, company site. */
  source?: string;
  /** The office you would actually work in, when you already know it. */
  address?: string;
  /** Defaults to Applied when an applied date is given, otherwise Saved. */
  stage?: ApplicationStage;
}

export interface SavedApplication {
  id: string;
  savedAt: string;
  jobTitle: string;
  company: string;
  location: string;
  workMode: WorkMode;
  matchScore: number;
  intensity: number;
  emphasis: Emphasis;
  rawJobText: string;
  /** Frozen snapshot so an old application still renders after profile edits. */
  resume: TailoredResume;
  /** Hand edits that produced this variant. */
  edits: ResumeEdits;
  /** Cover letter generated for the same posting, if one was written. */
  coverLetter?: CoverLetter;
  notes: string;
  stage: ApplicationStage;
  /** ISO date the application went out, for the pipeline calendar. */
  appliedAt?: string;
  /** ISO date the next follow-up is due. */
  followUpAt?: string;
  /** The person you have spoken to, or will: recruiter, referral, hiring manager. */
  contact?: string;
  /** Where the application came from. */
  source?: string;
  /**
   * The office you would actually work in, in full: "1201 SW 5th Ave, Portland, OR 97201".
   *
   * Deliberately *not* the same thing as `location` above. `location` is what the ad said — "Hillsboro, OR
   * (Hybrid)", sometimes a whole metro, sometimes a city the office is not in — and it is what the map places
   * when there is nothing better. This is the address a recruiter gave you, or the one on the company's own
   * site: it is what you put in a navigation app on interview morning, and (at your asking, never on its own)
   * what the map pins when you press *find it on the map* in the details dialog.
   */
  address?: string;
  /**
   * The application's place on the map, when the author pinned it by hand — or placed the office address from the
   * details dialog, which is the same thing asked the long way round.
   *
   * Almost always absent: the posting's location line is placed by the gazetteer in `lib/geo.ts`, and this is
   * only for the names that book does not know — a site outside a small town, or a company whose useful
   * address is not its head office's city — plus the office buildings whose address was looked up on request.
   * A pin always wins over a lookup, because a person who typed coordinates, or the address a recruiter gave,
   * knows more than a table does.
   */
  coords?: { lat: number; lng: number };
  /**
   * Follow-up dates this application has already had, oldest first.
   *
   * The current `followUpAt` plus this is the whole chase log, which is what makes
   * "chased twice, now due Friday" possible to say.
   */
  followUpHistory?: string[];
}

export interface JobDraft {
  rawText: string;
  intensity: number;
  emphasis: Emphasis;
  fontPt: number;
  showKeywordMarks: boolean;
  /** One page, or a continuous sheet that flows across pages. */
  layout: SheetLayout;
  /** User overrides for anything the parser got wrong. */
  overrides: Partial<Pick<JobMeta, "title" | "company" | "location" | "workMode">>;
  /** Hand edits layered over the tailored sheet. */
  edits: ResumeEdits;
  /** Bumped to force the analyzer to re-run on demand. */
  revision: number;
}

/* -------------------------------------------------------------------------- */
/* Cover letter                                                               */
/* -------------------------------------------------------------------------- */

export type LetterParagraphKind = "opening" | "evidence" | "field" | "automation" | "gap" | "close";

export interface LetterParagraph {
  id: string;
  kind: LetterParagraphKind | "custom";
  text: string;
}

export interface CoverLetter {
  generatedAt: string;
  /** Recipient name when the posting named one, otherwise "Hiring Manager". */
  toName: string;
  company: string;
  jobTitle: string;
  location: string;
  salutation: string;
  paragraphs: LetterParagraph[];
  /** Engine log: what the letter used and what it refused to claim. */
  notes: string[];
  /** Posting terms with no profile evidence, deliberately left out of the prose. */
  gapsNotClaimed: string[];
  options: { emphasis: Emphasis; intensity: number; nameGaps?: boolean };
}

export interface VersionSnapshot {
  id: string;
  createdAt: string;
  label: string;
  pinned: boolean;
  /** Hash of the resume content, used to skip duplicate snapshots. */
  hash: string;
  /** Hash of the posting text this version belongs to. */
  jobHash: string;
  jobTitle: string;
  company: string;
  intensity: number;
  emphasis: Emphasis;
  fontPt: number;
  atsScore: number;
  coverage: number;
  editCount: number;
  /** Human summary of what changed versus the previous snapshot. */
  changes: string[];
  resume: TailoredResume;
  edits: ResumeEdits;
  rawText: string;
}
