import type { JobAnalysis, JobMeta, KeywordHit, MasterProfile, WorkMode } from "./types";
import { escapeRegExp } from "./utils";

/**
 * Heuristic job-posting analyzer.
 *
 * Deliberately dependency-free and deterministic: no network calls, no model
 * calls. Everything here is regex + a curated lexicon of VDC / BIM / trades
 * vocabulary, which means the same posting always produces the same analysis
 * and nothing leaves the machine.
 */

export type LexiconCategory =
  | "VDC / BIM"
  | "Automation & Code"
  | "Software"
  | "Field & Delivery"
  | "Project / Market"
  | "Process & Leadership"
  | "Credentials";

export interface LexiconEntry {
  term: string;
  aliases: string[];
  category: LexiconCategory;
  /** 1-10: how much this term matters in the VDC hiring market. */
  weight: number;
}

export const SKILL_LEXICON: LexiconEntry[] = [
  /* ------------------------------- VDC / BIM ------------------------------ */
  {
    term: "VDC / Virtual Design & Construction",
    aliases: ["vdc", "virtual design and construction", "virtual design & construction"],
    category: "VDC / BIM",
    weight: 9,
  },
  {
    term: "BIM Coordination",
    aliases: [
      "bim coordination",
      "bim coordinator",
      "model coordination",
      "3d coordination",
      "spatial coordination",
      "coordination modeling",
    ],
    category: "VDC / BIM",
    weight: 9,
  },
  {
    term: "Navisworks Manage",
    aliases: ["navisworks", "navisworks manage", "nwmanage", "navisworks freedom"],
    category: "VDC / BIM",
    weight: 9,
  },
  {
    term: "Clash Detection & Resolution",
    aliases: [
      "clash detection",
      "clash detect",
      "clash report",
      "clash matrix",
      "clash resolution",
      "clash coordination",
      "clash",
    ],
    category: "VDC / BIM",
    weight: 8,
  },
  {
    term: "Federated Models",
    aliases: [
      "federated model",
      "federated",
      "model federation",
      "aggregate model",
      "model aggregation",
      "combined model",
    ],
    category: "VDC / BIM",
    weight: 8,
  },
  {
    term: "Laser Scanning / Reality Capture",
    aliases: [
      "laser scanning",
      "laser scan",
      "lidar",
      "point cloud",
      "reality capture",
      "faro",
      "leica",
      "trimble sx10",
    ],
    category: "VDC / BIM",
    weight: 7,
  },
  {
    term: "LOD / Level of Development",
    aliases: [
      "lod 100",
      "lod 200",
      "lod 300",
      "lod 350",
      "lod 400",
      "lod 500",
      "lod400",
      "level of development",
      "level of detail",
      "lod",
    ],
    category: "VDC / BIM",
    weight: 7,
  },
  {
    term: "BIM Execution Plan",
    aliases: [
      "bim execution plan",
      "bep",
      "bim standards",
      "modeling standards",
      "model standards",
      "bim workflow",
    ],
    category: "VDC / BIM",
    weight: 6,
  },
  {
    term: "Autodesk Revit",
    aliases: ["revit", "autodesk revit"],
    category: "VDC / BIM",
    weight: 6,
  },
  {
    term: "Revit Families / Content",
    aliases: ["revit family", "revit families", "family creation", "content creation", "revit content"],
    category: "VDC / BIM",
    weight: 5,
  },
  {
    term: "Design-Build Delivery",
    aliases: ["design-build", "design build", "design assist", "progressive design-build"],
    category: "VDC / BIM",
    weight: 6,
  },
  {
    term: "Prefabrication / Modular",
    aliases: [
      "prefab",
      "prefabrication",
      "pre-fabrication",
      "modular construction",
      "modular",
      "offsite fabrication",
    ],
    category: "VDC / BIM",
    weight: 6,
  },
  {
    term: "Fabrication / Shop Drawings",
    aliases: [
      "shop drawing",
      "shop drawings",
      "fabrication drawing",
      "spool drawing",
      "spooling",
      "fabrication model",
      "fabrication detailing",
      "detailing",
    ],
    category: "VDC / BIM",
    weight: 6,
  },
  {
    term: "4D / 5D Scheduling",
    aliases: ["4d scheduling", "4d sequencing", "4d", "5d", "synchro", "digital rehearsal"],
    category: "VDC / BIM",
    weight: 5,
  },
  {
    term: "Quantity Takeoff",
    aliases: ["quantity takeoff", "quantity take-off", "take-off", "takeoff", "material takeoff"],
    category: "VDC / BIM",
    weight: 4,
  },
  {
    term: "ISO 19650",
    aliases: ["iso 19650", "iso19650", "bs1192", "bs 1192"],
    category: "VDC / BIM",
    weight: 4,
  },
  {
    term: "Digital Twin",
    aliases: ["digital twin", "asset information model", "aim"],
    category: "VDC / BIM",
    weight: 3,
  },
  {
    term: "Common Data Environment",
    aliases: ["common data environment", "cde"],
    category: "VDC / BIM",
    weight: 3,
  },
  /* ---------------------------- Automation & Code ------------------------- */
  {
    term: "Python",
    aliases: ["python", "python 3", "python scripting", "python automation"],
    category: "Automation & Code",
    weight: 8,
  },
  {
    term: "Revit API",
    aliases: [
      "revit api",
      "revitapi",
      "revit add-in",
      "revit addin",
      "revit plugin",
      "revit automation",
    ],
    category: "Automation & Code",
    weight: 8,
  },
  {
    term: "pyRevit",
    aliases: ["pyrevit", "py revit", "pushbutton", "smartbutton", "revit ribbon"],
    category: "Automation & Code",
    weight: 7,
  },
  {
    term: "Automation & Scripting",
    aliases: [
      "automation",
      "automate",
      "automated workflows",
      "scripting",
      "custom scripts",
      "internal tools",
      "tool development",
    ],
    category: "Automation & Code",
    weight: 7,
  },
  {
    term: "C# / .NET",
    aliases: ["c#", "csharp", "c sharp", ".net", "dotnet", "wpf"],
    category: "Automation & Code",
    weight: 6,
  },
  {
    term: "PySide6 / Qt",
    aliases: ["pyside6", "pyside", "pyqt", "qt", "desktop application", "gui"],
    category: "Automation & Code",
    weight: 5,
  },
  {
    term: "Dynamo / Visual Programming",
    aliases: ["dynamo", "visual scripting", "visual programming", "grasshopper"],
    category: "Automation & Code",
    weight: 5,
  },
  {
    term: "APIs & Integrations",
    aliases: ["rest api", "api integration", "api", "middleware", "integrations", "integration"],
    category: "Automation & Code",
    weight: 5,
  },
  {
    term: "Data & Reporting",
    aliases: [
      "power bi",
      "dashboard",
      "dashboards",
      "data analytics",
      "reporting",
      "vba",
      "excel automation",
    ],
    category: "Automation & Code",
    weight: 4,
  },
  {
    term: "Software Craft",
    aliases: [
      "git",
      "version control",
      "code review",
      "unit test",
      "software development",
      "agile",
      "scrum",
    ],
    category: "Automation & Code",
    weight: 4,
  },
  {
    term: "AI / Machine Learning",
    aliases: [
      "machine learning",
      "artificial intelligence",
      "ai tools",
      "generative ai",
      "llm",
      "computer vision",
    ],
    category: "Automation & Code",
    weight: 4,
  },

  /* -------------------------------- Software ------------------------------ */
  {
    term: "Autodesk Construction Cloud",
    aliases: ["autodesk construction cloud", "acc", "bim 360", "bim360", "autodesk docs"],
    category: "Software",
    weight: 6,
  },
  {
    term: "Revizto",
    aliases: ["revizto"],
    category: "Software",
    weight: 5,
  },
  {
    term: "Bluebeam Revu",
    aliases: ["bluebeam", "bluebeam revu"],
    category: "Software",
    weight: 4,
  },
  {
    term: "Procore",
    aliases: ["procore"],
    category: "Software",
    weight: 4,
  },
  {
    term: "AutoCAD",
    aliases: ["autocad", "cad drafting", "dwg"],
    category: "Software",
    weight: 4,
  },
  {
    term: "Trimble / Tekla",
    aliases: ["trimble connect", "trimble", "tekla", "fieldlink", "field link"],
    category: "Software",
    weight: 4,
  },
  {
    term: "Solibri / Model Checking",
    aliases: ["solibri", "model checking", "model checker", "model audit", "clash matrix software"],
    category: "Software",
    weight: 4,
  },
  {
    term: "Scheduling Software",
    aliases: ["primavera", "p6", "microsoft project", "ms project", "asta powerproject"],
    category: "Software",
    weight: 4,
  },
  {
    term: "Civil 3D / Site",
    aliases: ["civil 3d", "civils", "site utilities", "underground utilities"],
    category: "Software",
    weight: 3,
  },
  {
    term: "QGIS / GIS",
    aliases: ["qgis", "gis", "geospatial", "arcgis"],
    category: "Software",
    weight: 3,
  },
  {
    term: "VR / Visualization",
    aliases: ["unreal engine", "unity", "twinmotion", "virtual reality", "vr walkthrough", "3ds max"],
    category: "Software",
    weight: 3,
  },
  {
    term: "SketchUp / FormIt",
    aliases: ["sketchup", "formit", "conceptual modeling"],
    category: "Software",
    weight: 2,
  },
  /* ---------------------------- Field & Delivery -------------------------- */
  {
    term: "MEP Coordination",
    aliases: [
      "mep coordination",
      "mep",
      "mechanical electrical plumbing",
      "mechanical",
      "electrical",
      "plumbing",
      "hvac",
      "sheet metal",
      "piping",
      "process piping",
    ],
    category: "Field & Delivery",
    weight: 9,
  },
  {
    term: "Field Coordination",
    aliases: [
      "field coordination",
      "site coordination",
      "field installation",
      "field experience",
      "field supervision",
      "jobsite coordination",
      "field leadership",
    ],
    category: "Field & Delivery",
    weight: 8,
  },
  {
    term: "Subcontractor / Trade Management",
    aliases: [
      "subcontractor management",
      "subcontractor",
      "subcontractors",
      "trade partner",
      "trade partners",
      "trade management",
      "trade coordination",
      "vendor management",
    ],
    category: "Field & Delivery",
    weight: 7,
  },
  {
    term: "Constructability Reviews",
    aliases: [
      "constructability",
      "constructibility",
      "constructability review",
      "buildability",
      "design review",
    ],
    category: "Field & Delivery",
    weight: 7,
  },
  {
    term: "Coordination Meetings",
    aliases: [
      "coordination meeting",
      "coordination review",
      "coordination meetings",
      "oac meeting",
      "weekly coordination",
      "design team meetings",
      "clash review meeting",
    ],
    category: "Field & Delivery",
    weight: 6,
  },
  {
    term: "RFIs & Submittals",
    aliases: ["rfi", "rfis", "submittal", "submittals", "asi", "change order"],
    category: "Field & Delivery",
    weight: 5,
  },
  {
    term: "Quality Control",
    aliases: ["qa/qc", "qaqc", "quality control", "quality assurance", "punch list", "punchlist"],
    category: "Field & Delivery",
    weight: 4,
  },
  {
    term: "Safety / OSHA",
    aliases: ["osha 30", "osha 10", "osha", "safety program", "site safety", "toolbox talk"],
    category: "Field & Delivery",
    weight: 3,
  },
  {
    term: "Construction Scheduling",
    aliases: [
      "look-ahead schedule",
      "short interval",
      "cpm",
      "construction schedule",
      "sequencing",
      "installation sequence",
    ],
    category: "Field & Delivery",
    weight: 4,
  },
  {
    term: "Survey & Layout",
    aliases: ["survey", "layout", "total station", "as-built", "as built"],
    category: "Field & Delivery",
    weight: 2,
  },

  /* ---------------------------- Project / Market -------------------------- */
  {
    term: "Data Center / Mission-Critical",
    aliases: [
      "data center",
      "datacenter",
      "data centre",
      "hyperscale",
      "hyper-scale",
      "colocation",
      "colo",
      "white space",
      "white-space",
      "mission critical",
      "mission-critical",
    ],
    category: "Project / Market",
    weight: 9,
  },
  {
    term: "Industrial / Advanced Manufacturing",
    aliases: [
      "industrial",
      "heavy industrial",
      "advanced manufacturing",
      "semiconductor",
      "fab",
      "pharmaceutical",
      "life sciences",
      "food and beverage",
      "power plant",
    ],
    category: "Project / Market",
    weight: 6,
  },
  {
    term: "Electrical Construction",
    aliases: [
      "electrical contractor",
      "electrical construction",
      "electrical",
      "medium voltage",
      "switchgear",
      "cable tray",
      "busway",
      "conduit",
    ],
    category: "Project / Market",
    weight: 7,
  },
  {
    term: "Commercial / Institutional",
    aliases: [
      "commercial construction",
      "commercial",
      "tenant improvement",
      "healthcare",
      "hospital",
      "higher education",
      "k-12",
      "public works",
    ],
    category: "Project / Market",
    weight: 4,
  },
  {
    term: "Remote / Hybrid Work",
    aliases: [
      "fully remote",
      "remote position",
      "remote work",
      "remote-first",
      "work from home",
      "wfh",
      "telecommute",
      "hybrid",
      "distributed team",
    ],
    category: "Project / Market",
    weight: 5,
  },
  /* -------------------------- Process & Leadership ------------------------ */
  {
    term: "Training & Mentoring",
    aliases: [
      "training",
      "train",
      "mentor",
      "mentoring",
      "coach",
      "onboarding",
      "lunch and learn",
      "team development",
      "knowledge transfer",
    ],
    category: "Process & Leadership",
    weight: 5,
  },
  {
    term: "Process Documentation",
    aliases: [
      "standard operating procedure",
      "sop",
      "documentation",
      "workflow documentation",
      "playbook",
      "best practices",
      "guidelines",
    ],
    category: "Process & Leadership",
    weight: 5,
  },
  {
    term: "Leadership & Ownership",
    aliases: [
      "leadership",
      "ownership",
      "owns the",
      "manage a team",
      "direct reports",
      "drive adoption",
      "champion",
      "act as lead",
    ],
    category: "Process & Leadership",
    weight: 6,
  },
  {
    term: "Stakeholder Collaboration",
    aliases: [
      "cross-functional",
      "stakeholder",
      "discipline leads",
      "project manager",
      "superintendent",
      "general contractor",
      "design team",
      "owner's representative",
    ],
    category: "Process & Leadership",
    weight: 4,
  },
  {
    term: "Continuous Improvement",
    aliases: [
      "continuous improvement",
      "lean construction",
      "efficiency",
      "streamline",
      "innovation",
    ],
    category: "Process & Leadership",
    weight: 3,
  },

  /* ------------------------------ Credentials ----------------------------- */
  {
    term: "Trade / Apprenticeship Background",
    aliases: [
      "journeyman",
      "apprenticeship",
      "union trade",
      "trade school",
      "field trade",
      "trade background",
    ],
    category: "Credentials",
    weight: 4,
  },
  {
    term: "Degree / Certification",
    aliases: [
      "bachelor",
      "bachelors",
      "b.s.",
      "bs degree",
      "associate degree",
      "certification",
      "certified",
      "certificate program",
    ],
    category: "Credentials",
    weight: 3,
  },
];

/* -------------------------------------------------------------------------- */
/* Text helpers                                                               */
/* -------------------------------------------------------------------------- */

const BULLET_PREFIX = /^\s*(?:[-–—*•·▪●○]|\(?\d{1,2}[.)])\s+/;

export function stripBullet(line: string): string {
  return line.replace(BULLET_PREFIX, "").trim();
}

export function toLines(rawText: string): string[] {
  return rawText
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\t/g, " ").trimEnd());
}

/** Whole-word, case-insensitive occurrence count for one alias. */
export function countAlias(haystack: string, alias: string): number {
  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(alias.toLowerCase())}([^a-z0-9]|$)`,
    "g",
  );
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(haystack)) !== null) {
    count += 1;
    // Step back so adjacent matches separated by a single char still register.
    pattern.lastIndex = Math.max(pattern.lastIndex - 1, 0);
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return count;
}

export function containsAlias(haystack: string, alias: string): boolean {
  return countAlias(haystack, alias) > 0;
}

/* -------------------------------------------------------------------------- */
/* Section splitting                                                          */
/* -------------------------------------------------------------------------- */

const REQUIREMENT_HEADINGS = [
  /requirement/i,
  /qualification/i,
  /what you.?(?:ll)?\s*bring/i,
  /what we.?(?:re)?\s*looking for/i,
  /you (?:have|will need|should have)/i,
  /must have/i,
  /nice to have/i,
  /preferred/i,
  /minimum (?:qualifications|requirements)/i,
  /skills/i,
  /experience required/i,
  /who you are/i,
];

const RESPONSIBILITY_HEADINGS = [
  /responsibilit/i,
  /what you.?(?:ll)?\s*do/i,
  /day[- ]to[- ]day/i,
  /duties/i,
  /essential functions/i,
  /the (?:role|opportunity|job)/i,
  /about the role/i,
  /you will/i,
  /position summary/i,
  /job description/i,
];

const STOP_HEADINGS = [
  /benefits/i,
  /compensation/i,
  /salary/i,
  /equal opportunit/i,
  /about (?:us|the company)/i,
  /our (?:company|mission|culture)/i,
  /how to apply/i,
  /apply now/i,
  /perks/i,
];

function looksLikeHeading(line: string): {
  kind: "requirements" | "responsibilities" | "stop" | null;
} {
  const candidate = stripBullet(line).replace(/[:•·-]+$/, "").trim();
  if (!candidate || candidate.length > 64) return { kind: null };
  const words = candidate.split(/\s+/).length;
  if (words > 9) return { kind: null };
  if (STOP_HEADINGS.some((rx) => rx.test(candidate))) return { kind: "stop" };
  if (REQUIREMENT_HEADINGS.some((rx) => rx.test(candidate))) return { kind: "requirements" };
  if (RESPONSIBILITY_HEADINGS.some((rx) => rx.test(candidate))) return { kind: "responsibilities" };
  return { kind: null };
}

export interface SectionSplit {
  requirementLines: string[];
  responsibilityLines: string[];
  requirementText: string;
}

/**
 * Splits a posting into its requirements / responsibilities regions. Postings
 * vary wildly in structure, so this is intentionally forgiving: bullets are
 * collected until the next heading-shaped line shows up, capped per section.
 */
export function splitSections(rawText: string): SectionSplit {
  const lines = toLines(rawText);
  let mode: "none" | "requirements" | "responsibilities" = "none";
  const requirementLines: string[] = [];
  const responsibilityLines: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const heading = looksLikeHeading(line);
    if (heading.kind === "stop") {
      mode = "none";
      continue;
    }
    if (heading.kind === "requirements") {
      mode = "requirements";
      continue;
    }
    if (heading.kind === "responsibilities") {
      mode = "responsibilities";
      continue;
    }
    if (mode === "requirements" && requirementLines.length < 40) {
      const clean = stripBullet(line);
      if (clean.length > 12) requirementLines.push(clean);
    } else if (mode === "responsibilities" && responsibilityLines.length < 40) {
      const clean = stripBullet(line);
      if (clean.length > 12) responsibilityLines.push(clean);
    }
  }

  return {
    requirementLines,
    responsibilityLines,
    requirementText: requirementLines.join("\n").toLowerCase(),
  };
}

/* -------------------------------------------------------------------------- */
/* Metadata extraction                                                        */
/* -------------------------------------------------------------------------- */

const US_STATES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const LOCATION_PATTERN = new RegExp(
  `\\b([A-Z][A-Za-z.'\\-]+(?:\\s+[A-Z][A-Za-z.'\\-]+){0,2}),\\s*(${US_STATES})\\b`,
  "g",
);

const TITLE_TOKEN =
  /\b(coordinator|specialist|manager|engineer|lead|designer|drafter|detailer|technician|director|consultant|analyst|architect|developer|superintendent|virtual design|bim|vdc|revit)\b/i;

const COMPANY_TOKEN =
  /\b(llc|inc\.?|corp\.?|corporation|group|holdings|construction|builders|build|contractors?|contracting|electric(al)?|mechanical|engineering|consultants?|partners|associates|technologies|systems|services|industries|solutions)\b/i;

const NOISE_LINE =
  /^(apply|apply now|easy apply|save|share|report this job|jobs?|search|home|sign in|join now|follow|see more|show more|remote|full[- ]time|part[- ]time|contract|temporary|internship|\d+ (?:applicants?|days? ago|hours? ago|weeks? ago)|posted .*|reposted .*)$/i;

function scoreTitleLine(line: string, targetTitles: string[]): number {
  const clean = line.trim();
  if (!clean || clean.length > 110) return 0;
  if (NOISE_LINE.test(clean)) return 0;
  const words = clean.split(/\s+/);
  if (words.length > 12) return 0;
  if (/[.!?]$/.test(clean) && words.length > 6) return 0;
  if (/^https?:|@|^\d/.test(clean)) return 0;
  let score = 0;
  if (TITLE_TOKEN.test(clean)) score += 3;
  if (targetTitles.some((t) => clean.toLowerCase().includes(t.toLowerCase()))) score += 4;
  if (/,|·|\|/.test(clean)) score -= 1;
  if (words.length <= 6) score += 1;
  if (/\b(senior|sr\.?|lead|principal|staff)\b/i.test(clean)) score += 1;
  return score;
}

export function extractTitle(
  lines: string[],
  targetTitles: string[],
): { title: string; confidence: number } {
  const labelled = lines
    .slice(0, 40)
    .map((line) =>
      /^\s*(?:job\s*title|position\s*title|title|position|role)\s*[:\-–]\s*(.+)$/i.exec(line),
    )
    .find(Boolean);
  if (labelled?.[1]?.trim()) {
    return { title: labelled[1].trim(), confidence: 0.95 };
  }

  let best = { title: "", score: 0, index: Number.POSITIVE_INFINITY };
  lines.slice(0, 20).forEach((line, index) => {
    const score = scoreTitleLine(line, targetTitles);
    if (score > best.score || (score === best.score && score > 0 && index < best.index)) {
      best = { title: line.trim(), score, index };
    }
  });

  if (!best.title) return { title: "Unspecified role", confidence: 0 };
  const confidence = Math.min(0.9, 0.45 + best.score * 0.06) * (best.index <= 1 ? 1 : 0.9);
  return { title: best.title.replace(/[·|].*$/, "").trim(), confidence };
}

export function extractCompany(lines: string[]): string {
  const explicit =
    /^\s*(?:company|employer|organisation|organization|firm|agency|studio|practice)\s*[:\-–]\s*(.+)$/im.exec(
      lines.slice(0, 40).join("\n"),
    );
  if (explicit?.[1]?.trim()) return explicit[1].trim().replace(/\s*[·|]\s*$/, "");

  // LinkedIn-style: line 2 reads "Company · Location · 2 weeks ago".
  for (const index of [1, 2, 3, 0]) {
    const line = lines[index];
    if (!line) continue;
    const parts = line
      .split(/\s+[·|]\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const candidate = parts.find(
      (part) =>
        !NOISE_LINE.test(part) &&
        !LOCATION_PATTERN.test(part) &&
        !/^(remote|hybrid|on-?site|in-?office)\b/i.test(part) &&
        !/ago$/.test(part),
    );
    LOCATION_PATTERN.lastIndex = 0;
    if (candidate && candidate.length <= 60) return candidate;
  }
  LOCATION_PATTERN.lastIndex = 0;

  const tokenLine = lines
    .slice(0, 14)
    .filter((line) => !BULLET_PREFIX.test(line) && !/\.\s*$/.test(line.trim()))
    .find((line) => COMPANY_TOKEN.test(line) && line.trim().length <= 70 && !NOISE_LINE.test(line));
  if (tokenLine) return tokenLine.trim().replace(/[·|].*$/, "").trim();

  return "Unknown company";
}

export function extractLocation(lines: string[]): string {
  const head = lines.slice(0, 25);

  // An explicitly labelled line wins: "Location: Remote - United States".
  const labelled = head
    .map((line) =>
      /^\s*(?:location|locations|work\s*location|work\s*arrangement|based\s*in|office)\s*[:\-–]\s*(.+)$/i.exec(
        line,
      ),
    )
    .find(Boolean);
  if (labelled?.[1]?.trim()) return labelled[1].trim().replace(/\s*[·|]\s*$/, "");

  const haystack = head.join("\n");
  const counts = new Map<string, number>();
  let match: RegExpExecArray | null;
  LOCATION_PATTERN.lastIndex = 0;
  while ((match = LOCATION_PATTERN.exec(haystack)) !== null) {
    const city = `${match[1].trim()}, ${match[2].toUpperCase()}`;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked[0]?.[0]) return ranked[0][0];

  const remoteLine = head.find((line) => /\bremote\b/i.test(line));
  if (remoteLine) {
    const clean = remoteLine
      .split(/\s+[·|]\s+/)[0]
      .replace(/^[^:]{0,30}:\s*/, "")
      .trim();
    if (clean.length && clean.length <= 60) return clean;
  }
  if (/\bunited states\b/i.test(haystack)) return "United States";
  if (/\bpacific northwest\b/i.test(haystack)) return "Pacific Northwest";
  return "Unspecified";
}

export function extractWorkMode(rawText: string): { workMode: WorkMode; evidence: string } {
  const text = rawText.toLowerCase();
  const negatedRemote =
    /\bnot\s+(?:a\s+)?remote\b/.test(text) ||
    /\bno\s+remote\b/.test(text) ||
    /\bremote\s+is\s+not\b/.test(text) ||
    /\bnot\s+(?:a\s+)?work[- ]from[- ]home\b/.test(text);

  const hybrid = /\bhybrid\b/.test(text);
  const remote =
    /\b(?:fully|100%)\s*remote\b/.test(text) ||
    /\bremote\s+(?:position|role|work|opportunity|first)\b/.test(text) ||
    /\bwork\s+from\s+home\b/.test(text) ||
    /\bwfh\b/.test(text) ||
    /\btelecommut\w*\b/.test(text) ||
    /\bremote\b/.test(text);
  const onsite = /\b(?:on[- ]?site|in[- ]office|in\s+person|office\s+days?)\b/.test(text);

  const evidenceFor = (rx: RegExp): string => {
    const match = rx.exec(text);
    if (!match) return "";
    const start = Math.max(0, match.index - 40);
    return rawText
      .slice(start, Math.min(rawText.length, match.index + 90))
      .replace(/\s+/g, " ")
      .trim();
  };

  if (hybrid) return { workMode: "Hybrid", evidence: evidenceFor(/\bhybrid\b/) };
  if (remote && !negatedRemote && onsite) {
    return {
      workMode: "Hybrid",
      evidence: `Offers both remote and on-site: ${evidenceFor(/\bremote\b/)}`,
    };
  }
  if (remote && !negatedRemote) {
    return { workMode: "Remote", evidence: evidenceFor(/\bremote\b/) };
  }
  if (onsite) {
    return {
      workMode: "In-Office",
      evidence: evidenceFor(/\b(?:on[- ]?site|in[- ]office|in\s+person)\b/),
    };
  }
  return { workMode: "Unspecified", evidence: "" };
}

export function extractSeniority(rawText: string): string {
  if (/\b(?:principal|staff|director|head of|vice president|vp)\b/i.test(rawText)) {
    return "Principal / Director";
  }
  if (/\b(?:senior|sr\.?|lead|manager)\b/i.test(rawText)) return "Senior / Lead";
  if (/\b(?:junior|jr\.?|entry[- ]level|intern|graduate)\b/i.test(rawText)) return "Early career";
  return "Mid-level";
}

export function extractEmploymentType(rawText: string): string {
  const found: string[] = [];
  const table: [RegExp, string][] = [
    [/\bfull[- ]time\b/i, "Full-time"],
    [/\bcontract[- ]to[- ]hire\b|\bc2h\b/i, "Contract-to-hire"],
    [/\bcontract\b|\bfreelance\b/i, "Contract"],
    [/\bpart[- ]time\b/i, "Part-time"],
    [/\btemporary\b|\btemp\b/i, "Temporary"],
  ];
  for (const [rx, label] of table) {
    if (rx.test(rawText) && !found.includes(label)) found.push(label);
  }
  return found.length ? found.slice(0, 2).join(" / ") : "Unspecified";
}

export function extractSalary(rawText: string): string {
  const match =
    /\$\s?\d{2,3}(?:,\d{3})?(?:\.\d{2})?(?:\s?[-–]\s?\$?\d{2,3}(?:,\d{3})?)?(?:\s?(?:\/|per\s)\s?(?:year|yr|annum|hour|hr|month))?/i.exec(
      rawText,
    );
  return match ? match[0].replace(/\s+/g, " ").trim() : "";
}

export function extractSource(rawText: string): string {
  const table: [RegExp, string][] = [
    [/linkedin/i, "LinkedIn"],
    [/indeed/i, "Indeed"],
    [/ziprecruiter/i, "ZipRecruiter"],
    [/glassdoor/i, "Glassdoor"],
    [/\bagc\b|associated general contractors/i, "AGC"],
    [/constructionjobs|buildzoom|enr\.com/i, "Construction job board"],
    [/greenhouse\.io|lever\.co|workday/i, "Company ATS"],
  ];
  for (const [rx, label] of table) if (rx.test(rawText)) return label;
  return "Pasted text";
}

/* -------------------------------------------------------------------------- */
/* Profile index                                                              */
/* -------------------------------------------------------------------------- */

export interface ProfileFact {
  /** Human label used for evidence, e.g. "Skills · Automation, Code & Tooling". */
  source: string;
  text: string;
}

/**
 * Flattens the Master Profile into labelled, searchable facts. Keyword hits are
 * reported against these labels so the user can see exactly which line of the
 * profile backs a match — and, more importantly, which line does not exist.
 */
export function buildProfileFacts(profile: MasterProfile): ProfileFact[] {
  const facts: ProfileFact[] = [];
  const { header, targetMarket } = profile;

  facts.push({ source: "Headline", text: `${header.name} — ${header.headline}` });
  if (header.altHeadlines.length) {
    facts.push({ source: "Alternate headlines", text: header.altHeadlines.join(" — ") });
  }
  facts.push({ source: "Location line", text: `${header.location} · ${header.locationNote}` });
  facts.push({ source: "Core pitch", text: profile.pitch });
  facts.push({ source: "Focus pitches", text: Object.values(profile.pitchVariants).join(" — ") });
  facts.push({
    source: "Target market",
    text: [targetMarket.label, ...targetMarket.locations, ...targetMarket.workModes, ...targetMarket.titles].join(" · "),
  });

  for (const group of profile.skillGroups) {
    for (const item of group.items) {
      facts.push({
        source: `Skills · ${group.title}`,
        text: [item.term, ...(item.tags ?? [])].join(" · "),
      });
    }
  }

  for (const role of profile.roles) {
    facts.push({
      source: `Experience · ${role.company}`,
      text: `${role.role} · ${role.company} · ${role.location} · ${role.dates}`,
    });
    for (const bullet of role.bullets) {
      facts.push({
        source: `Experience · ${role.company} · ${bullet.label || "bullet"}`,
        text: [bullet.label, bullet.text, ...(bullet.tags ?? [])].join(" · "),
      });
    }
  }

  for (const project of profile.projects) {
    facts.push({ source: `Project · ${project.name}`, text: `${project.name} · ${project.meta}` });
    project.bullets.forEach((bullet, index) => {
      facts.push({
        source: `Project · ${project.name} · bullet ${index + 1}`,
        text: [bullet.text, ...(bullet.tags ?? [])].join(" · "),
      });
    });
  }

  profile.education.forEach((entry, index) =>
    facts.push({ source: `Education ${index + 1}`, text: entry.text }),
  );
  profile.certifications.forEach((entry, index) =>
    facts.push({ source: `Certification ${index + 1}`, text: entry.text }),
  );
  profile.background.forEach((entry, index) =>
    facts.push({ source: `Background ${index + 1}`, text: entry.text }),
  );

  return facts;
}

/* -------------------------------------------------------------------------- */
/* Keyword scanning                                                           */
/* -------------------------------------------------------------------------- */

export function scanKeywords(
  rawText: string,
  facts: ProfileFact[],
  requirementText: string,
): KeywordHit[] {
  const haystack = rawText.toLowerCase();
  const hits: KeywordHit[] = [];

  for (const entry of SKILL_LEXICON) {
    let mentions = 0;
    const matchedAliases: string[] = [];
    for (const alias of entry.aliases) {
      const found = countAlias(haystack, alias);
      if (found > 0) {
        mentions += found;
        matchedAliases.push(alias);
      }
    }
    if (mentions === 0) continue;

    const inRequirements = entry.aliases.some((alias) => countAlias(requirementText, alias) > 0);

    const evidence: string[] = [];
    for (const fact of facts) {
      const factText = fact.text.toLowerCase();
      if (entry.aliases.some((alias) => countAlias(factText, alias) > 0)) {
        evidence.push(fact.source);
      }
    }
    const uniqueEvidence = [...new Set(evidence)].slice(0, 4);

    hits.push({
      term: entry.term,
      category: entry.category,
      mentions,
      weight: entry.weight,
      score: entry.weight * (1 + Math.log(mentions)) * (inRequirements ? 1.35 : 1),
      inProfile: uniqueEvidence.length > 0,
      evidence: uniqueEvidence,
      matchedAliases,
      inRequirements,
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
}

/* -------------------------------------------------------------------------- */
/* Market fit                                                                 */
/* -------------------------------------------------------------------------- */

const PNW_HINTS = [
  "portland",
  "hillsboro",
  "beaverton",
  "gresham",
  "tualatin",
  "salem",
  "vancouver, wa",
  "seattle",
  "tacoma",
  "oregon",
  "washington",
  "pacific northwest",
  ", or",
  ", wa",
  "remote",
  "united states",
  "anywhere",
  "nationwide",
];

export function scoreMarketFit(
  meta: JobMeta,
  keywords: KeywordHit[],
  profile: MasterProfile,
): JobAnalysis["marketFit"] {
  const location = meta.location.toLowerCase();
  const targets = profile.targetMarket.locations.map((entry) => entry.toLowerCase());

  let locationFit: "strong" | "partial" | "weak" = "weak";
  let locationReason: string;

  if (!meta.location || meta.location === "Unspecified") {
    locationFit = "partial";
    locationReason = "The posting does not state a location — confirm before applying.";
  } else if (targets.some((target) => location.includes(target) || target.includes(location))) {
    locationFit = "strong";
    locationReason = `${meta.location} is an explicit target market.`;
  } else if (PNW_HINTS.some((hint) => location.includes(hint))) {
    locationFit = "strong";
    locationReason = `${meta.location} sits inside the Pacific Northwest / remote target.`;
  } else if (/\bunited states\b/i.test(location) || /\bnationwide\b/i.test(location)) {
    locationFit = "partial";
    locationReason = `${meta.location} is a national search rather than a named metro — confirm the reporting office.`;
  } else if (/^[a-z .'-]+,\s*[a-z]{2}$/i.test(meta.location.trim())) {
    locationFit = "weak";
    locationReason = `${meta.location} is outside the target market — lead with the relocation plan.`;
  } else {
    locationReason = `${meta.location} is outside the target market.`;
  }

  let workModeFit: "strong" | "partial" | "weak";
  let workModeReason: string;
  if (meta.workMode === "Unspecified") {
    workModeFit = "partial";
    workModeReason = "Work mode is not stated.";
  } else if (profile.targetMarket.workModes.includes(meta.workMode)) {
    workModeFit = "strong";
    workModeReason = `${meta.workMode} is on the target list.`;
  } else {
    workModeFit = "weak";
    workModeReason = `${meta.workMode} is not a stated target.`;
  }

  const ranks = { strong: 2, partial: 1, weak: 0 } as const;

  /* Role shape: is this posting actually VDC/BIM/field work, or just a job with
     a resume attached? Without this, a residential drafting ad in a hybrid
     office scores as a perfect market fit purely on location and work mode. */
  const TARGET_CATEGORIES = new Set(["VDC / BIM", "Field & Delivery", "Automation & Code"]);
  const totalWeight = keywords.reduce((sum, hit) => sum + hit.score, 0);
  const targetWeight = keywords
    .filter((hit) => TARGET_CATEGORIES.has(hit.category))
    .reduce((sum, hit) => sum + hit.score, 0);
  const share = totalWeight > 0 ? targetWeight / totalWeight : 0;

  const byCategory = new Map<string, number>();
  for (const hit of keywords) {
    byCategory.set(hit.category, (byCategory.get(hit.category) ?? 0) + hit.score);
  }
  const dominant = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "nothing";

  let roleShape: "strong" | "partial" | "weak";
  let roleReason: string;
  if (keywords.length === 0) {
    roleShape = "partial";
    roleReason = "No tracked vocabulary found in the posting.";
  } else if (share >= 0.6) {
    roleShape = "strong";
    roleReason = `${Math.round(share * 100)}% of the posting's vocabulary is VDC/BIM, field or automation work.`;
  } else if (share >= 0.35) {
    roleShape = "partial";
    roleReason = `Only ${Math.round(share * 100)}% of the vocabulary is VDC/BIM, field or automation; the posting also leans on ${dominant}.`;
  } else {
    roleShape = "weak";
    roleReason = `Only ${Math.round(share * 100)}% of the vocabulary is VDC/BIM, field or automation — this reads as a ${dominant} role, not a VDC role.`;
  }

  const combined = ranks[locationFit] + ranks[workModeFit] + ranks[roleShape];
  const headline =
    combined >= 5 ? "Strong market target" : combined >= 3 ? "Workable target" : "Outside the target market";

  return {
    location: locationFit,
    workMode: workModeFit,
    roleShape,
    headline,
    detail: `${locationReason} ${workModeReason} ${roleReason}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

export function analyzeJobPosting(rawText: string, profile: MasterProfile): JobAnalysis {
  const lines = toLines(rawText);
  const sections = splitSections(rawText);
  const title = extractTitle(lines, profile.targetMarket.titles);
  const workMode = extractWorkMode(rawText);

  const meta: JobMeta = {
    title: title.title,
    titleConfidence: title.confidence,
    company: extractCompany(lines),
    location: extractLocation(lines),
    workMode: workMode.workMode,
    workModeEvidence: workMode.evidence,
    seniority: extractSeniority(rawText),
    employmentType: extractEmploymentType(rawText),
    salary: extractSalary(rawText),
    source: extractSource(rawText),
    wordCount: rawText.trim() ? rawText.trim().split(/\s+/).length : 0,
  };

  const facts = buildProfileFacts(profile);
  const keywords = scanKeywords(rawText, facts, sections.requirementText);
  const matched = keywords.filter((hit) => hit.inProfile);
  const missing = keywords.filter((hit) => !hit.inProfile);

  const totalWeight = keywords.reduce((sum, hit) => sum + hit.score, 0);
  const coveredWeight = matched.reduce((sum, hit) => sum + hit.score, 0);
  const rawScore = totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0;

  // A missing top-three keyword is disqualifying in an ATS screen, so it is
  // priced in on top of the weighted coverage number.
  const criticalGaps = keywords.slice(0, 3).filter((hit) => !hit.inProfile).length;
  const matchScore = Math.max(0, Math.min(100, Math.round(rawScore - criticalGaps * 4)));

  return {
    rawText,
    meta,
    keywords,
    matched,
    missing,
    requirementLines: sections.requirementLines,
    responsibilityLines: sections.responsibilityLines,
    matchScore,
    marketFit: scoreMarketFit(meta, keywords, profile),
  };
}

/* -------------------------------------------------------------------------- */
/* Keyword highlighting                                                       */
/* -------------------------------------------------------------------------- */

export interface TextSegment {
  text: string;
  match: boolean;
}

function isWordBoundary(text: string, index: number, length: number): boolean {
  const before = index === 0 ? "" : text[index - 1];
  const after = index + length >= text.length ? "" : text[index + length];
  const isWordChar = (char: string) => /[a-z0-9]/.test(char);
  return !isWordChar(before) && !isWordChar(after);
}

/**
 * Splits text into matched / unmatched runs so the preview can mark the phrases
 * that came straight out of the posting. Longest alternative wins, and matches
 * respect word boundaries so "revit" does not fire inside "revitx".
 */
export function highlightSegments(text: string, terms: string[]): TextSegment[] {
  const needles = [
    ...new Set(terms.map((term) => term.trim().toLowerCase()).filter((term) => term.length >= 2)),
  ].sort((a, b) => b.length - a.length);

  if (!text) return [];
  if (!needles.length) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const segments: TextSegment[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    let bestIndex = -1;
    let bestLength = 0;

    for (const needle of needles) {
      let from = cursor;
      for (;;) {
        const index = lower.indexOf(needle, from);
        if (index === -1) break;
        if (isWordBoundary(lower, index, needle.length)) {
          const isBetter =
            bestIndex === -1 ||
            index < bestIndex ||
            (index === bestIndex && needle.length > bestLength);
          if (isBetter) {
            bestIndex = index;
            bestLength = needle.length;
          }
          break;
        }
        from = index + 1;
      }
    }

    if (bestIndex === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (bestIndex > cursor) {
      segments.push({ text: text.slice(cursor, bestIndex), match: false });
    }
    segments.push({ text: text.slice(bestIndex, bestIndex + bestLength), match: true });
    cursor = bestIndex + bestLength;
  }

  return segments.length ? segments : [{ text, match: false }];
}

/** Every surface form (term + aliases) that should be highlighted. */
export function highlightTermsFor(hits: KeywordHit[]): string[] {
  const terms: string[] = [];
  for (const hit of hits) {
    terms.push(hit.term);
    terms.push(...hit.matchedAliases);
  }
  return [...new Set(terms)];
}
