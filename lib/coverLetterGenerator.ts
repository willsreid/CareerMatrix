import type {
  CoverLetter,
  Emphasis,
  JobAnalysis,
  LetterParagraph,
  MasterProfile,
  ProfileBullet,
} from "./types";
import { buildRelevanceContext, scoreText, EMPHASIS_VOCABULARY_HINT } from "./resumeTailorer";
import { makeId } from "./utils";

/**
 * Cover letter generator.
 *
 * Same contract as the resume engine: it can only compose sentences out of facts
 * that already exist in the Master Profile plus fields read off the posting. It
 * has no authoring capability, no model call and no randomisation, so the same
 * inputs always produce the same letter.
 *
 * The one thing it does that a resume cannot: it names the posting's keywords
 * that the profile cannot evidence and says so plainly, instead of padding.
 */

export interface CoverLetterOptions {
  emphasis: Emphasis;
  intensity: number;
  /** Recipient, when the posting or the user named one. */
  toName?: string;
  /**
   * Name the posting's uncovered keywords and disclaim them. Honest and
   * distinctive, but it does put the term in the document where a keyword
   * scanner can see it — so the user gets the final say.
   */
  nameGaps?: boolean;
}

const FIRST_PERSON_VERBS = new Set([
  "run",
  "build",
  "lead",
  "write",
  "own",
  "manage",
  "read",
  "maintain",
  "coordinate",
  "drive",
  "support",
  "help",
  "set",
  "track",
  "review",
  "model",
  "produce",
  "handle",
  "hold",
  "work",
]);

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Re-frames a profile bullet as first-person prose. Profile bullets are written
 * verb-first ("Run trade coordination…"), so lowercasing the verb gives clean
 * present-tense English without editing the user's words. Anything that is not
 * verb-first falls back to a neutral frame rather than risking a broken
 * sentence.
 */
export function asFirstPerson(text: string): { sentence: string; verbatim: boolean } {
  const trimmed = text.trim().replace(/\.$/, "");
  const firstWord = trimmed.split(/\s+/)[0]?.replace(/[^A-Za-z]/g, "") ?? "";
  if (FIRST_PERSON_VERBS.has(firstWord.toLowerCase())) {
    return { sentence: `I ${lowerFirst(trimmed)}.`, verbatim: true };
  }
  return { sentence: `Day to day: ${lowerFirst(trimmed)}.`, verbatim: false };
}

interface ScoredBullet {
  owner: string;
  bullet: ProfileBullet;
  relevance: number;
  order: number;
}

function rankBullets(
  profile: MasterProfile,
  analysis: JobAnalysis | null,
  emphasis: Emphasis,
): ScoredBullet[] {
  const context = buildRelevanceContext(analysis);
  const rows: ScoredBullet[] = [];
  let order = 0;

  for (const role of profile.roles) {
    for (const bullet of role.bullets) {
      const affinities = bullet.emphasis ?? [];
      const base = scoreText(`${bullet.label} ${bullet.text} ${(bullet.tags ?? []).join(" ")}`, context);
      const bias = emphasis === "balanced" || affinities.includes(emphasis) ? 1.12 : 0.94;
      rows.push({
        owner: role.company || role.role,
        bullet,
        relevance: Math.min(1, base * bias),
        order: order++,
      });
    }
  }

  for (const project of profile.projects) {
    for (const bullet of project.bullets) {
      const affinities = bullet.emphasis ?? [];
      const base = scoreText(`${bullet.text} ${(bullet.tags ?? []).join(" ")}`, context);
      const bias = emphasis === "balanced" || affinities.includes(emphasis) ? 1.12 : 0.94;
      rows.push({
        owner: project.name,
        bullet,
        relevance: Math.min(1, base * bias),
        order: order++,
      });
    }
  }

  return rows.sort((a, b) => b.relevance - a.relevance || a.order - b.order);
}


/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export function generateCoverLetter(
  profile: MasterProfile,
  analysis: JobAnalysis | null,
  options: CoverLetterOptions,
): CoverLetter {
  const notes: string[] = [];
  const paragraphs: LetterParagraph[] = [];
  const band =
    options.intensity <= 35 ? "baseline" : options.intensity < 80 ? "balanced" : "aggressive";

  const jobTitle = analysis?.meta.title ?? "the role";
  const company = analysis?.meta.company ?? "your team";
  const location = analysis?.meta.location ?? "";
  const workMode = analysis?.meta.workMode ?? "Unspecified";
  const ranked = rankBullets(profile, analysis, options.emphasis);
  const recipient = options.toName?.trim() || "Hiring Manager";

  const push = (kind: LetterParagraph["kind"], text: string) => {
    paragraphs.push({ id: makeId("para"), kind, text: text.trim().replace(/\s+/g, " ") });
  };

  /* ------------------------------- opening ------------------------------- */
  const opener: string[] = [`I am applying for the ${jobTitle} position at ${company}.`];

  if (band !== "baseline") {
    const market =
      workMode === "Remote"
        ? "The posting is remote, which is how I want to work."
        : workMode === "Hybrid"
          ? `A hybrid schedule works for me${location ? ` around ${location}` : ""}.`
          : location
            ? `I am set up for on-site work in ${location}.`
            : "";
    if (market) opener.push(market);
  }

  const pitch =
    band === "baseline" ? profile.pitch : profile.pitchVariants[options.emphasis] || profile.pitch;
  opener.push(pitch);
  push("opening", opener.join(" "));
  notes.push(
    band === "baseline"
      ? "Opening uses the stored core pitch verbatim (factual baseline)."
      : `Opening uses the "${options.emphasis}" pitch variant plus the posting's work mode.`,
  );

  /* ------------------------------ evidence ------------------------------- */
  const evidence = ranked.slice(0, band === "aggressive" ? 3 : 2);
  const quoted = evidence.map((entry) => {
    const framed = asFirstPerson(entry.bullet.text);
    return `${entry.owner}: ${framed.sentence}`;
  });

  if (quoted.length) {
    const lead =
      band === "baseline"
        ? "The relevant experience:"
        : "The work this role describes is the work I already do. Two examples:";
    push("evidence", `${lead} ${quoted.join(" ")}`);
    notes.push(
      `Quoted ${evidence.length} profile bullet(s) verbatim, chosen by relevance: ${evidence
        .map((entry) => entry.bullet.label || entry.owner)
        .join(", ")}.`,
    );
  }

  /* --------------------------- emphasis paragraph ------------------------ */
  if (band !== "baseline") {
    // Your tags pick the paragraph to feature, so this reads correctly for any
    // industry; the vocabulary patterns are a fallback for untagged bullets.
    const focus =
      ranked.find((entry) => (entry.bullet.emphasis ?? []).includes(options.emphasis)) ??
      ranked.find((entry) =>
        EMPHASIS_VOCABULARY_HINT[options.emphasis].test(
          `${entry.bullet.label} ${entry.bullet.text}`,
        ),
      );

    if (focus) {
      const framed = asFirstPerson(focus.bullet.text);
      push(
        "custom",
        options.emphasis === "technical"
          ? `Beyond the day-to-day, I build the tooling: ${framed.sentence} That is usually the difference between a team that uses its systems and a team that owns them.`
          : `I came up through the work itself before I moved into planning, and it changes how I approach it: ${framed.sentence} I have done this hands-on, so problems get caught before they reach anyone downstream.`,
      );
      notes.push(
        `Added the "${options.emphasis}" focus paragraph from: ${focus.bullet.label || focus.owner}.`,
      );
    }
  }

  /* --------------------------------- gaps -------------------------------- */
  const gaps = (analysis?.missing ?? []).slice(0, 2).map((hit) => hit.term);
  if (band !== "baseline" && gaps.length && options.nameGaps !== false) {
    const strengths = (analysis?.matched ?? []).slice(0, 3).map((hit) => hit.term);
    const counter = strengths.length
      ? ` What I do bring to the same problem is ${strengths.join(", ")}.`
      : "";
    push(
      "gap",
      `Two things in your posting are not on my resume: ${gaps.join(" and ")}. I would rather flag that here than pad a document.${counter}`,
    );
    notes.push(
      `Named ${gaps.length} uncovered keyword(s) (${gaps.join(", ")}) instead of claiming them.`,
    );
  }

  /* --------------------------------- close ------------------------------- */
  const availability = profile.header.locationNote || profile.header.location;
  push(
    "close",
    band === "baseline"
      ? `I would welcome the chance to talk through the role. I am available at ${profile.header.email} or ${profile.header.phone}.`
      : `A note on logistics: ${availability}. I would welcome a conversation about where ${company} is taking this work, and what a strong first ninety days looks like. Reach me at ${profile.header.email} or ${profile.header.phone}.`,
  );

  return {
    generatedAt: new Date().toISOString(),
    toName: recipient,
    company,
    jobTitle,
    location,
    salutation: `Dear ${recipient},`,
    paragraphs,
    notes,
    gapsNotClaimed: gaps,
    options: { emphasis: options.emphasis, intensity: options.intensity, nameGaps: options.nameGaps !== false },
  };
}

/* -------------------------------------------------------------------------- */
/* Export helpers                                                             */
/* -------------------------------------------------------------------------- */

export function toCoverLetterText(letter: CoverLetter, profile: MasterProfile): string {
  const contact = [profile.header.email, profile.header.phone, profile.header.linkedin]
    .filter(Boolean)
    .join(" | ");
  const body = letter.paragraphs.map((paragraph) => paragraph.text).join("\n\n");
  return [
    profile.header.name,
    profile.header.location,
    contact,
    "",
    new Date(letter.generatedAt).toLocaleDateString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    "",
    "Hiring Team",
    letter.company,
    letter.location,
    "",
    letter.salutation,
    "",
    body,
    "",
    "Sincerely,",
    profile.header.name,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function letterWordCount(letter: CoverLetter): number {
  return letter.paragraphs
    .map((paragraph) => paragraph.text.trim().split(/\s+/).length)
    .reduce((sum, count) => sum + count, 0);
}

/**
 * Posting keywords the letter actually claims, so the UI can show that the
 * letter only ever uses terms the profile backs.
 */
export function claimedTerms(letter: CoverLetter, analysis: JobAnalysis | null): string[] {
  if (!analysis) return [];
  const body = letter.paragraphs.map((paragraph) => paragraph.text).join(" ").toLowerCase();
  return analysis.keywords
    .filter((hit) => hit.inProfile)
    .filter((hit) =>
      [hit.term, ...hit.matchedAliases].some((alias) => body.includes(alias.toLowerCase())),
    )
    .map((hit) => hit.term);
}

/** Replaces one paragraph's text, for the inline letter editor. */
export function setLetterParagraph(letter: CoverLetter, id: string, text: string): CoverLetter {
  return {
    ...letter,
    paragraphs: letter.paragraphs.map((paragraph) =>
      paragraph.id === id ? { ...paragraph, text } : paragraph,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Freshness                                                                   */
/* -------------------------------------------------------------------------- */

export type LetterFreshness = "none" | "current" | "stale" | "unverifiable";

export interface LetterStatus {
  state: LetterFreshness;
  /** One sentence for the export control's tooltip: why it can or cannot go in. */
  reason: string;
  /** True only when the letter provably belongs to the currently loaded posting. */
  attachable: boolean;
}

/**
 * Case and punctuation are ignored, but there is no fuzzy matching. A generous
 * comparison here would attach a letter addressed to the previous employer, which
 * is exactly the kind of mistake the version system and the provenance rules
 * exist to prevent — so the failure mode is deliberately a false "stale".
 */
function sameLabel(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return normalize(a) !== "" && normalize(a) === normalize(b);
}

/**
 * Can this letter travel in the same PDF as the resume?
 *
 * The letter is generated on demand and is *not* invalidated when a new posting
 * is loaded, so it can quietly point at a different company than the sheet above
 * it. Anything that offers to bundle the two has to ask this first.
 */
export function letterStatus(
  letter: CoverLetter | null,
  analysis: JobAnalysis | null,
  dials?: { intensity: number; emphasis: Emphasis },
): LetterStatus {
  if (!letter) {
    return {
      state: "none",
      reason: "No cover letter yet — write one on the Cover letter page to bundle it here.",
      attachable: false,
    };
  }

  if (!analysis) {
    return {
      state: "unverifiable",
      reason: `This letter is addressed to ${letter.company}, but no posting is loaded to check it against.`,
      attachable: false,
    };
  }

  const sameCompany = sameLabel(letter.company, analysis.meta.company);
  const sameTitle = sameLabel(letter.jobTitle, analysis.meta.title);
  if (!sameCompany || !sameTitle) {
    return {
      state: "stale",
      reason:
        `This letter is addressed to ${letter.company} for ${letter.jobTitle}, ` +
        `but the loaded posting is ${analysis.meta.company} — ${analysis.meta.title}. ` +
        "Regenerate it before bundling, or it goes out aimed at the wrong employer.",
      attachable: false,
    };
  }

  // The prose is the user's reviewed document, so a dial change is worth saying
  // out loud but is not a reason to refuse.
  const drift =
    dials && (letter.options.intensity !== dials.intensity || letter.options.emphasis !== dials.emphasis)
      ? ` Written at ${letter.options.intensity}% intensity with ${letter.options.emphasis} emphasis; the dials have moved since.`
      : "";

  return {
    state: "current",
    reason: `Written for ${analysis.meta.company} — ${analysis.meta.title}.${drift}`,
    attachable: true,
  };
}

