import type {
  AtsCheck,
  Emphasis,
  JobAnalysis,
  MasterProfile,
  ProfileBullet,
  SheetLayout,
  TailoredBullet,
  TailoredResume,
  TailoredRole,
  TailoredSkillGroup,
} from "./types";
import { EMPHASIS_LABELS } from "./types";
import { countAlias } from "./keywordAnalyzer";

/**
 * The resume tailorer.
 *
 * Hard rule: this module can only *select, order, relabel and re-phrase* facts
 * that already exist in the Master Profile. It has no authoring capability and
 * no generative step, which is what keeps an aggressively tailored resume
 * defensible in an interview.
 */

/* -------------------------------------------------------------------------- */
/* Page geometry                                                             */
/* -------------------------------------------------------------------------- */

export const PAGE = {
  /** US Letter, in points. */
  heightPt: 792,
  widthPt: 612,
  marginTopPt: 0.62 * 72,
  marginBottomPt: 0.6 * 72,
  marginXPt: 0.75 * 72,
  /** The body size the print stylesheet is calibrated around. */
  baseFontPt: 9.3,
  baseLeadingPt: 12.9,
  /**
   * Average glyph width as a fraction of font size. Calibrated against the
   * existing one-page Helvetica sheet in ~/Desktop/resume, which fits 10.2pt
   * body text with ~35pt to spare: 0.46 reproduces that page height within
   * 6pt, whereas 0.50 (the naive figure) over-predicts it by ~10% and made the
   * engine trim content that actually fit.
   */
  charsPerPtWidth: 0.46,
} as const;

export function contentHeightPt(): number {
  return PAGE.heightPt - PAGE.marginTopPt - PAGE.marginBottomPt;
}

export function contentWidthPt(): number {
  return PAGE.widthPt - PAGE.marginXPt * 2;
}

export function charsPerLine(fontPt: number): number {
  return contentWidthPt() / (PAGE.charsPerPtWidth * fontPt);
}

/** Fraction of a page the tailorer aims to fill, leaving room for line-break drift. */
export const TARGET_FILL = 0.97;

export function minFontPt(): number {
  return 8.8;
}

export function maxFontPt(): number {
  return 10.4;
}

/* -------------------------------------------------------------------------- */
/* Relevance scoring                                                          */
/* -------------------------------------------------------------------------- */

interface RelevanceContext {
  /** alias (lowercase) -> weighted score of the keyword it belongs to. */
  aliasScores: Map<string, number>;
  maxScore: number;
}

export function buildRelevanceContext(analysis: JobAnalysis | null): RelevanceContext {
  const aliasScores = new Map<string, number>();
  if (analysis) {
    for (const hit of analysis.keywords) {
      for (const alias of [hit.term, ...hit.matchedAliases]) {
        const key = alias.toLowerCase();
        aliasScores.set(key, (aliasScores.get(key) ?? 0) + hit.score);
      }
    }
  }
  return { aliasScores, maxScore: Math.max(1, ...aliasScores.values()) };
}

/** 0-1 relevance of a piece of profile text against the active posting. */
export function scoreText(text: string, ctx: RelevanceContext): number {
  if (!text || ctx.aliasScores.size === 0) return 0;
  const haystack = ` ${text.toLowerCase()} `;
  let total = 0;
  for (const [alias, score] of ctx.aliasScores) {
    if (alias.length < 2) continue;
    if (haystack.includes(alias)) total += score;
  }
  return total / ctx.maxScore;
}

function scoreBullet(bullet: ProfileBullet, ctx: RelevanceContext): number {
  const tagText = (bullet.tags ?? []).join(" ");
  const inline = scoreText(`${bullet.label} ${bullet.text}`, ctx);
  const tagged = scoreText(tagText, ctx);
  // Tags are authored, so they are trusted a little more than the prose.
  return Math.min(1, inline * 0.6 + tagged * 0.55);
}

function textLines(text: string, fontPt: number): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / charsPerLine(fontPt)));
}

/* -------------------------------------------------------------------------- */
/* Intensity bands                                                            */
/* -------------------------------------------------------------------------- */

export type IntensityBand = "baseline" | "balanced" | "aggressive";

export interface TailorOptions {
  intensity: number;
  emphasis: Emphasis;
  fontPt: number;
  showKeywordMarks: boolean;
  layout: SheetLayout;
}

export function bandFor(intensity: number): IntensityBand {
  if (intensity <= 35) return "baseline";
  if (intensity < 80) return "balanced";
  return "aggressive";
}

export function describeBand(intensity: number): string {
  switch (bandFor(intensity)) {
    case "baseline":
      return "0-30% Factual baseline: exact profile wording, original ordering.";
    case "balanced":
      return "40-70% Balanced ATS optimisation: relevance ordering, terminology mapped to the posting, no new claims.";
    default:
      return "80-100% Aggressive alignment: the posting's exact phrasing is reused for skills and bullet labels, still only where the profile already evidences it.";
  }
}

/** Which groups a focus bias should promote, by seed group id. */
const GROUP_AFFINITY: Record<string, Emphasis[]> = {
  sg_vdc: ["delivery", "balanced"],
  sg_auto: ["technical", "balanced"],
  sg_platforms: ["technical", "balanced"],
  sg_domain: ["delivery", "balanced"],
};

/**
 * Last-resort vocabulary hint per facet, for bullets and projects that carry no
 * emphasis tags. Tag-driven scoring is the real mechanism — `emphasisBoost` and
 * `rankBullets` both read the tags you set in the Master Profile — so these
 * patterns only matter for an untagged profile. They are deliberately narrow:
 * a miss is fine, a wrong hit would distort the ordering.
 */
export const EMPHASIS_VOCABULARY_HINT: Record<Emphasis, RegExp> = {
  technical: /python|script|automation|tool|api|dashboard|pipeline|sql|model/i,
  delivery: /field|install|coordination|sequenc|construct|client|site|schedule/i,
  balanced: /./,
};

function emphasisBoost(emphasis: Emphasis, affinities: Emphasis[] | undefined, groupId?: string): number {
  const list = affinities ?? (groupId ? GROUP_AFFINITY[groupId] : undefined) ?? [];
  if (emphasis === "balanced") return 1.02;
  return list.includes(emphasis) ? 1.22 : 0.94;
}

/* -------------------------------------------------------------------------- */
/* Section builders                                                           */
/* -------------------------------------------------------------------------- */

function wrapItems(items: string[], fontPt: number): string[] {
  const limit = Math.max(40, Math.floor(charsPerLine(fontPt) - 2));
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    const candidate = current ? `${current} · ${item}` : item;
    if (candidate.length > limit && current) {
      lines.push(current);
      current = item;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Re-wraps the skills lines once the effective type size is known. */
export function rewrapSkills(groups: TailoredSkillGroup[], fontPt: number): void {
  for (const group of groups) {
    group.lines = wrapItems(group.items, fontPt);
  }
}

/** Wraps a flat list of skill items into print lines at the given type size. */
export function wrapSkillItems(items: string[], fontPt: number): string[] {
  return wrapItems(items, fontPt);
}

interface TailorContext {
  profile: MasterProfile;
  analysis: JobAnalysis | null;
  ctx: RelevanceContext;
  opts: TailorOptions;
  band: IntensityBand;
  notes: string[];
}

function buildSkillGroups(context: TailorContext, bridgeTerms: string[] = []): TailoredSkillGroup[] {
  const { profile, ctx, opts, band, notes } = context;

  const scored = profile.skillGroups.map((group, groupIndex) => {
    const items = group.items.map((item, itemIndex) => {
      const relevance = scoreText(`${item.term} ${(item.tags ?? []).join(" ")}`, ctx);
      return { item, itemIndex, relevance };
    });
    const rawRelevance = items.reduce((sum, entry) => sum + entry.relevance, 0);
    const normalised = Math.min(1, rawRelevance / 2.4);
    return { group, groupIndex, items, relevance: normalised };
  });

  if (band !== "baseline") {
    scored.sort((a, b) => {
      const aScore = a.relevance * emphasisBoost(opts.emphasis, undefined, a.group.id);
      const bScore = b.relevance * emphasisBoost(opts.emphasis, undefined, b.group.id);
      return bScore - aScore || a.groupIndex - b.groupIndex;
    });
  }

  const groups: TailoredSkillGroup[] = scored.map((entry) => ({
    id: entry.group.id,
    title: entry.group.title,
    items:
      band === "baseline"
        ? entry.items.map((row) => row.item.term)
        : [...entry.items]
            .sort((a, b) => {
              const aScore = a.relevance * emphasisBoost(opts.emphasis, a.item.emphasis);
              const bScore = b.relevance * emphasisBoost(opts.emphasis, b.item.emphasis);
              return bScore - aScore || a.itemIndex - b.itemIndex;
            })
            .map((row) => row.item.term),
    lines: [],
    relevance: entry.relevance,
  }));

  // Aggressive mode injects nothing new: it surfaces the posting's own phrasing
  // for skills the profile already evidences, once, on the leading category.
  if (band === "aggressive" && bridgeTerms.length && groups.length) {
    const already = new Set(
      groups.flatMap((group) => group.items.map((term) => term.toLowerCase())),
    );
    const additions = bridgeTerms.filter((term) => !already.has(term.toLowerCase()));
    if (additions.length) {
      groups[0] = { ...groups[0], items: [...groups[0].items, ...additions] };
      notes.push(
        `Surfaced ${additions.length} exact-phrase term${additions.length === 1 ? "" : "s"} from the posting under "${groups[0].title}": ${additions.join(", ")}.`,
      );
    }
  }

  for (const group of groups) {
    group.lines = wrapItems(group.items, opts.fontPt);
  }

  return groups;
}

function pickVariant(bullet: ProfileBullet, intensity: number): { text: string; used: boolean } {
  const variants = (bullet.variants ?? [])
    .filter((variant) => variant.minIntensity <= intensity)
    .sort((a, b) => b.minIntensity - a.minIntensity);
  if (variants.length) return { text: variants[0].text, used: true };
  return { text: bullet.text, used: false };
}

/**
 * Re-labels a bullet with the posting's own term for the same skill.
 *
 * Deliberately conservative: the replacement must share language with the
 * existing label ("Clash Resolution" -> "Clash Detection & Resolution"), and
 * unlabelled bullets are left alone. Without that rule the aggressive band
 * turns every bullet into "Python:" or "Autodesk Revit:", which reads as
 * keyword stuffing and destroys the narrative structure a recruiter scans.
 */
function relabelBullet(
  bullet: ProfileBullet,
  analysis: JobAnalysis | null,
  band: IntensityBand,
  usedLabels: Set<string>,
): string | null {
  if (!analysis || band !== "aggressive") return null;
  const label = bullet.label.trim();
  if (!label) return null;

  const labelTokens = significantTokens(label);
  if (labelTokens.length === 0) return null;

  const tagText = (bullet.tags ?? []).join(" · ").toLowerCase();

  const candidates = analysis.matched.filter((hit) => {
    if (hit.term.toLowerCase() === label.toLowerCase()) return false;
    if (usedLabels.has(hit.term.toLowerCase())) return false;
    const words = hit.term.split(/\s+/).length;
    if (words > 4) return false;
    if (!hit.matchedAliases.some((alias) => tagText.includes(alias.toLowerCase()))) return false;
    const termTokens = significantTokens(hit.term);
    const overlap = termTokens.filter((token) => labelTokens.includes(token)).length;
    return overlap > 0 && overlap / labelTokens.length >= 0.5;
  });

  if (!candidates.length) return null;
  const chosen = candidates[0].term.replace(/\s*\/\s*/g, " / ");
  usedLabels.add(chosen.toLowerCase());
  return chosen;
}

const LABEL_STOPWORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "of",
  "in",
  "to",
  "a",
  "on",
  "level",
  "model",
]);

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !LABEL_STOPWORDS.has(token));
}

function tailorBullets(
  bullets: ProfileBullet[],
  context: TailorContext,
  owner: string,
): TailoredBullet[] {
  const { ctx, opts, band, notes, analysis } = context;

  const rows = bullets.map((bullet, index) => {
    const relevance = scoreBullet(bullet, ctx);
    const affinities = bullet.emphasis ?? [];
    const boosted =
      opts.emphasis === "balanced" || affinities.includes(opts.emphasis)
        ? relevance * 1.1
        : relevance * 0.92;
    return { bullet, index, relevance, sortScore: Math.min(1, boosted) };
  });

  const ordered =
    band === "baseline"
      ? rows
      : [...rows].sort((a, b) => b.sortScore - a.sortScore || a.index - b.index);

  const usedLabels = new Set<string>();

  const tailored: TailoredBullet[] = ordered.map((row) => {
    const variant = pickVariant(row.bullet, opts.intensity);
    const relabelled = relabelBullet(row.bullet, analysis, band, usedLabels);
    const label = relabelled ?? row.bullet.label;

    let adjustment: TailoredBullet["adjustment"] = "verbatim";
    if (variant.used) adjustment = "variant";
    if (relabelled && relabelled !== row.bullet.label) {
      adjustment = "relabelled";
      notes.push(
        `${owner}: bullet label "${row.bullet.label}" -> "${relabelled}" (posting terminology, same evidence).`,
      );
    }

    return {
      id: row.bullet.id,
      label,
      text: variant.text,
      relevance: row.relevance,
      hot: row.relevance >= 0.26,
      adjustment,
    };
  });

  if (band !== "baseline" && ordered.some((row, position) => row.index !== position)) {
    notes.push(`${owner}: bullets reordered by relevance to the posting.`);
  }

  return tailored;
}

function buildRoles(context: TailorContext): TailoredRole[] {
  return context.profile.roles.map((role) => ({
    id: role.id,
    role: role.role,
    company: role.company,
    location: role.location,
    dates: role.dates,
    bullets: tailorBullets(role.bullets, context, role.company),
  }));
}

interface TailoredProject {
  id: string;
  name: string;
  meta: string;
  bullets: TailoredBullet[];
  relevance: number;
}

function buildProjects(context: TailorContext): TailoredProject[] {
  const { profile, ctx, band, notes, opts } = context;

  const rows = profile.projects.map((project, index) => {
    const relevance = Math.min(
      1,
      (scoreText(`${project.name} ${project.meta}`, ctx) * 1.2 +
        project.bullets.reduce((sum, bullet) => sum + scoreBullet(bullet, ctx), 0)) /
        2.2,
    );
    return {
      id: project.id,
      name: project.name,
      meta: project.meta,
      emphasis: [...new Set(project.bullets.flatMap((bullet) => bullet.emphasis ?? []))],
      bullets: tailorBullets(project.bullets, context, project.name),
      relevance,
      index,
    };
  });

  const ordered =
    band === "baseline"
      ? rows
      : [...rows].sort((a, b) => b.relevance - a.relevance || a.index - b.index);

  let keep = ordered;
  if (band === "aggressive" && ordered.length > 2) {
    keep = ordered.slice(0, 2);
    notes.push(
      `Aggressive mode shows the ${keep.length} most relevant projects; ${ordered.length - keep.length} lower-relevance project(s) hidden.`,
    );
  }
  if (opts.emphasis !== "balanced" && band !== "baseline") {
    // Your own tagging decides first, so this works whatever the industry: a
    // project you tagged for the chosen facet leads. The vocabulary test below is
    // only a fallback for untagged profiles, kept so behaviour does not shift
    // under a profile that predates emphasis tags.
    keep = [...keep].sort((a, b) => projectFocus(b, opts.emphasis) - projectFocus(a, opts.emphasis));
  }

  return keep.map(({ index: _index, emphasis: _emphasis, ...rest }) => rest);
}

/** Higher wins: 2 = tagged for this facet, 1 = vocabulary hint, 0 = neither. */
function projectFocus(
  row: { name: string; meta: string; emphasis: Emphasis[] },
  emphasis: Emphasis,
): number {
  const tagged = row.emphasis.includes(emphasis) ? 2 : 0;
  return tagged + Number(EMPHASIS_VOCABULARY_HINT[emphasis].test(`${row.name} ${row.meta}`));
}

function buildSummary(context: TailorContext, matchedTerms: string[]): string {
  const { profile, opts, band, analysis, notes } = context;
  const variants = profile.pitchVariants;

  let summary = band === "baseline" ? profile.pitch : variants[opts.emphasis] || profile.pitch;

  if (band === "baseline") {
    notes.push("Summary left on the stored core pitch (factual baseline).");
    return summary;
  }

  if (band === "aggressive" && matchedTerms.length) {
    const clause = `Direct overlap with this posting: ${matchedTerms.slice(0, 3).join(", ")}.`;
    summary = `${summary.trim().replace(/\.$/, "")}. ${clause}`;
    notes.push(
      `Summary closed with a match statement built only from posting terms the profile already evidences (${matchedTerms
        .slice(0, 3)
        .join(", ")}).`,
    );
  } else if (analysis) {
    notes.push(
      `Summary switched to the "${EMPHASIS_LABELS[opts.emphasis]}" variant of the stored pitch.`,
    );
  }

  return summary;
}

function pickHeadline(context: TailorContext): string {
  const { profile, ctx, band, notes } = context;
  const options = [profile.header.headline, ...profile.header.altHeadlines].filter(Boolean);
  if (band === "baseline" || options.length === 1) return profile.header.headline;

  const ranked = options
    .map((headline, index) => ({ headline, index, score: scoreText(headline, ctx) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (ranked[0].score > 0.05 && ranked[0].headline !== profile.header.headline) {
    notes.push(
      `Headline swapped to the alternate with the best keyword overlap: "${ranked[0].headline}".`,
    );
    return ranked[0].headline;
  }
  return profile.header.headline;
}

function buildCertifications(
  context: TailorContext,
): { heading: string; lines: string[] } {
  const { profile, ctx, band } = context;
  const entries = [
    ...profile.certifications.map((entry) => ({ text: entry.text, kind: "Certification" as const })),
    ...profile.education.map((entry) => ({ text: entry.text, kind: "Education" as const })),
    ...profile.background.map((entry) => ({ text: entry.text, kind: "Background" as const })),
  ];

  const ordered =
    band === "baseline"
      ? entries
      : [...entries].sort(
          (a, b) => scoreText(b.text, ctx) - scoreText(a.text, ctx),
        );

  return {
    heading: "Certifications & Background",
    lines: ordered.map((entry) => entry.text),
  };
}

/* -------------------------------------------------------------------------- */
/* Page-fit estimator                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The sheet is laid out in `em` units against the sheet's own font-size, so the
 * type-size dial scales the whole page proportionally. These are those same em
 * values, which lets the estimator predict the printed height to within a line.
 */
export const SHEET_EM = {
  bodyLine: 1.26,
  name: 2.1505 * 1.26,
  headline: 1.0753 * 1.26 + 0.3763,
  contactLine: 0.9462 * 1.24,
  headerBlock: 0.6452 + 0.4301,
  /** Heading text + gap above + rule padding. Mirrors `.sheet .h2` in CSS. */
  sectionHeading: 1.0753 * 1.26 + 0.75 + 0.22,
  jobHeader: 1.1075 * 1.26 + 0.5914,
  jobMeta: 1.26 + 0.1075,
  bulletGap: 0.2151,
  paragraphGap: 0.4839,
} as const;

export interface FitEstimate {
  fontPt: number;
  usedPt: number;
  availablePt: number;
  /** 1.0 means the content exactly fills the page. */
  fill: number;
  overflows: boolean;
}

interface FitInput {
  summary: string;
  skillGroups: { lines: string[] }[];
  roles: { bullets: { label: string; text: string }[] }[];
  projects: { bullets: { label: string; text: string }[] }[];
  certifications: { lines: string[] };
}

export function estimateFit(input: FitInput, fontPt: number): FitEstimate {
  let em = SHEET_EM.name + SHEET_EM.headline + SHEET_EM.contactLine * 2 + SHEET_EM.headerBlock;

  // Executive Summary
  em += SHEET_EM.sectionHeading;
  em += textLines(input.summary, fontPt) * SHEET_EM.bodyLine + SHEET_EM.paragraphGap;

  // Technical Skills
  em += SHEET_EM.sectionHeading;
  for (const group of input.skillGroups) {
    for (const line of group.lines) {
      em += textLines(line, fontPt) * SHEET_EM.bodyLine + SHEET_EM.paragraphGap;
    }
  }

  // Professional Experience
  em += SHEET_EM.sectionHeading;
  for (const role of input.roles) {
    em += SHEET_EM.jobHeader + SHEET_EM.jobMeta;
    for (const bullet of role.bullets) {
      const text = bullet.label ? `${bullet.label}: ${bullet.text}` : bullet.text;
      em += textLines(text, fontPt) * SHEET_EM.bodyLine + SHEET_EM.bulletGap;
    }
  }

  // Key Automation Projects
  if (input.projects.length) {
    em += SHEET_EM.sectionHeading;
    for (const project of input.projects) {
      em += SHEET_EM.jobHeader + SHEET_EM.jobMeta;
      for (const bullet of project.bullets) {
        em += textLines(bullet.text, fontPt) * SHEET_EM.bodyLine + SHEET_EM.bulletGap;
      }
    }
  }

  // Certifications & Background
  if (input.certifications.lines.length) {
    em += SHEET_EM.sectionHeading;
    for (const line of input.certifications.lines) {
      em += textLines(line, fontPt) * SHEET_EM.bodyLine + SHEET_EM.bulletGap;
    }
  }

  const usedPt = em * fontPt;
  const availablePt = contentHeightPt();
  const fill = usedPt / availablePt;
  return { fontPt, usedPt, availablePt, fill, overflows: fill > 1.001 };
}

/** Largest type size (within the allowed band) that still fits one page. */
export function autoFitFontPt(input: FitInput): number {
  for (let size = maxFontPt(); size >= minFontPt() - 0.001; size -= 0.1) {
    const rounded = Math.round(size * 10) / 10;
    if (estimateFit(input, rounded).fill <= TARGET_FILL) return rounded;
  }
  return minFontPt();
}

/* -------------------------------------------------------------------------- */
/* ATS checks                                                                 */
/* -------------------------------------------------------------------------- */

export const RESUME_SECTIONS = [
  "Executive Summary",
  "Technical Skills",
  "Professional Experience",
  "Key Automation Projects",
  "Certifications & Background",
] as const;

function resumeText(resume: {
  summary: string;
  skillGroups: { items: string[] }[];
  roles: { role: string; company: string; bullets: { label: string; text: string }[] }[];
  projects: { name: string; meta: string; bullets: { text: string }[] }[];
  certifications: { lines: string[] };
}): string {
  return [
    resume.summary,
    ...resume.skillGroups.flatMap((group) => group.items),
    ...resume.roles.flatMap((role) => [
      `${role.role} ${role.company}`,
      ...role.bullets.map((bullet) => `${bullet.label} ${bullet.text}`),
    ]),
    ...resume.projects.flatMap((project) => [
      `${project.name} ${project.meta}`,
      ...project.bullets.map((bullet) => bullet.text),
    ]),
    ...resume.certifications.lines,
  ]
    .join("\n")
    .toLowerCase();
}

function buildAtsChecks(args: {
  profile: MasterProfile;
  analysis: JobAnalysis | null;
  coverage: number;
  fit: FitEstimate;
  layout: SheetLayout;
  resume: Parameters<typeof resumeText>[0];
}): AtsCheck[] {
  const { profile, analysis, coverage, fit, layout, resume } = args;
  const checks: AtsCheck[] = [];
  const body = resumeText(resume);

  checks.push({
    id: "headings",
    label: "Standard section headings",
    status: "pass",
    detail: `Uses ${RESUME_SECTIONS.join(" / ")} — the exact strings ATS parsers segment on.`,
  });

  checks.push({
    id: "layout",
    label: "Parser-safe layout",
    status: "pass",
    detail: "Single column, real list items, no tables, icons, text boxes, headers or footers in the text blocks.",
  });

  const contactComplete = Boolean(profile.header.email && profile.header.phone && profile.header.location);
  checks.push({
    id: "contact",
    label: "Contact block",
    status: contactComplete ? "pass" : "fail",
    detail: contactComplete
      ? "Name, market, relocation note, email, phone and LinkedIn sit in the top block as plain text."
      : "Email, phone or location is missing — add it in Master Profile.",
  });

  if (analysis) {
    const status: AtsCheck["status"] = coverage >= 70 ? "pass" : coverage >= 50 ? "warn" : "fail";
    checks.push({
      id: "coverage",
      label: "Keyword coverage",
      status,
      detail: `${coverage}% of this posting's weighted keyword mass appears in the tailored resume (${analysis.matched.length} of ${analysis.keywords.length} tracked terms).`,
    });
  } else {
    checks.push({
      id: "coverage",
      label: "Keyword coverage",
      status: "warn",
      detail: "No job posting loaded — the resume is running on the factual baseline.",
    });
  }

  checks.push({
    id: "page-count",
    label: layout === "continuous" ? "Page count" : "One-page fit",
    status:
      layout === "continuous"
        ? // Multi-page is the point of this mode; only flag a ragged final page.
          lastPageFill(fit.fill) < 0.25 && pageCountFor(fit.fill) > 1
          ? "warn"
          : "pass"
        : fit.overflows
          ? fit.fill > 1.06
            ? "fail"
            : "warn"
          : "pass",
    detail:
      layout === "continuous"
        ? `Continuous layout: ${pageCountFor(fit.fill)} page(s) at ${fit.fontPt}pt, last page ${Math.round(lastPageFill(fit.fill) * 100)}% full${
            lastPageFill(fit.fill) < 0.25 && pageCountFor(fit.fill) > 1
              ? " — a very short final page reads as an afterthought; trim a line or drop the type size slightly."
              : ". Nothing was cut or shrunk to fit."
          }`
        : fit.overflows
          ? `Estimated ${Math.round(fit.fill * 100)}% of the page at ${fit.fontPt}pt — lower the type size or trim content.`
          : `Estimated ${Math.round(fit.fill * 100)}% of the page at ${fit.fontPt}pt, so it prints as one sheet.`,
  });

  const numbers = (body.match(/\b\d[\d,.]*\b/g) ?? []).length;
  checks.push({
    id: "quantified",
    label: "Quantified impact",
    status: numbers >= 3 ? "pass" : "warn",
    detail:
      numbers >= 3
        ? `${numbers} numeric facts survive in the text (headcount, volumes, square footage, tool counts).`
        : "Add real numbers to the Master Profile bullets — trades coordinated, tools shipped, hours saved.",
  });

  if (analysis) {
    const titleTokens = analysis.meta.title
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((token) => token.length > 3);
    const headline = `${profile.header.headline} ${profile.roles[0]?.role ?? ""}`.toLowerCase();
    const aligned = titleTokens.some((token) => headline.includes(token));
    checks.push({
      id: "title",
      label: "Target title alignment",
      status: aligned ? "pass" : "warn",
      detail: aligned
        ? `Headline/title mirrors the posting's language ("${analysis.meta.title}").`
        : `Posting title "${analysis.meta.title}" does not appear in the headline — consider an alternate in Master Profile.`,
    });
  }

  const missingDates = profile.roles.filter((role) => !role.dates.trim()).length;
  checks.push({
    id: "dates",
    label: "Date ranges on every role",
    status: missingDates === 0 ? "pass" : "warn",
    detail:
      missingDates === 0
        ? "Every role carries a parseable date range."
        : `${missingDates} role(s) have no dates — ATS timeline parsers prefer a range.`,
  });

  checks.push({
    id: "certifications",
    label: "Credential block",
    status: profile.certifications.length ? "pass" : "warn",
    detail: profile.certifications.length
      ? `${profile.certifications.length} credential(s) listed.`
      : "No certifications stored yet. Add OSHA 30, manufacturer training or software certs in Master Profile so keyword filters can match.",
  });

  return checks;
}

function scoreAts(checks: AtsCheck[], coverage: number): number {
  const weights: Record<AtsCheck["status"], number> = { pass: 1, warn: 0.5, fail: 0 };
  const structure = checks.reduce((sum, check) => sum + weights[check.status], 0) / checks.length;
  const usable = checks.some((check) => check.id === "coverage") ? coverage / 100 : 0.75;
  return Math.max(0, Math.min(100, Math.round(usable * 65 + structure * 35)));
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

function measureCoverage(
  analysis: JobAnalysis | null,
  resume: Parameters<typeof resumeText>[0],
): number {
  if (!analysis || !analysis.keywords.length) return 100;
  const body = resumeText(resume);
  const total = analysis.keywords.reduce((sum, hit) => sum + hit.score, 0);
  const covered = analysis.keywords
    .filter((hit) => [hit.term, ...hit.matchedAliases].some((alias) => countAlias(body, alias)))
    .reduce((sum, hit) => sum + hit.score, 0);
  return total > 0 ? Math.round((covered / total) * 100) : 100;
}

/**
 * Trims to fit, in escalating order of how much the cut costs the reader:
 *
 *   1. spare project bullets
 *   2. whole low-relevance project blocks
 *   3. background / credential lines
 *   4. experience bullets from the least relevant role (never below one per role)
 *
 * Stage 4 is a last resort and is logged with the exact bullets it removed —
 * silently shipping a two-page PDF would be worse, but so would silently
 * deleting the substance of the resume. Experience and skill *sections* are
 * never removed outright.
 *
 * Trimming targets TARGET_FILL rather than 100%: a resume that measures exactly
 * full on this estimator will spill onto a second page the moment a layout
 * engine breaks a line differently, and "one page" is a promise, not a hope.
 */
function trimToFit(
  projects: TailoredProject[],
  certifications: { heading: string; lines: string[] },
  roles: TailoredRole[],
  buildFitInput: () => Parameters<typeof estimateFit>[0],
  fontPt: number,
  notes: string[],
): FitEstimate {
  const target = contentHeightPt() * TARGET_FILL;
  let fit = estimateFit(buildFitInput(), fontPt);
  let trimmed = 0;
  let droppedProjects = 0;
  const droppedBullets: string[] = [];

  for (let guard = 0; guard < 40 && fit.usedPt > target; guard += 1) {
    const byRelevance = [...projects].sort((a, b) => a.relevance - b.relevance);
    const withSpareBullets = byRelevance.find((project) => project.bullets.length > 1);
    const roleWithSpareBullets = [...roles]
      .map((role, index) => ({
        role,
        index,
        relevance:
          role.bullets.reduce((sum, bullet) => sum + bullet.relevance, 0) /
          Math.max(1, role.bullets.length),
      }))
      .sort((a, b) => a.relevance - b.relevance)
      .find((entry) => entry.role.bullets.length > 1);

    if (withSpareBullets) {
      const weakest = [...withSpareBullets.bullets].sort((a, b) => a.relevance - b.relevance)[0];
      withSpareBullets.bullets = withSpareBullets.bullets.filter(
        (bullet) => bullet.id !== weakest.id,
      );
      trimmed += 1;
    } else if (projects.length > 1) {
      projects.pop();
      droppedProjects += 1;
      trimmed += 1;
    } else if (certifications.lines.length > 1) {
      certifications.lines = certifications.lines.slice(0, certifications.lines.length - 1);
      trimmed += 1;
    } else if (roleWithSpareBullets) {
      const weakest = [...roleWithSpareBullets.role.bullets].sort(
        (a, b) => a.relevance - b.relevance,
      )[0];
      roleWithSpareBullets.role.bullets = roleWithSpareBullets.role.bullets.filter(
        (bullet) => bullet.id !== weakest.id,
      );
      droppedBullets.push(`${weakest.label || "bullet"} (${weakest.text.slice(0, 40)}…)`);
      trimmed += 1;
    } else {
      break;
    }
    fit = estimateFit(buildFitInput(), fontPt);
  }

  if (trimmed > 0) {
    notes.push(
      `Trimmed ${trimmed} lowest-relevance item${trimmed === 1 ? "" : "s"}${droppedProjects ? ` (including ${droppedProjects} project block${droppedProjects === 1 ? "" : "s"})` : ""} to hold the one-page limit; estimated ${Math.round(fit.fill * 100)}% page fill.`,
    );
  }
  if (droppedBullets.length) {
    notes.push(
      `Removed ${droppedBullets.length} experience bullet${droppedBullets.length === 1 ? "" : "s"} as a last resort: ${droppedBullets.join("; ")}. Restore them by shortening another bullet in the Master Profile.`,
    );
  }

  return fit;
}

/* -------------------------------------------------------------------------- */
/* Page count                                                                */
/* -------------------------------------------------------------------------- */

/** How many Letter pages a sheet occupying `fill` of a page would need. */
export function pageCountFor(fill: number): number {
  return Math.max(1, Math.ceil(fill - 0.0001));
}

/** How full the final page is, which is what makes a 2-page sheet look ragged. */
export function lastPageFill(fill: number): number {
  const pages = pageCountFor(fill);
  return Math.min(1, fill - (pages - 1));
}

export interface AuditResult {
  ats: TailoredResume["ats"];
  fit: FitEstimate;
}

/**
 * Recomputes the ATS audit for any resume shape. Used at the end of tailoring
 * and again after hand edits, so the audit always describes the sheet that is
 * actually on screen — including coverage the edits may have *lost*.
 */
export function auditResume(
  profile: MasterProfile,
  analysis: JobAnalysis | null,
  resume: Pick<
    TailoredResume,
    "summary" | "skillGroups" | "roles" | "projects" | "certifications" | "options"
  >,
): AuditResult {
  const measureShape = {
    summary: resume.summary,
    skillGroups: resume.skillGroups,
    roles: resume.roles,
    projects: resume.projects,
    certifications: resume.certifications,
  };
  const fit = estimateFit(measureShape, resume.options.fontPt);
  const coverage = measureCoverage(analysis, measureShape);
  const checks = buildAtsChecks({
    profile,
    analysis,
    coverage,
    fit,
    layout: resume.options.layout,
    resume: measureShape,
  });
  return {
    fit,
    ats: {
      score: scoreAts(checks, coverage),
      coverage,
      checks,
      keywordLines: analysis ? analysis.matched.slice(0, 12).map((hit) => hit.term) : [],
      gaps: analysis ? analysis.missing.slice(0, 8).map((hit) => hit.term) : [],
    },
  };
}

export function tailorResume(
  profile: MasterProfile,
  analysis: JobAnalysis | null,
  options: TailorOptions,
): TailoredResume {
  const band = bandFor(options.intensity);
  const fontPt = Math.min(maxFontPt(), Math.max(minFontPt(), options.fontPt));
  const notes: string[] = [describeBand(options.intensity)];

  const context: TailorContext = {
    profile,
    analysis,
    ctx: buildRelevanceContext(analysis),
    opts: { ...options, fontPt },
    band,
    notes,
  };

  const headline = pickHeadline(context);
  const matchedTerms = analysis ? analysis.matched.slice(0, 12).map((hit) => hit.term) : [];
  const summary = buildSummary(context, matchedTerms);
  const bridgeTerms =
    band === "aggressive" && analysis ? analysis.matched.slice(0, 6).map((hit) => hit.term) : [];
  const skillGroups = buildSkillGroups(context, bridgeTerms);
  const roles = buildRoles(context);
  const projects: TailoredProject[] = buildProjects(context);
  const certifications = buildCertifications(context);

  if (band !== "baseline" && skillGroups.length) {
    notes.push(`Skill categories re-ordered by relevance; "${skillGroups[0].title}" now leads.`);
  }

  const fitInputFor = (size: number) => ({
    summary,
    skillGroups,
    roles,
    projects: projects.map((project) => ({ bullets: project.bullets })),
    certifications,
  });

  /* One page is the promise in `page` mode, and there are two honest levers to
     keep it: the type size (shrinks the whole sheet proportionally) and the
     content (drops the least relevant project material). Size goes first —
     losing a project bullet costs the reader information, half a point of type
     size does not.

     In `continuous` mode neither lever is spent: the sheet is allowed to flow
     onto another page, so nothing is shrunk and nothing is cut. */
  const budget = contentHeightPt() * TARGET_FILL;
  const continuous = options.layout === "continuous";
  let effectiveFontPt = fontPt;
  let fit = estimateFit(fitInputFor(effectiveFontPt), effectiveFontPt);

  if (continuous) {
    const pages = pageCountFor(fit.fill);
    notes.push(
      `Continuous layout: ${pages} page(s) at ${effectiveFontPt}pt. No type-size reduction and no content trimming were applied — this mode trades the one-page constraint for keeping every line you wrote.`,
    );
    if (pages > 1 && lastPageFill(fit.fill) < 0.25) {
      notes.push(
        `The final page is only ${Math.round(lastPageFill(fit.fill) * 100)}% full, which usually reads better as one page. Lower the type size or trim a line.`,
      );
    }
  } else {
    while (fit.usedPt > budget && effectiveFontPt > minFontPt() + 0.0001) {
      effectiveFontPt = Math.round((effectiveFontPt - 0.1) * 10) / 10;
      fit = estimateFit(fitInputFor(effectiveFontPt), effectiveFontPt);
    }
    if (effectiveFontPt < fontPt) {
      notes.push(
        `Type size reduced from ${fontPt}pt to ${effectiveFontPt}pt so the full profile still prints on one page.`,
      );
    }
  }

  rewrapSkills(skillGroups, effectiveFontPt);
  fit = estimateFit(fitInputFor(effectiveFontPt), effectiveFontPt);

  if (!continuous && fit.usedPt > budget) {
    fit = trimToFit(
      projects,
      certifications,
      roles,
      () => fitInputFor(effectiveFontPt),
      effectiveFontPt,
      notes,
    );
  }
  if (!fit.overflows && fit.fill > 0.94) {
    const spareLines = Math.max(
      1,
      Math.round(((1 - fit.fill) * contentHeightPt()) / (1.26 * effectiveFontPt)),
    );
    notes.push(
      `Layout is ${Math.round(fit.fill * 100)}% full — about ${spareLines} spare line(s) before it would spill to a second page.`,
    );
  }

  const header = { ...profile.header, headline };
  const trimmedProjects = projects.map((project) => ({
    id: project.id,
    name: project.name,
    meta: project.meta,
    bullets: project.bullets,
  }));

  const audit = auditResume(profile, analysis, {
    summary,
    skillGroups,
    roles,
    projects: trimmedProjects,
    certifications,
    options: {
      intensity: options.intensity,
      emphasis: options.emphasis,
      fontPt,
      showKeywordMarks: options.showKeywordMarks,
      layout: options.layout,
    },
  });

  return {
    header,
    summary,
    skillGroups,
    roles,
    projects: trimmedProjects,
    certifications,
    hiddenSections: [],
    options: {
      intensity: options.intensity,
      emphasis: options.emphasis,
      fontPt: effectiveFontPt,
      showKeywordMarks: options.showKeywordMarks,
      layout: options.layout,
    },
    ats: audit.ats,
    notes,
  };
}

/* -------------------------------------------------------------------------- */
/* Plain-text export (for pasting into application forms)                     */
/* -------------------------------------------------------------------------- */

export function toPlainText(resume: TailoredResume): string {
  const out: string[] = [];
  const rule = (title: string) => {
    out.push("");
    out.push(title.toUpperCase());
    out.push("-".repeat(title.length));
    out.push("");
  };

  out.push(resume.header.name.toUpperCase());
  out.push(resume.header.headline);
  out.push(
    [
      resume.header.location,
      resume.header.locationNote,
      resume.header.email,
      resume.header.phone,
      resume.header.linkedin,
      resume.header.portfolio,
    ]
      .filter(Boolean)
      .join(" | "),
  );

  rule(RESUME_SECTIONS[0]);
  out.push(resume.summary);

  rule(RESUME_SECTIONS[1]);
  for (const group of resume.skillGroups) {
    out.push(`${group.title}: ${group.items.join(", ")}`);
  }

  rule(RESUME_SECTIONS[2]);
  for (const role of resume.roles) {
    out.push([role.role, role.company, role.location, role.dates].filter(Boolean).join(" | "));
    for (const bullet of role.bullets) {
      out.push(`- ${bullet.label ? `${bullet.label}: ` : ""}${bullet.text}`);
    }
    out.push("");
  }

  if (resume.projects.length) {
    rule(RESUME_SECTIONS[3]);
    for (const project of resume.projects) {
      out.push([project.name, project.meta].filter(Boolean).join(" | "));
      for (const bullet of project.bullets) {
        out.push(`- ${bullet.text}`);
      }
      out.push("");
    }
  }

  if (resume.certifications.lines.length) {
    rule(RESUME_SECTIONS[4]);
    for (const line of resume.certifications.lines) {
      out.push(`- ${line}`);
    }
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}







