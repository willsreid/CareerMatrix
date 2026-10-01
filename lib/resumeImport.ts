/**
 * Resume import.
 *
 * Reads a PDF, DOCX or text resume and turns it into the shape the Master Profile
 * uses, so a first-time user (or a second career track) does not have to retype
 * years of history.
 *
 * Two rules, the same as everywhere else in this app:
 *
 *  1. **Nothing is invented.** Every field written out is a substring of the
 *     document, modulo whitespace. If a section cannot be found it comes back
 *     empty and the UI says so, instead of the parser guessing.
 *  2. **Nothing is silently overwritten.** Parsing produces a *proposal*; the
 *     profile only changes when the user applies it, and then on their terms.
 *
 * Parsing resumes is inherently lossy — a PDF carries positioned glyphs and no
 * structure at all — so the parser is deliberately conservative and reports what
 * it was unsure about rather than presenting a guess as fact.
 */

import type {
  MasterHeader,
  ProfileBullet,
  ProfileProject,
  ProfileRole,
  SkillGroup,
} from "./types";
import { makeId } from "./utils";

export type ResumeFileKind = "pdf" | "docx" | "txt" | "unknown";

export function kindOfFile(fileName: string, mimeType = ""): ResumeFileKind {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (name.endsWith(".docx") || mimeType.includes("wordprocessingml")) return "docx";
  if (name.endsWith(".txt") || name.endsWith(".md") || mimeType.startsWith("text/")) return "txt";
  // .doc is a binary compound file, not a zip: it needs a different parser
  // entirely, so it is reported as unsupported rather than producing mojibake.
  return "unknown";
}

/** Line-level cleanup shared by every source, so the parser sees one shape. */
export function normalizeDocumentText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n")
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Text extraction                                                            */
/* -------------------------------------------------------------------------- */

export interface ExtractionResult {
  kind: ResumeFileKind;
  text: string;
  notes: string[];
}

/**
 * DOCX is a zip whose visible text lives in `word/document.xml`. Paragraph, cell
 * and break tags carry the line structure; everything else is markup.
 */
function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/?>/g, " ")
    .replace(/<w:br\b[^>]*\/?>/g, "\n")
    // A paragraph or table-cell end is a line break as far as reading is
    // concerned, and resumes lay dates out in tables constantly.
    .replace(/<\/w:(p|tc)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)));
}

/** Groups PDF text runs into lines by their vertical position. */
export function pdfItemsToLines(items: { str: string; transform: number[] }[]): string {
  const rows = new Map<number, { x: number; text: string }[]>();
  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round((item.transform?.[5] ?? 0) / 2) * 2;
    const x = item.transform?.[4] ?? 0;
    const row = rows.get(y) ?? [];
    row.push({ x, text: item.str });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, cells]) =>
      cells
        .sort((a, b) => a.x - b.x)
        .map((cell) => cell.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("\n");
}

/**
 * pdf.js is loaded through this seam so tests can supply the Node-flavoured
 * `legacy` build; production always takes the default path, which is the bundled
 * worker in /public.
 */
export interface ExtractDeps {
  loadPdfjs?: () => Promise<typeof import("pdfjs-dist")>;
}

/**
 * Extracts readable text from an uploaded file.
 *
 * pdfjs and fflate are imported lazily, so a user who never imports a resume
 * never downloads either of them.
 */
export async function extractResumeText(
  file: {
    name: string;
    type?: string;
    arrayBuffer: () => Promise<ArrayBuffer>;
  },
  deps: ExtractDeps = {},
): Promise<ExtractionResult> {
  const kind = kindOfFile(file.name, file.type ?? "");
  const notes: string[] = [];

  if (kind === "unknown") {
    return {
      kind,
      text: "",
      notes: [
        "That file type cannot be read. Export the resume as PDF, DOCX or plain text and try again.",
      ],
    };
  }

  const buffer = await file.arrayBuffer();

  if (kind === "txt") {
    return {
      kind,
      text: normalizeDocumentText(new TextDecoder().decode(new Uint8Array(buffer))),
      notes,
    };
  }

  if (kind === "docx") {
    const { unzipSync, strFromU8 } = await import("fflate");
    const zip = unzipSync(new Uint8Array(buffer));
    const entry = Object.keys(zip).find((name) => /^word\/document\d*\.xml$/.test(name));
    if (!entry) {
      return { kind, text: "", notes: ["That DOCX has no readable document body inside it."] };
    }
    const xml = strFromU8(zip[entry]);
    if (/<w:drawing|<w:pict/i.test(xml)) {
      notes.push(
        "This document contains images or text boxes. Anything inside them is not in the document's text layer, so it cannot be imported.",
      );
    }
    return { kind, text: normalizeDocumentText(docxXmlToText(xml)), notes };
  }

  // PDF: lazy-loaded, pointed at the worker copied into /public so parsing happens
  // off the main thread and never blocks the workspace.
  const pdfjs = deps.loadPdfjs ? await deps.loadPdfjs() : await import("pdfjs-dist");
  if (!deps.loadPdfjs) pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;


  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      pdfItemsToLines(
        content.items
          .filter((item): item is typeof item & { str: string; transform: number[] } =>
            "str" in item,
          )
          .map((item) => ({
            str: (item as { str: string }).str,
            transform: (item as { transform: number[] }).transform,
          })),
      ),
    );
  }
  if (doc.numPages > 1) {
    notes.push(`Read ${doc.numPages} pages; repeated headers and page numbers are dropped.`);
  }
  return { kind, text: normalizeDocumentText(pages.join("\n")), notes };
}
/* -------------------------------------------------------------------------- */
/* Structure detection                                                        */
/* -------------------------------------------------------------------------- */

type SectionKey = "summary" | "skills" | "experience" | "projects" | "education" | "certifications";

/**
 * Builds a section-heading pattern.
 *
 * Up to two qualifier words may precede the keyword ("KEY AUTOMATION PROJECTS",
 * "TECHNICAL SKILLS") and the keyword may be trailed by a short conjunction
 * phrase ("CERTIFICATIONS & BACKGROUND"). Anchoring the keyword near the end
 * matters as much as matching it: a bullet like "Managed projects across teams"
 * is Title Case and short, and must not be mistaken for a section heading.
 */
function headingPattern(keyword: string): RegExp {
  return new RegExp(
    `^(?:[a-z&/'+.,-]+\\s+){0,2}(?:${keyword})[a-z]*(?:\\s*(?:&|and|of|for|with)\\s+[a-z&/'+.,-]+){0,3}$`,
    "i",
  );
}

const SECTION_PATTERNS: { key: SectionKey; pattern: RegExp }[] = [
  { key: "summary", pattern: headingPattern("summary|profile|objective|about|overview|introduction") },
  { key: "skills", pattern: headingPattern("skills|competenc|expertise|proficienc|technologies|toolkit|capabilit") },
  { key: "experience", pattern: headingPattern("experience|employment|work history|career history|positions held") },
  { key: "projects", pattern: headingPattern("projects?|portfolio") },
  { key: "education", pattern: headingPattern("education|academic|training|degrees?") },
  { key: "certifications", pattern: headingPattern("certification|certificate|licens|credential|registration") },
];

const DATE_RANGE =
  /(?:19|20)\d{2}\s*(?:-|–|—|to)\s*(?:[A-Za-z]{3,9}\.?\s*)?(?:(?:19|20)\d{2}|present|current|now|today)/i;
const MONTH_YEAR =
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\.?\s*(19|20)\d{2}/i;
/**
 * Month names as *whole* tokens only.
 *
 * The short forms have to be terminated at a word boundary rather than followed
 * by `[a-z]*`, or "Marketing" is read as "Mar" plus leftovers and a job title of
 * "Lifecycle Marketing Manager" silently becomes "Lifecycle Manager".
 */
const MONTH_NAME =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\.?\b/gi;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
const LINKEDIN = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/[\w./%-]+/i;
const URL = /(?:https?:\/\/|www\.)[\w./%-]+/i;
const CITY_STATE = /\b([A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)?),\s*([A-Z]{2}|[A-Z][a-z]+)\b/;
const PHONE = /(\+?\(?\d[\d\s().-]{7,}\d)/;
const BULLET_GLYPH = /^\s*(?:[•▪◦‣·*]|[-–—]\s|o\s)\s*/;
const ROLE_SEPARATOR = /^(.+?)\s*(?:,|;|\||\bat\b|@|·)\s+(.+)$/;

const ROLE_HINT =
  /\b(senior|sr|lead|manager|director|coordinator|engineer|analyst|specialist|developer|consultant|head|chief|associate|administrator|technician|designer|architect|superintendent|planner|programmer|assistant|intern|supervisor|officer|writer|editor|producer|marketer)\b/i;
const EMPLOYER_HINT =
  /\b(inc|llc|ltd|corp|corporation|group|company|partners|associates|firms?|studios?|agency|labs?|systems|technologies|solutions|services|institute|university|college)\b|·|\|/i;

/**
 * Decides which of two adjacent header lines is the job title and which is the
 * employer.
 *
 * Order alone is not enough: resumes print both ways round, and this app's own
 * PDF prints the title first with the employer underneath. Content decides it —
 * exactly one line usually reads like a role, or like a company — and when
 * neither signal fires the document's own order is trusted (title first), which
 * is the more common convention.
 */
function orderTitleAndCompany(
  first: string,
  second: string,
): { title: string; company: string } {
  const firstIsRole = ROLE_HINT.test(first);
  const secondIsRole = ROLE_HINT.test(second);
  if (firstIsRole !== secondIsRole) {
    return firstIsRole ? { title: first, company: second } : { title: second, company: first };
  }
  const firstIsEmployer = EMPLOYER_HINT.test(first);
  const secondIsEmployer = EMPLOYER_HINT.test(second);
  if (firstIsEmployer !== secondIsEmployer) {
    return secondIsEmployer ? { title: first, company: second } : { title: second, company: first };
  }
  return { title: first, company: second };
}

/**
 * Removes every trace of a date from a header line.
 *
 * Worth being thorough about: a single left-over "Jan" turns
 * "Title — Company | Jan 2021 - Present" into a company called
 * "Company | Jan", which is exactly the kind of quiet corruption this app is
 * built to avoid.
 */
function stripDates(value: string): string {
  return value
    .replace(DATE_RANGE, " ")
    .replace(MONTH_YEAR, " ")
    .replace(MONTH_NAME, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/[\s|,;·–—-]+$/, "")
    .replace(/^[\s|,;·–—-]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** A heading is short, standalone, and in a shape people actually use. */
function sectionHeading(line: string): SectionKey | null {
  const cleaned = line.replace(/[:\s]+$/, "").trim();
  if (!cleaned || cleaned.length > 46 || /[.;]$/.test(cleaned)) return null;
  const upper = cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned);
  const titled = /^[A-Z][A-Za-z&/'\- ]+$/.test(cleaned);
  if (!upper && !titled) return null;
  return SECTION_PATTERNS.find((entry) => entry.pattern.test(cleaned))?.key ?? null;
}

/** Everything that is contact detail rather than a name. */
function stripContactTokens(line: string): string {
  return line
    .replace(EMAIL, " ")
    .replace(new RegExp(PHONE, "g"), " ")
    .replace(new RegExp(URL, "gi"), " ")
    .replace(new RegExp(LINKEDIN, "gi"), " ")
    .replace(/[\s|,·•\-–—]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function looksLikeName(line: string): boolean {
  if (!line || line.length > 48) return false;
  if (/[@\d]|resume|curriculum|vitae|http/i.test(line)) return false;
  const words = line.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  return words.every((word) => /^[A-Z][A-Za-z.'-]*$/.test(word));
}

/** Text that is only a page number or a repeated running header. */
function isNoiseLine(line: string): boolean {
  return /^page\s+\d+(\s*(of|\/)\s*\d+)?$/i.test(line) || /^\d{1,2}$/.test(line.trim());
}

export interface ParsedRole {
  title: string;
  company: string;
  location: string;
  dates: string;
  bullets: string[];
}

export interface ParsedProject {
  name: string;
  meta: string;
  bullets: string[];
}

export interface ParsedResume {
  header: Partial<MasterHeader>;
  summary: string;
  skillGroups: { title: string; items: string[] }[];
  roles: ParsedRole[];
  projects: ParsedProject[];
  education: string[];
  certifications: string[];
  sectionsFound: SectionKey[];
  warnings: string[];
}

/** Splits a document into its heading-delimited sections, then parses each one. */
export function parseResumeText(rawText: string): ParsedResume {
  const lines = normalizeDocumentText(rawText)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isNoiseLine(line));

  const warnings: string[] = [];
  const buckets = new Map<SectionKey, string[]>();
  const sectionsFound: SectionKey[] = [];
  let head: string[] = [];

  let current: SectionKey | null = null;
  for (const line of lines) {
    const heading = sectionHeading(line);
    if (heading) {
      if (!sectionsFound.includes(heading)) sectionsFound.push(heading);
      current = heading;
      if (!buckets.has(heading)) buckets.set(heading, []);
      continue;
    }
    if (current) buckets.get(current)!.push(line);
    else head.push(line);
  }

  const header = parseHeaderBlock(head, warnings);
  const summary = (buckets.get("summary") ?? []).join(" ").replace(/\s+/g, " ").trim();
  const skillGroups = parseSkills(buckets.get("skills") ?? []);
  const roles = parseRoles(buckets.get("experience") ?? [], warnings);
  const projects = parseProjects(buckets.get("projects") ?? []);
  const education = (buckets.get("education") ?? []).map((line) => line.trim()).filter(Boolean);
  const certifications = (buckets.get("certifications") ?? [])
    .map((line) => line.trim())
    .filter(Boolean);

  if (!roles.length) {
    warnings.push(
      "No work experience section was recognised. Add roles by hand in the Roles tab, or rename the heading to “Experience”.",
    );
  }
  if (!skillGroups.length) {
    warnings.push("No skills section was recognised, so the skills block was left alone.");
  }
  if (!summary) {
    warnings.push("No summary or objective paragraph was found.");
  }

  return {
    header,
    summary,
    skillGroups,
    roles,
    projects,
    education,
    certifications,
    sectionsFound,
    warnings,
  };
}

/**
 * Reads the block above the first heading: name, headline, and contact details.
 * Every field is optional — a miss leaves the existing profile value untouched.
 */
function parseHeaderBlock(lines: string[], warnings: string[]): Partial<MasterHeader> {
  const header: Partial<MasterHeader> = {};
  const joined = lines.join(" \n ");

  const email = EMAIL.exec(joined)?.[0];
  if (email) header.email = email;
  const linkedin = LINKEDIN.exec(joined)?.[0];
  if (linkedin) header.linkedin = linkedin.startsWith("http") ? linkedin : `https://${linkedin}`;
  // Any other URL in the contact block is a portfolio or code profile.
  const portfolio = lines
    .flatMap((line) => line.match(new RegExp(URL, "gi")) ?? [])
    .find((hit) => !/linkedin\.com/i.test(hit) && !EMAIL.test(hit));
  if (portfolio) header.portfolio = portfolio.startsWith("http") ? portfolio : `https://${portfolio}`;
  const phone = (() => {
    for (const line of lines) {
      const hit = PHONE.exec(line)?.[0];
      const digits = hit ? digitsOnly(hit) : "";
      // 10-15 digits is a phone number; a year range is not.
      if (hit && digits.length >= 10 && digits.length <= 15) return hit.trim();
    }
    return undefined;
  })();
  if (phone) header.phone = phone;

  for (const line of lines) {
    const city = CITY_STATE.exec(line);
    if (city && !header.location) {
      header.location = `${city[1]}, ${city[2]}`;
      break;
    }
  }

  const firstTextLine = lines.find((line) => line.length > 1);
  // A header row laid out in columns puts the name on the same text line as the
  // email ("Alex Rivera alex.rivera@example.com" — which is what this app's own PDF
  // produces). Strip the contact tokens and try again before giving up.
  const candidateLines = lines.length
    ? [firstTextLine, ...lines.map(stripContactTokens)].filter((line): line is string => Boolean(line))
    : [];
  const nameLine = candidateLines.find((line) => looksLikeName(line));
  if (nameLine) {
    header.name = nameLine.replace(/\s+/g, " ").trim();
  } else if (firstTextLine) {
    warnings.push(
      `Could not tell which line is the name (first line reads “${firstTextLine.slice(0, 40)}”). Set it by hand.`,
    );
  }

  // The line after the name is usually the headline or the first address line.
  const nameIndex = header.name ? lines.findIndex((line) => line.includes(header.name!)) : -1;
  const after = nameIndex >= 0 ? lines[nameIndex + 1] : undefined;
  if (after && after.length <= 90 && !EMAIL.test(after) && !CITY_STATE.test(after)) {
    header.headline = after.replace(/\s+/g, " ");
  } else if (header.location) {
    header.headline = undefined;
  }

  return header;
}

/** Skills lines are either "Group: a, b, c" or a flat list of terms. */
function parseSkills(lines: string[]): { title: string; items: string[] }[] {
  const groups: { title: string; items: string[] }[] = [];
  const push = (title: string, items: string[]) => {
    const cleaned = items.map((item) => item.trim()).filter((item) => item.length > 1);
    if (cleaned.length) groups.push({ title, items: cleaned });
  };

  for (const line of lines) {
    const labelled = /^([A-Za-z][A-Za-z0-9 /&+()'’-]{1,38}):\s*(.+)$/.exec(line);
    if (labelled) {
      push(labelled[1].trim(), splitItems(labelled[2]));
      continue;
    }
    // A line that is only a category name followed by nothing is a dropped bullet.
    push("Skills", splitItems(line.replace(BULLET_GLYPH, "")));
  }
  return groups;
}

function splitItems(value: string): string[] {
  return value
    .split(/\s*(?:[|;·•]|,\s|\s–\s)/)
    .map((item) => item.replace(BULLET_GLYPH, "").trim())
    .filter((item) => item.length > 1 && item.length < 80);
}

/**
 * A line that reads like a job title or employer rather than a bullet. Used to
 * catch the very common two-line header ("Title, Company" / "Mar 2018 - Dec 2020").
 */
function looksLikeRoleHeading(line: string): boolean {
  const cleaned = line.trim();
  if (!cleaned || cleaned.length > 70) return false;
  if (/[.;:]$/.test(cleaned)) return false;
  if (BULLET_GLYPH.test(cleaned)) return false;
  if (DATE_RANGE.test(cleaned) || MONTH_YEAR.test(cleaned)) return false;
  if (cleaned.split(/\s+/).length > 9) return false;
  // Bullets that lost their glyph usually open with a verb.
  return !/^(and|with|the|for|a |an |managed|led|built|ran|owns?ed?|created|developed|implemented|coordinated|delivered|drove|designed|grew|improved|supported|helped)\b/i.test(
    cleaned,
  );
}

/**
 * Experience entries.
 *
 * Handles the three header shapes resumes actually use:
 *   "Title — Company | Jan 2019 - Present"   (one line, dates included)
 *   "Title at Company" + "Jan 2019 - Present" (two lines)
 *   "Company" + "Title, Company | dates"      (company first)
 * Everything between two headers is that role's bullets, with wrapped lines
 * rejoined. Titles and companies are only reported when the document separated
 * them; nothing is guessed from position alone.
 */
function parseRoles(lines: string[], warnings: string[]): ParsedRole[] {
  const roles: ParsedRole[] = [];
  let current: ParsedRole | null = null;
  let pendingHeader: string | null = null;

  const flush = () => {
    if (current && (current.title || current.company)) roles.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isBullet = BULLET_GLYPH.test(line);
    const dates = DATE_RANGE.exec(line)?.[0] ?? MONTH_YEAR.exec(line)?.[0];

    if (!isBullet && dates && line.length < 130) {
      const { title, company } = splitTitleCompany(stripDates(line), pendingHeader);
      flush();
      current = {
        title,
        company,
        location: CITY_STATE.exec(line)?.slice(0, 3).join(", ") ?? "",
        dates,
        bullets: [],
      };
      pendingHeader = null;
      continue;
    }

    // Two-line header: a heading-looking line whose next line carries the dates.
    const nextLine = lines[index + 1];
    const nextDates = nextLine
      ? DATE_RANGE.exec(nextLine)?.[0] ?? MONTH_YEAR.exec(nextLine)?.[0]
      : undefined;
    if (!isBullet && nextDates && looksLikeRoleHeading(line)) {
      const { title, company } = splitTitleCompany(line, pendingHeader);
      flush();
      current = {
        title,
        company,
        location: CITY_STATE.exec(nextLine!)?.slice(0, 3).join(", ") ?? "",
        dates: nextDates,
        bullets: [],
      };
      pendingHeader = null;
      index += 1;
      continue;
    }

    if (!isBullet && looksLikeRoleHeading(line)) {
      if (pendingHeader) {
        // Two adjacent heading lines: content decides which is the title.
        const { title, company } = orderTitleAndCompany(pendingHeader, line);
        flush();
        current = { title, company, location: "", dates: "", bullets: [] };
        pendingHeader = null;
      } else if (current && !current.bullets.length) {
        // A bare employer line right under the title.
        current.company = current.company || line;
      } else {
        pendingHeader = line;
      }
      continue;
    }

    if (!current) continue;
    const text = line.replace(BULLET_GLYPH, "").trim();
    if (!text) continue;
    // A wrapped bullet: the previous line did not end a sentence and this one
    // starts in lower case.
    const previous = current.bullets[current.bullets.length - 1];
    if (previous && !isBullet && /[a-z0-9]$/.test(previous) && /^[a-z(]/.test(text)) {
      current.bullets[current.bullets.length - 1] = `${previous} ${text}`;
    } else {
      current.bullets.push(text);
    }
  }
  flush();

  if (pendingHeader) {
    warnings.push(`A line looks like a job heading but has no dates near it: “${pendingHeader}”.`);
  }
  return roles;
}

/** Splits "Senior Analyst, Acme Corp" / "Acme Corp — Senior Analyst" sensibly. */
function splitTitleCompany(
  value: string,
  pendingHeader: string | null,
): { title: string; company: string } {
  const cleaned = stripDates(value).replace(/\s*[|·]\s*$/, "").trim();
  const separated = ROLE_SEPARATOR.exec(cleaned);
  const dash = /^(.+?)\s+[—–]\s+(.+)$/.exec(cleaned);

  if (separated) return { title: separated[1].trim(), company: separated[2].trim() };
  if (dash) {
    // "Company — Title" reads the other way round; a title usually carries a
    // seniority word, so use that to decide which side is which. The boundaries
    // matter: "Engineering" must not match "engineer".
    const seniority =
      /\b(senior|sr|lead|manager|director|coordinator|engineer|analyst|specialist|developer|consultant|head|chief|associate|administrator)\b/i;
    return seniority.test(dash[2])
      ? { title: dash[2].trim(), company: dash[1].trim() }
      : { title: dash[1].trim(), company: dash[2].trim() };
  }
  if (pendingHeader) return { title: cleaned, company: pendingHeader.trim() };
  return { title: cleaned, company: "" };
}

/** Projects print as a name line, an optional meta line, then bullets. */
function parseProjects(lines: string[]): ParsedProject[] {
  const projects: ParsedProject[] = [];
  let current: ParsedProject | null = null;

  for (const line of lines) {
    const isBullet = BULLET_GLYPH.test(line);
    const text = line.replace(BULLET_GLYPH, "").trim();
    if (!text) continue;

    if (!isBullet) {
      // A meta line sits directly under the name: tech stack, a link, or dates.
      if (current && !current.meta && !current.bullets.length && /[·|]|https?:\/\/|(19|20)\d{2}/.test(text)) {
        current.meta = text;
        continue;
      }
      if (current) projects.push(current);
      current = { name: text, meta: "", bullets: [] };
      continue;
    }

    if (!current) current = { name: text, meta: "", bullets: [] };
    else current.bullets.push(text);
  }
  if (current) projects.push(current);
  return projects.filter((project) => project.name || project.bullets.length);
}

/* -------------------------------------------------------------------------- */
/* Turning a parse into profile data                                          */
/* -------------------------------------------------------------------------- */

function bullet(text: string): ProfileBullet {
  return {
    id: makeId("bul"),
    // No label: the doc did not distinguish one, and inventing one would put
    // words on the sheet that are not in the resume.
    label: "",
    text,
    tags: [],
    emphasis: [],
  };
}

export interface ImportedProfileData {
  header: Partial<MasterHeader>;
  pitch: string;
  skillGroups: SkillGroup[];
  roles: ProfileRole[];
  projects: ProfileProject[];
  education: { id: string; text: string }[];
  certifications: { id: string; text: string }[];
}

/** Converts a parse into objects the Master Profile can hold. */
export function profileDataFromParse(parsed: ParsedResume): ImportedProfileData {
  return {
    header: parsed.header,
    pitch: parsed.summary,
    skillGroups: parsed.skillGroups.map((group) => ({
      id: makeId("sg"),
      title: group.title,
      items: group.items.map((term) => ({ id: makeId("sk"), term, tags: [] })),
      emphasis: [],
    })),
    roles: parsed.roles.map((role) => ({
      id: makeId("role"),
      role: role.title,
      company: role.company,
      location: role.location,
      dates: role.dates,
      bullets: role.bullets.map(bullet),
    })),
    projects: parsed.projects.map((project) => ({
      id: makeId("proj"),
      name: project.name,
      meta: project.meta,
      bullets: project.bullets.map(bullet),
    })),
    education: parsed.education.map((text) => ({ id: makeId("edu"), text })),
    certifications: parsed.certifications.map((text) => ({ id: makeId("cert"), text })),
  };
}

/**
 * What applying the import would change, in plain numbers, so the UI can show the
 * cost before the user commits to it.
 */
export interface ImportImpact {
  headerFields: string[];
  roles: number;
  bullets: number;
  skillGroups: number;
  skills: number;
  projects: number;
  education: number;
  certifications: number;
  keepsPitch: boolean;
}

export function importImpact(data: ImportedProfileData, useSummaryAsPitch: boolean): ImportImpact {
  return {
    headerFields: Object.entries(data.header)
      .filter(([, value]) => Boolean(value))
      .map(([field]) => field),
    roles: data.roles.length,
    bullets: data.roles.reduce((sum, role) => sum + role.bullets.length, 0),
    skillGroups: data.skillGroups.length,
    skills: data.skillGroups.reduce((sum, group) => sum + group.items.length, 0),
    projects: data.projects.length,
    education: data.education.length,
    certifications: data.certifications.length,
    keepsPitch: Boolean(useSummaryAsPitch && data.pitch),
  };
}

/**
 * Merges imported items into an existing list, skipping duplicates by text.
 *
 * Deduplication is by the printed text rather than the id, because the whole point
 * of importing on top of a profile is that the same job may already be in there
 * under an id the importer knows nothing about.
 */
function mergeUnique<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const seen = new Set(existing.map((item) => key(item).toLowerCase().replace(/\s+/g, " ").trim()));
  const added = incoming.filter((item) => {
    const fingerprint = key(item).toLowerCase().replace(/\s+/g, " ").trim();
    if (!fingerprint || seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
  return [...existing, ...added];
}

/** The header fields an import may set — everything except the curated lists. */
const HEADER_TEXT_FIELDS = [
  "name",
  "headline",
  "location",
  "locationNote",
  "email",
  "phone",
  "linkedin",
  "portfolio",
] as const satisfies readonly (keyof MasterHeader)[];

/**
 * Applies a parse to a profile. `replace` swaps the content blocks wholesale;
 * otherwise everything is added and only empty header fields are filled, so an
 * import can never quietly delete work the user already did.
 *
 * Generic over the profile type so the caller keeps the exact type it passed in
 * (`MasterProfile` on the profile page, a bare subset in tests).
 */
export function applyImport<T extends MasterProfileLike>(
  profile: T,
  data: ImportedProfileData,
  options: { mode: "merge" | "replace"; useSummaryAsPitch: boolean },
): T {
  const header: MasterHeader = { ...profile.header };
  // Only the free-text header fields are imported. `altHeadlines` is a list of
  // truthful alternates the user curates; a resume parse cannot produce those.
  for (const field of HEADER_TEXT_FIELDS) {
    const value = data.header[field];
    if (!value) continue;
    if (options.mode === "replace" || !header[field]) header[field] = value;
  }

  const usePitch = options.useSummaryAsPitch && data.pitch.length > 0;
  const pitch =
    usePitch && (options.mode === "replace" || !profile.pitch.trim())
      ? data.pitch
      : profile.pitch;

  return {
    ...profile,
    header,
    pitch,
    skillGroups:
      options.mode === "replace" && data.skillGroups.length
        ? data.skillGroups
        : mergeUnique(profile.skillGroups, data.skillGroups, (group) => group.title),
    roles:
      options.mode === "replace" && data.roles.length
        ? data.roles
        : mergeUnique(profile.roles, data.roles, (role) => `${role.role} ${role.company}`),
    projects:
      options.mode === "replace" && data.projects.length
        ? data.projects
        : mergeUnique(profile.projects, data.projects, (project) => project.name),
    education:
      options.mode === "replace" && data.education.length
        ? data.education
        : mergeUnique(profile.education, data.education, (entry) => entry.text),
    certifications:
      options.mode === "replace" && data.certifications.length
        ? data.certifications
        : mergeUnique(profile.certifications, data.certifications, (entry) => entry.text),
  };
}

/** The slice of the profile this module touches. */
export interface MasterProfileLike {
  header: MasterHeader;
  pitch: string;
  skillGroups: SkillGroup[];
  roles: ProfileRole[];
  projects: ProfileProject[];
  education: { id: string; text: string }[];
  certifications: { id: string; text: string }[];
}
