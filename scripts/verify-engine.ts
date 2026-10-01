/**
 * Engine verification.
 *
 *   npm run verify        (tsx scripts/verify-engine.ts)
 *
 * Exercises the analyzer and the tailorer against the sample postings and
 * asserts the invariant that matters most: the tailoring engine may reorder,
 * relabel and re-phrase, but it must never introduce a fact that is not in the
 * Master Profile.
 */

import { createSeedProfile } from "../lib/masterProfileSeed";
import { readFileSync } from "node:fs";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  DOCX_DOCUMENT_XML,
  MARKETING_RESUME_TEXT,
  SUMMARY_ONLY_TEXT,
  VDC_RESUME_TEXT,
} from "./resumeFixtures";
import {
  applyImport,
  extractResumeText,
  importImpact,
  kindOfFile,
  normalizeDocumentText,
  parseResumeText,
  pdfItemsToLines,
  profileDataFromParse,
} from "../lib/resumeImport";
import { analyzeJobPosting, highlightSegments } from "../lib/keywordAnalyzer";
import {
  RESUME_SECTIONS,
  autoFitFontPt,
  estimateFit,
  lastPageFill,
  pageCountFor,
  tailorResume,
  toPlainText,
  TARGET_FILL,
} from "../lib/resumeTailorer";
import {
  applyPageTemplate,
  PAGE_TEMPLATES,
  pageFromTemplate,
  pageTemplateById,
  pageTemplateRows,
  relayoutPage,
} from "../lib/pageTemplates";
import {
  PORTFOLIO_INK,
  SLOT_DRAWN_AS,
  TEXT_STYLES,
  TEXT_STYLE_ORDER,
  applyMark,
  clampMarks,
  resolveTextStyle,
  segmentsOf,
  styleWords,
  textStyleOf,
} from "../lib/textStyles";
import { SAMPLE_POSTINGS } from "../lib/samplePostings";
import { isWholesaleTextChange } from "../lib/utils";
import {
  compassBetween,
  describeTrip,
  fillTileUrl,
  locatePlace,
  migrateMapSettings,
  migrateMapView,
  milesBetween,
  milesPerPixel,
  parseLatLng,
  pixelsForMiles,
  projectIntoView,
  projectMercator,
  tilesForView,
  unprojectMercator,
  viewToFit,
  worldSize,
  zoomForRadius,
  DEFAULT_MAP_SETTINGS,
  DEFAULT_TILE_URL,
  MAX_ZOOM,
  MIN_ZOOM,
  RADIUS_CHOICES,
  TILE_SIZE,
} from "../lib/geo";
import {
  GEOCODE_CACHE_LIMIT,
  geocodeKey,
  localAnswer,
  looksLikePostcode,
  migrateGeocodeCache,
  parseNominatim,
  queuedLookup,
  rememberGeocode,
  searchNominatim,
  type GeocodeHit,
} from "../lib/geocode";
import { GET as geocodeRoute } from "../app/api/geocode/route";
import { describeRate, daysOut, median, percentLabel, pipelineReport } from "../lib/pipeline";
import { WorkspaceProvider } from "../components/WorkspaceProvider";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MediaLibraryPanel, wordCount } from "../components/MediaLibraryPanel";
import { JobMap, plotApplications } from "../components/JobMap";
import { PipelineBoard } from "../components/PipelineBoard";
import { WorkspaceFileCard } from "../components/WorkspaceFileCard";
import { PortfolioInspector } from "../components/PortfolioInspector";
import { Frame, PadInspector, PortfolioWorkspace } from "../components/PortfolioWorkspace";
import {
  flattenEditableDom,
  fromClipboard,
  isBlockedInputType,
  normalizeEditedText,
} from "../lib/sheetText";
import { applyEdits, countEdits, describeEdits } from "../lib/resumeEdits";
import {
  createVersion,
  diffResumes,
  isDuplicateOfLatest,
  jobHashOf,
  pruneVersions,
  versionHash,
} from "../lib/versions";
import {
  asFirstPerson,
  claimedTerms,
  generateCoverLetter,
  letterStatus,
  letterWordCount,
  setLetterParagraph,
  toCoverLetterText,
} from "../lib/coverLetterGenerator";
import {
  DEFAULT_DRAFT,
  STORAGE_KEYS,
  applicationStore,
  buildBackup,
  draftStore,
  migrateApplications,
  migrateDraft,
  migrateProfile,
  migrateVersions,
  parseImport,
  profileStore,
} from "../lib/storage";
import {
  EMPHASIS_HINTS,
  EMPHASIS_IDS,
  EMPHASIS_LABELS,
  emphasisLabel,
  normalizeEmphasis,
} from "../lib/types";
import {
  applicationTimeline,
  calendarEvents,
  completeFollowUp,
  eventsByDate,
  agenda,
  followUpStatus,
  needsChasing,
  normalizeSaveDetails,
  pipelineSummary,
  recordIdFromSearch,
  rescheduleCount,
  rescheduleFollowUp,
  resolveStage,
  snoozeFollowUp,
  validateSaveDetails,
} from "../lib/applications";
import {
  addressToPlace,
  detailPatch,
  pinnedLabel,
  placedAddress,
} from "../lib/applicationDetails";
import {
  DEFAULT_THEME,
  INK_SCHEMES,
  INK_SCHEME_ORDER,
  SCREEN_SIZES,
  TYPE_PAIRINGS,
  TYPE_PAIRING_ORDER,
  TYPE_SCALES,
  TYPE_SCALE_ORDER,
  applyThemeToSheet,
  cleanTheme,
  isDefaultTheme,
  themeOf,
  themeVariables,
  themedTextStyles,
} from "../lib/portfolioTheme";
import {
  cleanContact,
  contactLine,
  formatLinks,
  hasContact,
  isSafeLink,
  parseLinks,
} from "../lib/portfolioContact";
import {
  IMAGE_DIRECTORY,
  WORKSPACE_FILE_NAME,
  imageFileName,
  imageIdFromFileName,
  supportsWorkspaceFolder,
} from "../lib/workspaceFile";
import { buildIcs, escapeIcsText, foldIcsLine, icsEventsFromPipeline } from "../lib/ics";
import {
  CLIPBOARD_KINDS,
  MEDIA_KIND_LABELS,
  assetById,
  addAsset,
  companionsOf,
  createMediaLibrary,
  dropTiesTo,
  filterAssets,
  imageAsset,
  imagesForAssets,
  libraryStats,
  libraryTags,
  MEDIA_LIBRARY_VERSION,
  metricAsset,
  metricsForAssets,
  pairAsset,
  posterAsset,
  removeAsset,
  replaceImage,
  seedFromProfile,
  textAsset,
  textForAssets,
  tieCompanion,
  updateAsset,
  type MediaAsset,
} from "../lib/mediaLibrary";
import {
  applyPresentation,
  availablePresentations,
  framesForPresentation,
  inferPresentation,
  optionAvailability,
  pageAddingPresentations,
  PRESENTATION_OPTIONS,
} from "../lib/presentationOptions";
import {
  PAGE_SIZES,
  PORTFOLIO_CAPABILITIES,
  SUPPORT_LABELS,
  arrangeUnplaced,
  collectImages,
  createBlock,
  createPortfolio,
  createProject,
  BLOCK_SPANS,
  GRID_SPAN,
  MIN_PAD,
  MIN_RULE,
  addPad,
  addSlide,
  addTextSection,
  appendText,
  appendTextToBlock,
  blockPosition,
  blockSpan,
  clampPad,
  clearCoverImage,
  clickClearsTools,
  coverFrames,
  nextCoverSlot,
  createPad,
  PAD_TONES,
  PAD_TONE_ORDER,
  planImageIds,
  plannedFrames,
  defaultRulePad,
  dragPad,
  filmstripGeometry,
  frameAspect,
  frameSlots,
  FRAME_ASPECT,
  moveBlock,
  moveBlockAcrossRows,
  moveBlockTo,
  moveBlockToPage,
  moveProject,
  moveProjectTo,
  moveSlide,
  moveSlideTo,
  pageSummary,
  placeAsset,
  placeAssetAt,
  blocksOnPage,
  pageBlockId,
  planPortfolio,
  portfolioStats,
  removeBlock,
  removePad,
  removeProject,
  removeSlide,
  resolveBlock,
  rowsOf,
  setBlockBodyStyle,
  setBlockLabel,
  setBlockTextMark,
  setBlockTextStyle,
  setBlockCaption,
  setBlockMetric,
  setBlockShape,
  setBlockSlots,
  setBlockSpan,
  setBlockText,
  setBlockTextPlacement,
  setCoverImage,
  setFillPage,
  setPortfolioText,
  setPortfolioTextStyle,
  setSlideText,
  setSlideTextStyle,
  snapPad,
  spanFraction,
  unplaceAsset,
  updatePad,
} from "../lib/portfolio";
import {
  PORTFOLIO_TEMPLATES,
  applyTemplate,
  placedAssetIds,
  templateById,
  templatePreview,
} from "../lib/portfolioTemplates";
import { clampCrop, croppedAspect, dpiVerdict, placedDpi, sourceRect } from "../lib/images";
import type { PagePad, Portfolio, PortfolioBlock, PortfolioImageRef } from "../lib/portfolioTypes";
import {
  migrateMediaLibrary,
  migratePortfolio,
  portfolioStore,
  sameJson,
  subscribe,
  storeChangeIsReal,
  syncedValue,
} from "../lib/storage";
import { bytesToString, stringToBytes, withPageTransitions, countTransitions } from "../lib/pdfPatch";
import {
  FOLLOW_UP_PRESETS,
  addDays,
  addMonths,
  dayOfMonth,
  daysBetween,
  describeOffset,
  endOfMonth,
  fromIsoDate,
  isIsoDate,
  isSameMonth,
  isWeekend,
  monthDays,
  monthLabel,
  monthMatrix,
  relativeDayLabel,
  startOfMonth,
  startOfWeek,
  todayIso,
  toIsoDate,
  weekdayLabels,
} from "../lib/dates";
import type { Emphasis, MasterProfile, SavedApplication, SheetLayout, TailoredResume } from "../lib/types";

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = "") {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const profile: MasterProfile = createSeedProfile();

section("1. Master Profile seed");
check("name is set", profile.header.name.length > 0, profile.header.name);
check("roles present", profile.roles.length >= 2, `${profile.roles.length} roles`);
check("projects present", profile.projects.length >= 2, `${profile.projects.length} projects`);
check("skill groups present", profile.skillGroups.length === 4);
check(
  "every bullet has an id, text and tags",
  profile.roles.every((role) =>
    role.bullets.every(
      (bullet) => bullet.id && bullet.text.length > 20 && (bullet.tags?.length ?? 0) > 0,
    ),
  ),
);
check(
  "every skill item has a term and tags",
  profile.skillGroups.every((group) =>
    group.items.every((item) => item.term.length > 1 && (item.tags?.length ?? 0) > 0),
  ),
);
console.log(
  `  bullets: ${profile.roles.reduce((sum, role) => sum + role.bullets.length, 0)} experience, ` +
    `${profile.projects.reduce((sum, project) => sum + project.bullets.length, 0)} project`,
);

/* -------------------------------------------------------------------------- */

section("2. Job posting analysis");
const analyses = SAMPLE_POSTINGS.map((posting) => ({
  posting,
  analysis: analyzeJobPosting(posting.text, profile),
}));

const expectations: Record<
  string,
  { title: string; company: string; workMode: string; location: string }
> = {
  sample_pdx_vdc: {
    title: "VDC Coordinator",
    company: "Hoffman Structures Northwest",
    workMode: "Hybrid",
    location: "Portland, OR",
  },
  sample_remote_automation: {
    title: "BIM Automation Specialist / VDC Developer",
    company: "Layton Digital Delivery",
    workMode: "Remote",
    location: "Remote - United States",
  },
  sample_datacenter: {
    title: "Senior MEP / VDC Coordination Lead",
    company: "Cascade Mission Systems, Inc.",
    workMode: "In-Office",
    location: "Hillsboro, OR",
  },
  sample_offtarget: {
    title: "Architectural Draftsperson",
    company: "Beaux Arts Studio Collaborative",
    workMode: "In-Office",
    location: "Charleston, SC",
  },
};

for (const { posting, analysis } of analyses) {
  const expected = expectations[posting.id];
  console.log(
    `  ${posting.label}\n    title="${analysis.meta.title}" (${Math.round(analysis.meta.titleConfidence * 100)}%)` +
      ` company="${analysis.meta.company}" location="${analysis.meta.location}" mode=${analysis.meta.workMode}` +
      `\n    keywords=${analysis.keywords.length} matched=${analysis.matched.length} gaps=${analysis.missing.length}` +
      ` matchScore=${analysis.matchScore}% marketFit=${analysis.marketFit.headline}`,
  );
  check(`${posting.id}: title`, analysis.meta.title === expected.title, analysis.meta.title);
  check(`${posting.id}: company`, analysis.meta.company === expected.company, analysis.meta.company);
  check(`${posting.id}: work mode`, analysis.meta.workMode === expected.workMode, analysis.meta.workMode);
  check(`${posting.id}: location`, analysis.meta.location === expected.location, analysis.meta.location);
  check(`${posting.id}: keywords found`, analysis.keywords.length >= 3, `${analysis.keywords.length}`);
  check(`${posting.id}: matchScore in range`, analysis.matchScore >= 0 && analysis.matchScore <= 100);
  check(
    `${posting.id}: matched + missing = keywords`,
    analysis.matched.length + analysis.missing.length === analysis.keywords.length,
  );
  check(
    `${posting.id}: requirements parsed`,
    analysis.requirementLines.length >= 4,
    `${analysis.requirementLines.length}`,
  );
}

check(
  "target roles outscore the deliberate non-match",
  analyses[0].analysis.matchScore > analyses[3].analysis.matchScore &&
    analyses[2].analysis.matchScore > analyses[3].analysis.matchScore,
  analyses.map((entry) => entry.analysis.matchScore).join(" / "),
);
check(
  "the off-target posting is flagged as out of market",
  analyses[3].analysis.marketFit.headline === "Outside the target market",
  analyses[3].analysis.marketFit.headline,
);
check(
  "the Portland posting is a strong market target",
  analyses[0].analysis.marketFit.headline === "Strong market target",
  analyses[0].analysis.marketFit.headline,
);

/* -------------------------------------------------------------------------- */

section("3. Tailoring engine");
const intensities = [20, 60, 90];
const emphases: Emphasis[] = ["balanced", "technical", "delivery"];
const resumes: { key: string; resume: TailoredResume }[] = [];

for (const { posting, analysis } of analyses) {
  for (const intensity of intensities) {
    for (const emphasis of emphases) {
      const key = `${posting.id}/${intensity}/${emphasis}`;
      const resume = tailorResume(profile, analysis, {
        intensity,
        emphasis,
        fontPt: 9.3,
        showKeywordMarks: true,
        layout: "page",
      });
      resumes.push({ key, resume });

      const fit = estimateFit(resume, resume.options.fontPt);
      check(
        `${key}: experience bullets preserved`,
        resume.roles.every(
          (role, index) => role.bullets.length === profile.roles[index].bullets.length,
        ),
      );
      check(
        `${key}: skill items never dropped`,
        resume.skillGroups.reduce((sum, group) => sum + group.items.length, 0) >=
          profile.skillGroups.reduce((sum, group) => sum + group.items.length, 0),
      );
      check(
        `${key}: fits one page at the effective type size`,
        fit.fill <= TARGET_FILL + 0.005,
        `fill ${fit.fill.toFixed(3)} at ${resume.options.fontPt}pt`,
      );
      check(
        `${key}: ATS audit produced`,
        resume.ats.checks.length >= 8 && resume.ats.score > 0,
        `checks=${resume.ats.checks.length} score=${resume.ats.score}`,
      );
    }
  }
}
console.log(`  ${resumes.length} tailored variants produced without error`);

const baseline = resumes.find((entry) => entry.key === "sample_pdx_vdc/20/balanced")!.resume;
const balanced = resumes.find((entry) => entry.key === "sample_pdx_vdc/60/balanced")!.resume;
const aggressive = resumes.find((entry) => entry.key === "sample_pdx_vdc/90/balanced")!.resume;

check(
  "intensity reorders bullets or skill categories",
  JSON.stringify(baseline.roles.map((role) => role.bullets.map((bullet) => bullet.id))) !==
    JSON.stringify(aggressive.roles.map((role) => role.bullets.map((bullet) => bullet.id))) ||
    JSON.stringify(baseline.skillGroups.map((group) => group.id)) !==
      JSON.stringify(aggressive.skillGroups.map((group) => group.id)),
);
check("intensity changes the summary", baseline.summary !== aggressive.summary);
check(
  "aggressive mode adds a match statement",
  aggressive.summary.includes("Direct overlap with this posting"),
);
check("baseline mode keeps the stored pitch verbatim", baseline.summary === profile.pitch);
check(
  "aggressive mode reuses posting phrasing in labels or skills",
  aggressive.notes.some((note) => note.includes("->") || note.includes("exact-phrase")),
  aggressive.notes.join(" | ").slice(0, 200),
);
console.log(`  skill order 20%: ${baseline.skillGroups.map((group) => group.title).join(" > ")}`);
console.log(`  skill order 60%: ${balanced.skillGroups.map((group) => group.title).join(" > ")}`);
console.log(
  `  skill order 90%: ${aggressive.skillGroups.map((group) => group.title).join(" > ")}`,
);

const automationRun = resumes.find((entry) => entry.key === "sample_pdx_vdc/60/technical")!.resume;
const fieldRun = resumes.find((entry) => entry.key === "sample_pdx_vdc/60/delivery")!.resume;
check("emphasis changes the summary", automationRun.summary !== fieldRun.summary);
console.log(
  `  headline (automation bias): ${automationRun.header.headline}\n  headline (field bias):      ${fieldRun.header.headline}`,
);



/* -------------------------------------------------------------------------- */

section("4. No-fabrication invariant");
const profileSentences = new Set(
  [
    ...profile.roles.flatMap((role) =>
      role.bullets.flatMap((bullet) => [
        bullet.text,
        ...(bullet.variants ?? []).map((variant) => variant.text),
      ]),
    ),
    ...profile.projects.flatMap((project) =>
      project.bullets.flatMap((bullet) => [
        bullet.text,
        ...(bullet.variants ?? []).map((variant) => variant.text),
      ]),
    ),
  ].map((text) => text.trim().toLowerCase()),
);
const profileSkillTerms = new Set(
  profile.skillGroups.flatMap((group) => group.items.map((item) => item.term.toLowerCase())),
);

for (const { key, resume } of resumes) {
  const strayBullets = [
    ...resume.roles.flatMap((role) => role.bullets.map((bullet) => bullet.text)),
    ...resume.projects.flatMap((project) => project.bullets.map((bullet) => bullet.text)),
  ].filter((text) => !profileSentences.has(text.trim().toLowerCase()));
  check(
    `${key}: every bullet is verbatim profile prose`,
    strayBullets.length === 0,
    strayBullets[0] ?? "",
  );

  const matchedTerms = new Set(resume.ats.keywordLines.map((term) => term.toLowerCase()));
  const straySkills = resume.skillGroups
    .flatMap((group) => group.items)
    .filter(
      (term) => !profileSkillTerms.has(term.toLowerCase()) && !matchedTerms.has(term.toLowerCase()),
    );
  check(
    `${key}: every skill term traces to the profile or a matched posting term`,
    straySkills.length === 0,
    straySkills.join(", "),
  );
}
console.log("  all output text traces back to the Master Profile");

/* -------------------------------------------------------------------------- */

section("5. One-page guard and plain-text export");
for (const { posting, analysis } of analyses) {
  const resume = tailorResume(profile, analysis, {
    intensity: 90,
    emphasis: "balanced",
    fontPt: 10.4,
    showKeywordMarks: false,
      layout: "page",
  });
  const best = autoFitFontPt({
    summary: resume.summary,
    skillGroups: resume.skillGroups,
    roles: resume.roles,
    projects: resume.projects,
    certifications: resume.certifications,
  });
  const fitAtBest = estimateFit(resume, best);
  console.log(
    `  ${posting.id}: auto-fit ${best}pt -> ${(fitAtBest.fill * 100).toFixed(0)}% of the page`,
  );
  check(`${posting.id}: auto-fit lands on one page`, !fitAtBest.overflows);
}

const plain = toPlainText(resumes[0].resume);
for (const heading of [
  "EXECUTIVE SUMMARY",
  "TECHNICAL SKILLS",
  "PROFESSIONAL EXPERIENCE",
  "KEY AUTOMATION PROJECTS",
  "CERTIFICATIONS & BACKGROUND",
]) {
  check(`plain text contains ${heading}`, plain.includes(heading));
}

/* -------------------------------------------------------------------------- */

section("6. Keyword highlighting");
const segments = highlightSegments("Run federated Model Coordination in Navisworks Manage.", [
  "navisworks",
  "model coordination",
]);
check("highlighting marks both matched runs", segments.filter((s) => s.match).length === 2);
check(
  "highlighting preserves the original text",
  segments.map((s) => s.text).join("") ===
    "Run federated Model Coordination in Navisworks Manage.",
);
check(
  "highlighting respects word boundaries",
  highlightSegments("Revitx is not Revit.", ["revit"]).filter((s) => s.match).length === 1,
);

/* -------------------------------------------------------------------------- */

section("7. Storage round-trip (localStorage + JSON import/export)");
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
  dispatchEvent: () => true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: (handler: () => void, timeout: number) => setTimeout(handler, timeout),
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
};

const storage = {
  DEFAULT_DRAFT,
  STORAGE_KEYS,
  applicationStore,
  buildBackup,
  draftStore,
  migrateProfile,
  parseImport,
  profileStore,
};

const written = storage.profileStore.write({ ...profile, pitch: "Patched pitch for the round trip." });
check("profile writes to localStorage", written && store.has(storage.STORAGE_KEYS.profile));
const reread = storage.profileStore.read();
check("profile reads back", reread.pitch === "Patched pitch for the round trip.");
check("round trip keeps every role", reread.roles.length === profile.roles.length);
check("round trip keeps every skill", reread.skillGroups.length === profile.skillGroups.length);

storage.draftStore.write({ ...storage.DEFAULT_DRAFT, rawText: "a posting", intensity: 75 });
check("draft round-trips", storage.draftStore.read().intensity === 75);

const saved: SavedApplication = {
  id: "app_test",
  savedAt: new Date().toISOString(),
  jobTitle: analyses[0].analysis.meta.title,
  company: analyses[0].analysis.meta.company,
  location: analyses[0].analysis.meta.location,
  workMode: analyses[0].analysis.meta.workMode,
  matchScore: analyses[0].analysis.matchScore,
  intensity: 60,
  emphasis: "balanced",
  rawJobText: SAMPLE_POSTINGS[0].text,
  resume: resumes[0].resume,
  edits: {},
  notes: "round trip",
  stage: "Applied",
};
storage.applicationStore.write([saved]);
const apps = storage.applicationStore.read();
check("applications round-trip", apps.length === 1 && apps[0].stage === "Applied");
check("frozen snapshot survives", apps[0].resume.roles.length === profile.roles.length);

const backup = JSON.stringify(storage.buildBackup());
const parsed = storage.parseImport(backup);
check("backup parses back", parsed.ok && parsed.kind === "bundle");
if (parsed.ok && parsed.kind === "bundle") {
  check("backup restores saved applications", parsed.bundle.applications.length === 1);
  check("backup restores the draft", parsed.bundle.draft.intensity === 75);
}

const bareProfile = JSON.stringify(profile);
const parsedBare = storage.parseImport(bareProfile);
check("bare profile parses as a profile", parsedBare.ok && parsedBare.kind === "profile");
check("garbage is rejected", storage.parseImport("{not json").ok === false);
check(
  "an unrelated object is rejected",
  storage.parseImport('{"hello":"world"}').ok === false,
);

/* -------------------------------------------------------------------------- */
/* The workspace as a folder                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The folder the app can write to, as far as it can be checked without a browser.
 *
 * `showDirectoryPicker` does not exist in jsdom, so the picking, the writing and the permission prompts are on the
 * manual list rather than in here. What *is* worth pinning is everything around them: the file names, the fact
 * that the bundle written to disk is exactly the bundle Export writes (same function), and that the panel's
 * fallback appears where the API is missing — which is precisely what this process has.
 */
check("the workspace folder is named, not guessed at", (() => {
  return (
    WORKSPACE_FILE_NAME === "workspace.json" &&
    IMAGE_DIRECTORY === "images" &&
    // The id survives the round trip, and the extension says what the file is.
    imageFileName("im-1", "image/png") === "im-1.png" &&
    imageFileName("im-1", "image/jpeg") === "im-1.jpg" &&
    imageFileName("im-1", "image/webp") === "im-1.webp" &&
    // Anything that is not recognised is written as a JPEG, which is what the importer produces.
    imageFileName("im-1", "application/octet-stream") === "im-1.jpg" &&
    imageIdFromFileName("im-1.jpg") === "im-1" &&
    imageIdFromFileName("im-2.webp") === "im-2" &&
    imageIdFromFileName("a.b.c.png") === "a.b.c" &&
    // A name that came from elsewhere cannot escape the folder it is written into.
    imageFileName("../../etc/passwd", "image/png") === ".._.._etc_passwd.png" &&
    imageFileName("", "image/png") === "image.png"
  );
})());

check("what goes in the file is what Export writes, and it stays small", (() => {
  // One writer, two doors: the folder gets `buildBackup()`, byte for byte, and the manual export gets the same
  // thing. If those ever diverged, a folder restored from disk would be a different workspace from a pasted one.
  const text = JSON.stringify(buildBackup(), null, 2);
  const round = parseImport(text);
  const bundle = buildBackup();
  return (
    round.ok &&
    round.kind === "bundle" &&
    // The five things a workspace is, and nothing about the images: the pixels live beside the file.
    Object.keys(bundle).join(",") === "app,version,exportedAt,profile,draft,applications,portfolio,mediaLibrary" &&
    !text.includes("data:image") &&
    text.length < 400_000
  );
})());

check("the folder panel says what this browser cannot do, instead of hiding the button", (() => {
  // jsdom has no `showDirectoryPicker`, which is the same situation as Safari and Firefox — so this is the
  // fallback reading, tested by being in the situation rather than by faking it.
  return supportsWorkspaceFolder() === false;
})());

check("the folder panel renders that situation, rather than rendering nothing", (() => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    Node: g.Node,
    indexedDB: g.indexedDB,
    IS_REACT_ACT_ENVIRONMENT: g.IS_REACT_ACT_ENVIRONMENT,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  try {
    act(() => {
      root.render(
        React.createElement(WorkspaceFileCard, { onOpen: () => {} }),
      );
    });
    act(() => {});
    const html = (container as unknown as { innerHTML: string }).innerHTML;
    const has = (needle: string) => html.includes(needle);
    const buttons = [...dom.window.document.querySelectorAll("button")];
    const disabled = buttons.filter((button) => button.hasAttribute("disabled")).length;
    const facts: [string, boolean][] = [
      ["it says what to use instead", has("use Export and Import below")],
      ["it names the browsers that can", has("Chrome, Edge, Brave and Vivaldi can")],
      ["the buttons are still there", has("Save to a folder…") && has("Open a workspace folder…")],
      // Shown and disabled rather than hidden: a missing button is a mystery, a disabled one is an answer.
      ["and they are disabled", buttons.length >= 2 && disabled === buttons.length],
      ["and it says where the data is meanwhile", has("everything stays in this browser's storage")],
    ];
    for (const [what, ok] of facts) if (!ok) console.log(`    … missing: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})());


check(
  "legacy/partial profiles are migrated, not dropped",
  storage.migrateProfile({ header: { name: "Only A Name" } }).roles.length === profile.roles.length,
);

/* -------------------------------------------------------------------------- */

section("8. Posting-replacement heuristic (when to drop manual corrections)");
const posting = SAMPLE_POSTINGS[0].text;
check("empty box to a pasted posting is a replacement", isWholesaleTextChange("", posting));
check(
  "typing into the box is not a replacement",
  !isWholesaleTextChange("VDC Coordinato", "VDC Coordinator"),
);
check(
  "fixing a typo near the start is not a replacement",
  !isWholesaleTextChange(posting, posting.replace("Hoffman", "Hoffmann")),
);
check(
  "fixing a typo mid-posting is not a replacement",
  !isWholesaleTextChange(posting, posting.replace("Navisworks", "Navisworks Manage")),
);
check("appending another paragraph is not a replacement", !isWholesaleTextChange(posting, `${posting}\nExtra line.`));
check(
  "re-pasting the same posting keeps corrections",
  !isWholesaleTextChange(posting, posting),
);
check(
  "pasting a different posting is a replacement",
  isWholesaleTextChange(posting, SAMPLE_POSTINGS[2].text),
);
check(
  "select-all overwrite is a replacement",
  isWholesaleTextChange(
    posting,
    "Completely different posting text about a different job, long enough to bother analysing properly.",
  ),
);

/* -------------------------------------------------------------------------- */

section("9. Hand edits (the layer that must not change formatting)");
const baseResume = resumes[0].resume;
const targetRole = baseResume.roles[0];
const targetBullet = targetRole.bullets[0];

const summaryEdited = applyEdits(
  baseResume,
  { summary: "Hand-written summary for this posting." },
  { profile, analysis: analyses[0].analysis },
);
check("summary edit replaces the text", summaryEdited.summary === "Hand-written summary for this posting.");
check(
  "summary edit changes nothing else",
  JSON.stringify(summaryEdited.roles) === JSON.stringify(baseResume.roles) &&
    JSON.stringify(summaryEdited.skillGroups) === JSON.stringify(baseResume.skillGroups),
);
check(
  "the source resume is not mutated",
  baseResume.summary !== summaryEdited.summary,
  "applyEdits must be pure",
);
check(
  "editing is recorded in the engine log",
  summaryEdited.notes.some((note) => note.includes("1 manual edit")),
);

const bulletEdited = applyEdits(
  baseResume,
  { roles: { [targetRole.id]: { bullets: { [targetBullet.id]: { text: "Reworded by hand." } } } } },
  { profile, analysis: analyses[0].analysis },
);
check(
  "bullet text is overridden",
  bulletEdited.roles[0].bullets.find((bullet) => bullet.id === targetBullet.id)?.text ===
    "Reworded by hand.",
);
check(
  "an edited bullet is tagged as manual",
  bulletEdited.roles[0].bullets.find((bullet) => bullet.id === targetBullet.id)?.adjustment ===
    "manual",
);
check(
  "bullet order is untouched by an edit",
  bulletEdited.roles[0].bullets.map((bullet) => bullet.id).join() ===
    baseResume.roles[0].bullets.map((bullet) => bullet.id).join(),
);

const hidden = applyEdits(
  baseResume,
  { roles: { [targetRole.id]: { hiddenBullets: [targetBullet.id] } } },
  { profile, analysis: analyses[0].analysis },
);
check(
  "hiding a bullet removes only that bullet",
  hidden.roles[0].bullets.length === baseResume.roles[0].bullets.length - 1 &&
    !hidden.roles[0].bullets.some((bullet) => bullet.id === targetBullet.id),
);

const withMine = applyEdits(
  baseResume,
  {
    roles: {
      [targetRole.id]: {
        addedBullets: [{ id: "mine_1", label: "Scope", text: "Ran the preconstruction model review." }],
      },
    },
  },
  { profile, analysis: analyses[0].analysis },
);
check(
  "a hand-written bullet lands at the end of its block",
  withMine.roles[0].bullets[withMine.roles[0].bullets.length - 1].id === "mine_1",
);
check(
  "a hand-written bullet is flagged manual",
  withMine.roles[0].bullets[withMine.roles[0].bullets.length - 1].adjustment === "manual",
);

const skillsEdited = applyEdits(
  baseResume,
  { skillGroups: { [baseResume.skillGroups[0].id]: ["Navisworks Manage", "Federated Coordination"] } },
  { profile, analysis: analyses[0].analysis },
);
check("skill items can be retyped", skillsEdited.skillGroups[0].items.length === 2);
check(
  "retyped skills are re-wrapped into lines",
  skillsEdited.skillGroups[0].lines.join(" ").includes("Navisworks Manage"),
);

const hiddenSection = applyEdits(
  baseResume,
  { hiddenSections: [RESUME_SECTIONS[3]] },
  { profile, analysis: analyses[0].analysis },
);
check("a hidden section renders empty", hiddenSection.projects.length === 0);
check("hidden sections are recorded", hiddenSection.hiddenSections.includes(RESUME_SECTIONS[3]));

check("edit count adds up", countEdits({ summary: "x", hiddenSections: ["A", "B"] }) === 3);
check(
  "the edit manifest is readable",
  describeEdits({ summary: "x", roles: { r1: { hiddenBullets: ["b1"] } } }).join(" ").includes("summary"),
);

// An edit that removes keywords must *lower* the reported coverage: the audit
// describes the sheet you are looking at, not the one the engine produced.
const before = baseResume.ats.coverage;
const stripped = applyEdits(
  baseResume,
  { summary: "Nothing relevant to the posting at all." },
  { profile, analysis: analyses[0].analysis },
);
check(
  "the audit follows the edited text",
  stripped.ats.coverage <= before,
  `before ${before}, after ${stripped.ats.coverage}`,
);

/* -------------------------------------------------------------------------- */

section("10. Version history");
const v1 = createVersion({
  resume: baseResume,
  edits: {},
  rawText: SAMPLE_POSTINGS[0].text,
  jobTitle: "VDC Coordinator",
  company: "Hoffman Structures Northwest",
  index: 1,
});
check("first version is labelled v1", v1.label === "v1");
check("first version records the starting point", v1.changes.join() === "initial draft");
check("a version captures the posting", v1.jobHash === jobHashOf(SAMPLE_POSTINGS[0].text));
check("a version captures its options", v1.intensity === baseResume.options.intensity);

const v2 = createVersion({
  resume: summaryEdited,
  edits: { summary: "Hand-written summary for this posting." },
  rawText: SAMPLE_POSTINGS[0].text,
  jobTitle: "VDC Coordinator",
  company: "Hoffman Structures Northwest",
  previous: v1,
  index: 2,
});
check("second version is labelled v2", v2.label === "v2");
check(
  "the diff names the change",
  v2.changes.some((change) => change.includes("summary")),
  v2.changes.join(", "),
);
check(
  "the diff counts manual edits",
  v2.changes.some((change) => change.includes("manual edit")),
  v2.changes.join(", "),
);

check("identical states hash identically", versionHash(baseResume, {}) === versionHash(baseResume, {}));
check(
  "a changed summary changes the hash",
  versionHash(baseResume, {}) !== versionHash(summaryEdited, {}),
);
check("duplicate detection against the latest", isDuplicateOfLatest([v1], baseResume, {}));
check(
  "a changed state is not a duplicate",
  !isDuplicateOfLatest([v1], summaryEdited, { summary: "Hand-written summary for this posting." }),
);

const manyVersions = Array.from({ length: 50 }, (_, index) => ({
  ...v1,
  id: `ver_${index}`,
  pinned: index % 10 === 0,
  createdAt: new Date(Date.now() - index * 1000).toISOString(),
}));
const pruned = pruneVersions(manyVersions);
check("the shelf is capped", pruned.length <= 40, `${pruned.length}`);
check(
  "pinned versions survive eviction",
  pruned.filter((version) => version.pinned).length ===
    manyVersions.filter((version) => version.pinned).length,
);

check(
  "posting hashes ignore whitespace and case",
  jobHashOf("  A  Posting \n\n Here ") === jobHashOf("a posting here"),
);
check(
  "the diff reports no change when nothing changed",
  diffResumes(v1, { resume: v1.resume, edits: v1.edits }).join() === "no visible change",
);

/* -------------------------------------------------------------------------- */

section("11. Cover letter");
const letters = [20, 60, 90].map((intensity) =>
  generateCoverLetter(profile, analyses[0].analysis, { emphasis: "balanced", intensity }),
);
const [plainLetter, balancedLetter, aggressiveLetter] = letters;

check("the letter opens with the role and company", (() => {
  const opening = plainLetter.paragraphs[0].text;
  return (
    opening.includes(analyses[0].analysis.meta.title) &&
    opening.includes(analyses[0].analysis.meta.company)
  );
})());
check("the letter says who it is addressed to", plainLetter.salutation === "Dear Hiring Manager,");
check(
  "a recipient name flows through",
  generateCoverLetter(profile, analyses[0].analysis, {
    emphasis: "balanced",
    intensity: 60,
    toName: "Dana Reyes",
  }).salutation === "Dear Dana Reyes,",
);
check("the letter stays to a sensible number of paragraphs", aggressiveLetter.paragraphs.length <= 6);
check(
  "the letter is a sensible length",
  letterWordCount(aggressiveLetter) > 120,
  `${letterWordCount(aggressiveLetter)} words`,
);
check(
  "intensity changes the letter",
  plainLetter.paragraphs.length < aggressiveLetter.paragraphs.length,
);
check(
  "the baseline letter skips the gap paragraph",
  !plainLetter.paragraphs.some((paragraph) => paragraph.kind === "gap"),
);
check(
  "the higher bands name the gaps",
  balancedLetter.paragraphs.some((paragraph) => paragraph.kind === "gap"),
);

// The integrity rule: an uncovered term may appear ONLY inside the paragraph
// that explicitly disclaims it — never among the claims.
const gapTerms = analyses[0].analysis.missing.map((hit) => hit.term);
const isGapParagraph = (kind: string) => kind === "gap";
const claimedText = letters
  .flatMap((letter) =>
    letter.paragraphs.filter((paragraph) => !isGapParagraph(paragraph.kind)).map((p) => p.text),
  )
  .join(" ")
  .toLowerCase();
check(
  "no uncovered term appears among the letter's claims",
  gapTerms.every((term) => !claimedText.includes(term.toLowerCase())),
  gapTerms.filter((term) => claimedText.includes(term.toLowerCase())).join(", "),
);
check(
  "uncovered terms appear only where they are disclaimed",
  balancedLetter.paragraphs
    .filter((paragraph) => isGapParagraph(paragraph.kind))
    .every((paragraph) => paragraph.text.includes("not on my resume")),
);
check(
  "the named gaps are the posting's own gaps",
  aggressiveLetter.gapsNotClaimed.every((term) => gapTerms.includes(term)),
);

// And the user can switch the whole thing off, which keeps even the disclaimed
// terms out of the document.
const silentLetter = generateCoverLetter(profile, analyses[0].analysis, {
  emphasis: "balanced",
  intensity: 60,
  nameGaps: false,
});
const silentBody = silentLetter.paragraphs.map((paragraph) => paragraph.text).join(" ").toLowerCase();
check(
  "with gap-naming off, no uncovered term appears at all",
  gapTerms.every((term) => !silentBody.includes(term.toLowerCase())),
  gapTerms.filter((term) => silentBody.includes(term.toLowerCase())).join(", "),
);
check(
  "the gaps are still reported when they are not named",
  silentLetter.gapsNotClaimed.length === balancedLetter.gapsNotClaimed.length,
);

// Evidence must be the profile's own words.
const profileBulletText = profile.roles
  .flatMap((role) => role.bullets)
  .concat(profile.projects.flatMap((project) => project.bullets))
  .map((bullet) => bullet.text.replace(/\.$/, "").toLowerCase());
const evidence = letters.flatMap((letter) => letter.paragraphs.filter((p) => p.kind === "evidence"));
check(
  "the evidence paragraph quotes the profile verbatim",
  evidence.some((paragraph) =>
    profileBulletText.some((text) => paragraph.text.toLowerCase().includes(text)),
  ),
);
check(
  "claimed terms are all profile-backed",
  claimedTerms(aggressiveLetter, analyses[0].analysis).every((term) =>
    analyses[0].analysis.matched.some((hit) => hit.term === term),
  ),
);
check(
  "verb-first profile bullets become first person",
  asFirstPerson("Run trade coordination and federated clash workflows.").sentence ===
    "I run trade coordination and federated clash workflows.",
);
check(
  "anything else falls back to a neutral frame",
  asFirstPerson("Federated the MEP and electrical fabrication models.").sentence.startsWith(
    "Day to day:",
  ),
);

const editedParagraph = setLetterParagraph(
  aggressiveLetter,
  aggressiveLetter.paragraphs[0].id,
  "Custom opening.",
);
check(
  "a letter paragraph can be rewritten by hand",
  editedParagraph.paragraphs[0].text === "Custom opening." &&
    editedParagraph.paragraphs[1].text === aggressiveLetter.paragraphs[1].text,
);

const letterText = toCoverLetterText(aggressiveLetter, profile);
check("plain-text export carries the salutation", letterText.includes(aggressiveLetter.salutation));
check("plain-text export carries the signature", letterText.includes(profile.header.name));
check("plain-text export carries the company", letterText.includes(aggressiveLetter.company));

/* -------------------------------------------------------------------------- */

/**
 * Bundling the letter with the resume is the one place a letter can reach a
 * recruiter attached to the wrong posting, so the freshness gate is asserted
 * rather than trusted. Without it, loading a new posting leaves the old letter in
 * state and it would ride along under a resume aimed somewhere else.
 */
section("11b. Cover letter freshness (may this letter be bundled?)");

const pdxAnalysis = analyses[0].analysis;
const remoteAnalysis = analyses[1].analysis;

check(
  "a letter written for the loaded posting is attachable",
  letterStatus(aggressiveLetter, pdxAnalysis).state === "current" &&
    letterStatus(aggressiveLetter, pdxAnalysis).attachable,
);
check(
  "the same letter is refused once a different posting is loaded",
  letterStatus(aggressiveLetter, remoteAnalysis).state === "stale" &&
    !letterStatus(aggressiveLetter, remoteAnalysis).attachable,
  `${aggressiveLetter.company} vs ${remoteAnalysis.meta.company}`,
);
check(
  "the refusal names both employers so the user can see what went wrong",
  (() => {
    const { reason } = letterStatus(aggressiveLetter, remoteAnalysis);
    return reason.includes(aggressiveLetter.company) && reason.includes(remoteAnalysis.meta.company);
  })(),
);
check(
  "a letter with no loaded posting is unverifiable, not current",
  letterStatus(aggressiveLetter, null).state === "unverifiable" &&
    !letterStatus(aggressiveLetter, null).attachable,
);
check(
  "with no letter there is nothing to attach",
  letterStatus(null, pdxAnalysis).state === "none" &&
    !letterStatus(null, pdxAnalysis).attachable,
);
check(
  "company matching ignores case and punctuation",
  letterStatus({ ...aggressiveLetter, company: `${aggressiveLetter.company.toUpperCase()},` }, pdxAnalysis)
    .attachable,
);
check(
  "a dial change is reported but does not block the bundle",
  (() => {
    const drifted = letterStatus(aggressiveLetter, pdxAnalysis, {
      intensity: 20,
      emphasis: "technical",
    });
    return drifted.attachable && drifted.reason.includes("90%");
  })(),
  "the letter should say which dials it was written under",
);
check(
  "matching dials add no noise to the reason",
  !letterStatus(aggressiveLetter, pdxAnalysis, { intensity: 90, emphasis: "balanced" }).reason.includes(
    "dials have moved",
  ),
);

/* -------------------------------------------------------------------------- */

check("a truncated fragment is not analysed at all", !isWholesaleTextChange(posting, "too short"));

/* -------------------------------------------------------------------------- */

section("12. Edit-text normalisation (formatting must survive an edit)");
check(
  "nbsp runs from a paste collapse to spaces",
  normalizeEditedText("Ran\u00a0\u00a0the\u00a0model", { multiline: false }) === "Ran the model",
);
check(
  "zero-width characters are stripped",
  normalizeEditedText("Navis\u200bworks", { multiline: false }) === "Navisworks",
);
check(
  "a soft hyphen is stripped",
  normalizeEditedText("co\u00adordination", { multiline: false }) === "coordination",
);
check(
  "newlines collapse to spaces in a single-line field",
  normalizeEditedText("Ran the model\nthen signed off", { multiline: false }) ===
    "Ran the model then signed off",
);
check(
  "newlines survive in a multiline field",
  normalizeEditedText("First line\nSecond line", { multiline: true }) ===
    "First line\nSecond line",
);
check(
  "blank-line runs are capped in a multiline field",
  normalizeEditedText("One\n\n\n\nTwo", { multiline: true }) === "One\n\nTwo",
);
check(
  "trailing whitespace is trimmed",
  normalizeEditedText("  Trade coordination   ", { multiline: false }) === "Trade coordination",
);
check(
  "tabs collapse in a multiline field",
  normalizeEditedText("A\t\tB\nC", { multiline: true }) === "A B\nC",
);
check(
  "CRLF clipboard text is normalised",
  fromClipboard("Line one\r\nLine two", { multiline: true }) === "Line one\nLine two",
);
check(
  "clipboard newlines become spaces for a single-line field",
  fromClipboard("Company\nPortland, OR", { multiline: false }) === "Company Portland, OR",
);
check("a single space is left alone", normalizeEditedText(" ", { multiline: false }) === "");

check("bold is a blocked input type", isBlockedInputType("formatBold"));
check("font name is a blocked input type", isBlockedInputType("formatFontName"));
check("colour is a blocked input type", isBlockedInputType("formatForeColor"));
check("block formatting is blocked", isBlockedInputType("formatBlock"));
check("a horizontal rule is blocked", isBlockedInputType("insertHorizontalRule"));
check("plain typing is not blocked", !isBlockedInputType("insertText"));
check("backspace is not blocked", !isBlockedInputType("deleteContentBackward"));
check("a plain paste is not blocked here (handled by the paste guard)", !isBlockedInputType("insertFromPaste"));
check("an unknown input type is allowed", !isBlockedInputType(undefined));

/* -------------------------------------------------------------------------- */

section("14. Sheet layout modes");
const layoutProfile = createSeedProfile();

for (const { posting, analysis } of analyses) {
  const options = (layout: SheetLayout) => ({
    intensity: 90,
    emphasis: "balanced" as const,
    fontPt: 10.4,
    showKeywordMarks: false,
    layout,
  });

  const pageMode = tailorResume(layoutProfile, analysis, options("page"));
  const continuousMode = tailorResume(layoutProfile, analysis, options("continuous"));

  // One-page mode spends its two levers.
  check(
    `${posting.id}: one-page mode shrinks the type`,
    pageMode.options.fontPt < 10.4,
    `${pageMode.options.fontPt}pt`,
  );

  // Continuous mode spends neither: the type size is exactly what was asked for.
  check(
    `${posting.id}: continuous mode never shrinks the type`,
    continuousMode.options.fontPt === 10.4,
    `${continuousMode.options.fontPt}pt`,
  );
  check(
    `${posting.id}: continuous mode keeps every project`,
    continuousMode.projects.length >= pageMode.projects.length,
    `${continuousMode.projects.length} vs ${pageMode.projects.length}`,
  );
  check(
    `${posting.id}: continuous mode keeps more content than one-page mode`,
    JSON.stringify(continuousMode.projects).length >= JSON.stringify(pageMode.projects).length,
  );
  check(
    `${posting.id}: continuous mode says so in the engine log`,
    continuousMode.notes.some((note) => note.includes("Continuous layout")),
  );

  const pageCheck = pageMode.ats.checks.find((check_) => check_.id === "page-count");
  const continuousCheck = continuousMode.ats.checks.find((check_) => check_.id === "page-count");
  check(`${posting.id}: the check is relabelled`, pageCheck?.label === "One-page fit" && continuousCheck?.label === "Page count");
  check(
    `${posting.id}: a multi-page continuous sheet is not a failure`,
    continuousCheck?.status !== "fail",
    continuousCheck?.detail,
  );
  check(
    `${posting.id}: the continuous audit reports a page count`,
    /page\(s\) at/.test(continuousCheck?.detail ?? ""),
    continuousCheck?.detail,
  );

  const continuousFit = estimateFit(continuousMode, continuousMode.options.fontPt);
  console.log(
    `  ${posting.id}: one-page ${pageMode.options.fontPt}pt / ${continuousMode.projects.length} projects vs ` +
      `continuous 10.4pt → ${pageCountFor(continuousFit.fill)} page(s)`,
  );
  check(
    `${posting.id}: the continuous page count never exceeds two`,
    pageCountFor(continuousFit.fill) <= 2,
    `${pageCountFor(continuousFit.fill)}`,
  );
}

const bloatedForLayout = structuredClone(layoutProfile);
bloatedForLayout.roles = bloatedForLayout.roles.flatMap((role) => [role, structuredClone(role)]);
bloatedForLayout.projects = bloatedForLayout.projects.flatMap((project) => [project, structuredClone(project)]);
const bloatedPage = tailorResume(bloatedForLayout, analyses[0].analysis, {
  intensity: 90,
  emphasis: "balanced",
  fontPt: 10.4,
  showKeywordMarks: false,
  layout: "page",
});
const bloatedContinuous = tailorResume(bloatedForLayout, analyses[0].analysis, {
  intensity: 90,
  emphasis: "balanced",
  fontPt: 10.4,
  showKeywordMarks: false,
  layout: "continuous",
});
const countBullets = (resume: TailoredResume) =>
  resume.roles.reduce((sum, role) => sum + role.bullets.length, 0) +
  resume.projects.reduce((sum, project) => sum + project.bullets.length, 0);

console.log(
  `  bloated profile: one-page keeps ${countBullets(bloatedPage)} bullets at ${bloatedPage.options.fontPt}pt, ` +
    `continuous keeps ${countBullets(bloatedContinuous)} at ${bloatedContinuous.options.fontPt}pt`,
);
check(
  "a bloated profile loses bullets in one-page mode",
  countBullets(bloatedPage) < countBullets(bloatedContinuous),
);
// At 90% the aggressive band still shows only the most relevant projects (a
// targeting decision, not a page-fit cut), so "loses nothing" is asserted where
// that rule is not in play: every experience bullet, at any band.
check(
  "continuous mode keeps every experience bullet, bloated or not",
  bloatedContinuous.roles.every(
    (role, index) => role.bullets.length === bloatedForLayout.roles[index].bullets.length,
  ),
);
check(
  "one-page mode does not, on the same input",
  bloatedPage.roles.some(
    (role, index) => role.bullets.length < bloatedForLayout.roles[index].bullets.length,
  ),
);
const balancedBloated = tailorResume(bloatedForLayout, analyses[0].analysis, {
  intensity: 60,
  emphasis: "balanced",
  fontPt: 10.4,
  showKeywordMarks: false,
  layout: "continuous",
});
check(
  "continuous mode keeps every project when the band is not trimming them",
  balancedBloated.projects.length === bloatedForLayout.projects.length,
  `${balancedBloated.projects.length} of ${bloatedForLayout.projects.length}`,
);

check(
  "page count maths treats a hairline overshoot as one page",
  pageCountFor(1) === 1 && pageCountFor(1.0001) === 1,
);
check("page count maths rolls over past the tolerance", pageCountFor(1.01) === 2);
check("page count maths handles a partial page", pageCountFor(1.4) === 2 && pageCountFor(2.9) === 3);
check("last-page fill reports the final page", Math.abs(lastPageFill(1.4) - 0.4) < 0.0001);
check("last-page fill is the fill itself for a single page", lastPageFill(0.86) === 0.86);

/* -------------------------------------------------------------------------- */

section("15. DOM flattening (a paste cannot restyle the sheet)");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

/** Stands in for the editable <span> inside a bullet. */
const sheetSpan = (html: string) => {
  const element = dom.window.document.createElement("span");
  element.className = "sheet-editable";
  element.innerHTML = html;
  return element;
};

const pasted = sheetSpan(
  '<span style="font-family:Calibri;font-size:11pt;color:#c00">Ran the model</span>' +
    ' <b>and</b> <a href="https://example.com">signed off</a>',
);
flattenEditableDom(pasted, { multiline: false });
check(
  "pasted styling collapses to plain text",
  pasted.textContent === "Ran the model and signed off",
  pasted.textContent ?? "",
);
check("no element survives inside the field", pasted.querySelector("*") === null);
check("the host keeps its own class", pasted.getAttribute("class") === "sheet-editable");

const fontTag = sheetSpan('<font color="red" size="4" face="Times">Legacy markup</font>');
flattenEditableDom(fontTag, { multiline: false });
check("legacy <font> markup collapses", fontTag.textContent === "Legacy markup");
check("no styling attributes are left", fontTag.attributes.length === 1);

const withBreak = sheetSpan("First line<br>Second line");
flattenEditableDom(withBreak, { multiline: true });
check("a line break survives in a multiline field", withBreak.querySelectorAll("br").length === 1);

const singleLineBreak = sheetSpan("Company<br>Portland, OR");
flattenEditableDom(singleLineBreak, { multiline: false });
check(
  "a line break is dropped from a single-line field",
  singleLineBreak.querySelectorAll("br").length === 0 &&
    singleLineBreak.textContent === "CompanyPortland, OR",
);

const nested = sheetSpan("<div><span>one</span></div><div><span>two</span></div>");
flattenEditableDom(nested, { multiline: true });
check(
  "browser-inserted blocks unwrap without losing text or order",
  nested.textContent === "onetwo" && nested.querySelector("*") === null,
  nested.textContent ?? "",
);

const styledRoot = sheetSpan("Text");
styledRoot.setAttribute("style", "font-family:Georgia");
styledRoot.setAttribute("color", "blue");
flattenEditableDom(styledRoot, { multiline: false });
check(
  "a style applied to the field itself is stripped",
  styledRoot.getAttribute("style") === null && styledRoot.getAttribute("color") === null,
);

const emptyThenTyped = sheetSpan("");
emptyThenTyped.textContent = "Typed by hand";
flattenEditableDom(emptyThenTyped, { multiline: false });
check(
  "typing creates no elements at all",
  emptyThenTyped.childNodes.length === 1 &&
    emptyThenTyped.childNodes[0].nodeType === 3 &&
    emptyThenTyped.textContent === "Typed by hand",
);

const nestedBold = sheetSpan("<b><i>Bold italic</i></b>");
flattenEditableDom(nestedBold, { multiline: false });
check(
  "nested formatting is fully unwrapped",
  nestedBold.childNodes.length === 1 && nestedBold.textContent === "Bold italic",
);

/* -------------------------------------------------------------------------- */

/**
 * Layout contract.
 *
 * jsdom performs no layout, so `offsetHeight` is always 0 and the continuous
 * sheet's real geometry cannot be measured here. What *can* be pinned down is the
 * source-level contract that produces it, which is exactly what regressed: the
 * sheet must hug its content instead of padding out to a page, its bottom margin
 * must match the top one, and the element around it must reserve the measured
 * height or the panels below slide underneath.
 */
section("Continuous layout contract");

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

const baseSheet = cssRule(".sheet");
const continuousSheet = cssRule(".sheet--continuous");

/** Reads a CSS box shorthand into [top, right, bottom, left]. */
function boxOf(rule: string, prop: string): number[] | null {
  const line = new RegExp(`${prop}:\\s*([^;]+);`).exec(rule)?.[1];
  if (!line) return null;
  return line
    .trim()
    .split(/\s+/)
    .map((token) => Number.parseFloat(token));
}

/**
 * Top or bottom edge of a box, from a longhand if present and the shorthand
 * otherwise. CSS shorthand order: 1 or 2 values put the vertical edge first, 3 or
 * 4 put the bottom edge third.
 */
function edgeOf(rule: string, prop: string, edge: "top" | "bottom"): number | null {
  const longhand = new RegExp(`${prop}-${edge}:\\s*([\\d.]+)`).exec(rule)?.[1];
  if (longhand) return Number.parseFloat(longhand);
  const box = boxOf(rule, prop);
  if (!box) return null;
  if (edge === "top") return box[0];
  return box[box.length <= 2 ? 0 : 2];
}

const baseTopIn = edgeOf(baseSheet, "padding", "top")!;
check(
  "continuous sheet hugs its content instead of reserving a page",
  /height:\s*auto/.test(continuousSheet) && /min-height:\s*0/.test(continuousSheet),
  continuousSheet.trim() || "rule not found",
);
check(
  "continuous sheet trims to the content, leaving no trailing dead space",
  baseSheet !== "" && /height:\s*11in/.test(baseSheet) && /height:\s*auto/.test(continuousSheet),
);
check(
  "continuous sheet's bottom margin mirrors the top margin",
  edgeOf(continuousSheet, "padding", "bottom") === baseTopIn,
  `top ${baseTopIn}in vs bottom ${edgeOf(continuousSheet, "padding", "bottom")}in`,
);

const printRule = cssRule("@page vdcm-continuous");
const printTopIn = edgeOf(printRule, "margin", "top")!;
const printBottomIn = edgeOf(printRule, "margin", "bottom");
check(
  "printed continuous pages use symmetric top/bottom margins",
  printBottomIn === printTopIn,
  `top ${printTopIn}in vs bottom ${printBottomIn}in`,
);
check(
  "printed continuous pages use the same top margin as the preview",
  printTopIn === baseTopIn,
  `preview ${baseTopIn}in vs print ${printTopIn}in`,
);

const printSheetRule = cssRule(".print-sheet--continuous");
check(
  "printed continuous sheet stays in flow and takes margins from the page box",
  /position:\s*static/.test(printSheetRule) &&
    /padding:\s*0/.test(printSheetRule) &&
    /page:\s*vdcm-continuous/.test(printSheetRule),
  printSheetRule.trim() || "rule not found",
);

const preview = readFileSync(
  join(process.cwd(), "components", "ResumePreview.tsx"),
  "utf8",
);
check(
  "continuous sheet's measured height is reserved in the layout",
  preview.includes("height: sheetHeightPx ? `${sheetHeightPx * scale}px` : undefined"),
  "panels below the sheet would otherwise render under it",
);
check(
  "column height never collapses to zero before the sheet is measured",
  preview.includes("minHeight: sheetHeightPx ? undefined : `calc(11in * ${scale})`"),
  "a pre-measurement frame would show the panels on top of the sheet",
);
check(
  "the reservation tracks the sheet, not just the inner content",
  preview.includes("const sheet = sheetRef.current;") && preview.includes("observer.observe(sheet)"),
);
check(
  "one-page mode still reserves a full page of column height",
  preview.includes("height: `calc(11in * ${scale})`"),
);

const versionHistory = readFileSync(
  join(process.cwd(), "components", "VersionHistory.tsx"),
  "utf8",
);
const workspace = readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8");
const collapsible = readFileSync(
  join(process.cwd(), "components", "CollapsibleCard.tsx"),
  "utf8",
);
const dialog = readFileSync(
  join(process.cwd(), "components", "SaveVariantDialog.tsx"),
  "utf8",
);
const coverLetterPage = readFileSync(join(process.cwd(), "app", "cover-letter", "page.tsx"), "utf8");
check(
  "the panels under the sheet are collapsible",
  versionHistory.includes("<CollapsibleCard") && workspace.includes("<CollapsibleCard"),
  "Versions and the ATS audit should both fold away",
);
check(
  "collapsible panels start folded and keep their headline numbers visible",
  collapsible.includes("defaultOpen = false") &&
    collapsible.includes("<summary") &&
    collapsible.includes("{meta}"),
);
check(
  "collapsible panels stay out of the printed sheet",
  collapsible.includes("print-hide"),
);

/* -------------------------------------------------------------------------- */

/**
 * Navigation contract.
 *
 * The order of the tabs is the order of the work, and it was asked for by hand: the workspace, the three things
 * made from it — the letter, the profile, the portfolio — then the record-keeping from the roles you saved to the
 * calendar their dates land on. Nothing else can catch a reorder, and a new screen has to be added in two places
 * (the `LINKS` array and this list), which is the point: the second place is where the order gets thought about.
 */
section("Navigation contract");

const navbar = readFileSync(join(process.cwd(), "components", "Navbar.tsx"), "utf8");
const navEntries = [...navbar.matchAll(/\{ href: "([^"]+)", label: "([^"]+)"/g)].map((match) => ({
  href: match[1],
  label: match[2],
}));
const navTabs = navEntries.map((entry) => `${entry.href}=${entry.label}`).join(" ");

check(
  "the tabs read in the order the work happens in",
  navTabs ===
    [
      "/=Workspace",
      "/cover-letter=Cover Letter",
      "/profile=Master Profile",
      "/portfolio=Portfolio",
      "/saved=Saved Target Roles",
      "/pipeline=Pipeline",
      "/calendar=Calendar",
    ].join(" "),
  navTabs,
);

/**
 * The navigation and the routes are checked against each other rather than trusted.
 *
 * A tab pointing at a page that does not exist is a 404 in the header, and a page with no tab is a screen nobody
 * can find. Both are one forgotten line, so both are checked from the filesystem — `app/<name>/page.tsx` is a
 * route, and the workspace at `/` is `app/page.tsx`.
 */
const appDir = join(process.cwd(), "app");
const pageRoutes = readdirSync(appDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(appDir, entry.name, "page.tsx")))
  .map((entry) => `/${entry.name}`);
const navHrefs = navEntries.map((entry) => entry.href);

check(
  "every tab has a page, and every page has a tab",
  existsSync(join(appDir, "page.tsx")) &&
    navHrefs.includes("/") &&
    navHrefs.every((href) => href === "/" || pageRoutes.includes(href)) &&
    pageRoutes.every((route) => navHrefs.includes(route)),
  `tabs: ${navHrefs.join(" ")} · pages: ${pageRoutes.join(" ")}`,
);

/* -------------------------------------------------------------------------- */

/**
 * Action placement.
 *
 * Saving a variant used to live at the foot of the audit panel, which buried the
 * one action that turns a draft into a record of an application you actually
 * sent. It belongs in the sheet toolbar next to the edit toggle, and the audit
 * panel should be left reporting on the sheet rather than acting on it.
 */
section("Action placement contract");

check(
  "the save-variant action lives in the sheet toolbar",
  preview.includes("Save variant") && preview.includes("setSaveOpen(true)"),
  "the toolbar keeps the entry point",
);
check(
  "and it opens a form instead of saving on the click",
  !/onClick=\{\(\) => \{\s*saveApplication\(/.test(preview) &&
    preview.includes("<SaveVariantDialog"),
  "saving straight from the toolbar cannot collect dates",
);
const saveToEditToggle = preview.slice(
  preview.indexOf("Save variant"),
  preview.indexOf('id="edit-sheet"'),
);
check(
  "the edit toggle and the save action share the same control group",
  // Only the save control itself may sit between the two, or they are not really
  // adjacent — they are at opposite ends of the toolbar.
  preview.indexOf("Save variant") > 0 &&
    preview.indexOf("Save variant") < preview.indexOf('id="edit-sheet"') &&
    !saveToEditToggle.includes("<PdfExportButton") &&
    !saveToEditToggle.includes("Copy text"),
  "the save action should sit next to the edit toggle, not across the toolbar",
);
check(
  "the dates and notes that used to be a single text box now live in the dialog",
  dialog.includes('id="applied-date"') &&
    dialog.includes('id="follow-up-date"') &&
    dialog.includes('id="variant-notes"') &&
    !preview.includes('id="variant-notes"'),
);
check(
  "the dialog offers hot keys for both dates",
  dialog.includes(">Today</Button>") || dialog.includes("Today\n") || dialog.includes("Today"),
  "a date field with no shortcut is a date field nobody fills in",
);
check(
  "every save entry point uses the same form",
  preview.includes("<SaveVariantDialog") &&
    versionHistory.includes("<SaveVariantDialog") &&
    coverLetterPage.includes("<SaveVariantDialog"),
  "the toolbar, the version shelf and the letter page should agree",
);
check(
  "the audit panel no longer owns the save action",
  !workspace.includes("saveApplication") && !workspace.includes("app-notes"),
  "leaving it in two places would let the two drift apart",
);
check(
  "the audit panel still reports the saved count path",
  preview.includes("applications.length") && preview.includes('href="/saved"'),
);

/* -------------------------------------------------------------------------- */

/**
 * Resume import.
 *
 * The importer feeds the Master Profile, so the bar is the same as the rest of
 * the engine: it may reformat, it may miss something and say so, but it may not
 * write a field the document does not contain. The fixtures include a document
 * from a completely different industry, because an importer that only works for
 * this app's own domain is not an importer.
 */
section("16. Resume import (PDF / DOCX / text into the Master Profile)");

check(
  "file kinds come from the extension and the MIME type",
  kindOfFile("resume.pdf") === "pdf" &&
    kindOfFile("Resume.PDF") === "pdf" &&
    kindOfFile("attachment", "application/pdf") === "pdf" &&
    kindOfFile("resume.docx") === "docx" &&
    kindOfFile("resume.txt") === "txt" &&
    kindOfFile("resume.doc") === "unknown" &&
    kindOfFile("resume.rtf") === "unknown",
  "a .doc cannot be read as a zip, so it must not be pretended otherwise",
);

check(
  "document text is normalised before parsing",
  normalizeDocumentText("a\r\nb\r\n\r\n\r\nc \u2018d\u2019").includes("a\nb\n\nc 'd'"),
);

const vdcParse = parseResumeText(VDC_RESUME_TEXT);
const marketingParse = parseResumeText(MARKETING_RESUME_TEXT);

check(
  "VDC: every section is found",
  ["summary", "skills", "experience", "projects", "education", "certifications"].every((key) =>
    vdcParse.sectionsFound.includes(key as never),
  ),
  vdcParse.sectionsFound.join(", "),
);
check(
  "marketing: every section is found",
  ["summary", "skills", "experience", "education", "certifications"].every((key) =>
    marketingParse.sectionsFound.includes(key as never),
  ),
  marketingParse.sectionsFound.join(", "),
);

for (const [label, parsed] of [
  ["VDC", vdcParse],
  ["marketing", marketingParse],
] as const) {
  check(`${label}: contact details are read`, Boolean(parsed.header.email && parsed.header.phone));
  check(`${label}: the location line is read`, Boolean(parsed.header.location), parsed.header.location);
  check(
    `${label}: the name is read and is verbatim`,
    label === "VDC" ? parsed.header.name === "ALEX RIVERA" : parsed.header.name === "Maya Okonkwo",
    String(parsed.header.name),
  );
  check(
    `${label}: the headline is read`,
    Boolean(parsed.header.headline && parsed.header.headline.length < 90),
    String(parsed.header.headline),
  );
  check(`${label}: the summary becomes a pitch`, parsed.summary.length > 60);
  check(
    `${label}: skill groups are labelled and split`,
    parsed.skillGroups.length >= 2 && parsed.skillGroups.every((group) => group.items.length >= 2),
    parsed.skillGroups.map((group) => `${group.title}(${group.items.length})`).join(" "),
  );
  check(
    `${label}: roles are found with titles, employers and dates`,
    parsed.roles.length >= 2 &&
      parsed.roles.every(
        (role) => role.title.length > 2 && role.company.length > 2 && role.dates.length > 4,
      ),
    parsed.roles
      .map((role) => `${role.title}@${role.company}${role.dates ? "" : " NO-DATES"}`)
      .join(" | "),
  );
  check(
    `${label}: bullets are attached to the right role`,
    parsed.roles.every(
      (role) => role.bullets.length >= 1 && role.bullets.every((text) => text.length > 20),
    ),
    parsed.roles.map((role) => role.bullets.length).join("/"),
  );
  check(
    `${label}: education and certifications are found`,
    parsed.education.length >= 1 && parsed.certifications.length >= 1,
  );
  check(
    `${label}: no warning about a missing experience section`,
    !parsed.warnings.some((warning) => /experience/i.test(warning)),
    parsed.warnings.join(" | "),
  );
}

/* ------------------------------- specifics -------------------------------- */

check(
  "VDC: the em-dash title/company header splits the right way round",
  vdcParse.roles[0].title === "Senior VDC Coordinator" &&
    vdcParse.roles[0].company === "Pacific Northwest Engineering",
  `${vdcParse.roles[0].title} @ ${vdcParse.roles[0].company}`,
);
check(
  "VDC: the two-line header (title line, dates line) is joined",
  vdcParse.roles[1].title === "VDC Coordinator" &&
    vdcParse.roles[1].company === "Cascade Builders" &&
    /2018/.test(vdcParse.roles[1].dates),
  `${vdcParse.roles[1].title} @ ${vdcParse.roles[1].company} (${vdcParse.roles[1].dates})`,
);
check(
  "marketing: 'at Company' headers split correctly",
  marketingParse.roles[0].title === "Lifecycle Marketing Manager" &&
    marketingParse.roles[0].company === "Northwind Labs",
  `${marketingParse.roles[0].title} @ ${marketingParse.roles[0].company}`,
);
check(
  "marketing: 'Title, Company' headers split correctly",
  marketingParse.roles[1].title === "Marketing Associate" &&
    marketingParse.roles[1].company === "Brightline Media",
  `${marketingParse.roles[1].title} @ ${marketingParse.roles[1].company}`,
);
check(
  "bullet glyphs are stripped rather than imported",
  [...vdcParse.roles, ...marketingParse.roles]
    .flatMap((role) => role.bullets)
    .every((text) => !/^[-•*]\s/.test(text)),
);
check(
  "a project's tech-stack line becomes its meta line",
  vdcParse.projects.length === 1 &&
    vdcParse.projects[0].name === "Model Health Dashboard" &&
    /PySide6/.test(vdcParse.projects[0].meta) &&
    vdcParse.projects[0].bullets.length === 1,
  JSON.stringify(vdcParse.projects[0]),
);

const thinParse = parseResumeText(SUMMARY_ONLY_TEXT);
check(
  "a document with no experience section produces no invented roles",
  thinParse.roles.length === 0,
  `${thinParse.roles.length} roles`,
);
check(
  "and says so instead of failing quietly",
  thinParse.warnings.some((warning) => /experience/i.test(warning)) &&
    thinParse.warnings.some((warning) => /skills/i.test(warning)),
  thinParse.warnings.join(" | "),
);

/* ---------------------------- text extraction ----------------------------- */

check(
  "PDF text runs are grouped into lines by their y position, left to right",
  pdfItemsToLines([
    { str: "Rivera", transform: [1, 0, 0, 1, 120, 700] },
    { str: "Alex", transform: [1, 0, 0, 1, 20, 700] },
    { str: "Second line", transform: [1, 0, 0, 1, 20, 680] },
  ]) === "Alex Rivera\nSecond line",
);

/* --------------------------- DOCX end to end ------------------------------ */

/* A real DOCX, zipped in the test, run through the real extractor. Deferred to a
   promise because this script runs as CJS, where top-level await is unavailable;
   the summary below is printed from its `then` so the count is complete. */
const docxSuite = (async () => {
  const { zipSync, strToU8 } = await import("fflate");
  const docx = zipSync({
    "word/document.xml": strToU8(DOCX_DOCUMENT_XML),
    "[Content_Types].xml": strToU8("<Types/>"),
  });
  const extracted = await extractResumeText({
    name: "dana.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    arrayBuffer: async () => docx.buffer.slice(0) as ArrayBuffer,
  });
  check("DOCX: the document body is unzipped and read", extracted.kind === "docx");
  check(
    "DOCX: paragraphs become lines",
    extracted.text.includes("Dana Whitfield") && extracted.text.includes("Program Manager"),
  );
  const docxParse = parseResumeText(extracted.text);
  check(
    "DOCX: the parsed document yields a role with its dates",
    docxParse.roles.length === 1 &&
      docxParse.roles[0].company === "Harborline Group" &&
      /2020/.test(docxParse.roles[0].dates) &&
      docxParse.roles[0].bullets.length === 2,
    JSON.stringify(docxParse.roles[0]),
  );
  check(
    "DOCX: the email is read",
    docxParse.header.email === "dana.whitfield@example.com",
    String(docxParse.header.email),
  );

  const unsupported = await extractResumeText({
    name: "old.doc",
    arrayBuffer: async () => docx.buffer.slice(0) as ArrayBuffer,
  });
  check(
    "an unreadable type is reported, not mangled",
    unsupported.kind === "unknown" && unsupported.text === "" && unsupported.notes.length === 1,
  );
})();

/* ------------------------------- applying --------------------------------- */

const vdcData = profileDataFromParse(vdcParse);
check(
  "imported bullets carry no invented labels or emphasis",
  vdcData.roles.every((role) =>
    role.bullets.every(
      (bullet) => bullet.label === "" && bullet.tags.length === 0 && bullet.emphasis?.length === 0,
    ),
  ),
);
check(
  "imported skill items are untagged, so relevance scoring starts neutral",
  vdcData.skillGroups.every((group) => group.items.every((item) => item.tags?.length === 0)),
);
check(
  "imported ids are unique",
  new Set([
    ...vdcData.roles.map((role) => role.id),
    ...vdcData.roles.flatMap((role) => role.bullets.map((bullet) => bullet.id)),
    ...vdcData.skillGroups.map((group) => group.id),
    ...vdcData.skillGroups.flatMap((group) => group.items.map((item) => item.id)),
  ]).size ===
    vdcData.roles.length +
      vdcData.roles.reduce((sum, role) => sum + role.bullets.length, 0) +
      vdcData.skillGroups.length +
      vdcData.skillGroups.reduce((sum, group) => sum + group.items.length, 0),
);

const emptyProfile = {
  header: {
    name: "",
    headline: "",
    altHeadlines: [],
    location: "",
    locationNote: "",
    email: "",
    phone: "",
    linkedin: "",
    portfolio: "",
  },
  pitch: "",
  skillGroups: [],
  roles: [],
  projects: [],
  education: [],
  certifications: [],
};

const merged = applyImport(emptyProfile, vdcData, { mode: "merge", useSummaryAsPitch: true });
check(
  "merging into an empty profile fills every block",
  merged.roles.length === vdcData.roles.length &&
    merged.skillGroups.length === vdcData.skillGroups.length &&
    merged.pitch === vdcData.pitch,
);
check(
  "an empty header field is filled",
  merged.header.email === "alex.rivera@example.com" &&
    merged.header.name === "ALEX RIVERA" &&
    merged.header.phone.startsWith("("),
  `${merged.header.name} / ${merged.header.email} / ${merged.header.phone}`,
);

// The same import twice must not double the profile.
const twice = applyImport(merged, vdcData, { mode: "merge", useSummaryAsPitch: true });
check(
  "importing the same document twice adds nothing the second time",
  twice.roles.length === merged.roles.length &&
    twice.skillGroups.length === merged.skillGroups.length &&
    twice.projects.length === merged.projects.length,
  `${merged.roles.length} -> ${twice.roles.length} roles`,
);

// The seed profile is this user's own resume, so the VDC fixture collides with it
// on purpose. The marketing fixture shares nothing, which is what makes it the
// right document for testing that a merge adds rather than replaces.
const marketingData = profileDataFromParse(marketingParse);
const withExisting = applyImport(
  {
    ...emptyProfile,
    pitch: "My own words.",
    header: { ...emptyProfile.header, email: "mine@example.com" },
    roles: profile.roles,
  },
  marketingData,
  { mode: "merge", useSummaryAsPitch: true },
);
check(
  "merge never overwrites a field you already filled",
  withExisting.header.email === "mine@example.com" && withExisting.pitch === "My own words.",
  `${withExisting.header.email} / ${withExisting.pitch.slice(0, 20)}`,
);
check(
  "merge keeps existing roles alongside imported ones",
  withExisting.roles.length === profile.roles.length + marketingData.roles.length,
  `${profile.roles.length} + ${marketingData.roles.length} -> ${withExisting.roles.length}`,
);

const replaced = applyImport(
  { ...emptyProfile, pitch: "My own words.", roles: profile.roles },
  marketingData,
  { mode: "replace", useSummaryAsPitch: true },
);
check(
  "replace swaps the content blocks wholesale",
  replaced.roles.length === marketingData.roles.length && replaced.pitch === marketingData.pitch,
);
check("replace still leaves curated header lists alone", Array.isArray(replaced.header.altHeadlines));

const impact = importImpact(vdcData, true);
check(
  "the impact summary counts what would change",
  impact.roles === 2 && impact.bullets === 4 && impact.skillGroups === 3 && impact.skills === 10,
  JSON.stringify(impact),
);
check(
  "the impact summary lists the header fields found",
  impact.headerFields.includes("email") && impact.headerFields.includes("linkedin"),
  impact.headerFields.join(", "),
);

/* -------------------------------------------------------------------------- */

/**
 * Renaming things must not cost the user their data.
 *
 * The emphasis facets and the backup identifier were both renamed when the app was
 * retitled and made industry-neutral, and both are persisted. These assertions are
 * the reason a profile written by the previous build still opens as the same
 * profile rather than silently reverting to the seed.
 */
section("17. Renames: stored data and old backups still read back");

check(
  "legacy emphasis ids map onto the current facets",
  normalizeEmphasis("automation") === "technical" &&
    normalizeEmphasis("field") === "delivery" &&
    normalizeEmphasis("balanced") === "balanced",
);
check(
  "emphasis matching tolerates case, padding and separators",
  normalizeEmphasis("AUTOMATION") === "technical" &&
    normalizeEmphasis(" automation ") === "technical" &&
    normalizeEmphasis("Automation & Code Heavy") === "technical",
);
check(
  "an unknown or missing emphasis falls back to balanced rather than undefined",
  normalizeEmphasis("nonsense") === "balanced" &&
    normalizeEmphasis(undefined) === "balanced" &&
    normalizeEmphasis(42) === "balanced",
);
check(
  "the label lookup can never render undefined",
  emphasisLabel("automation") === "Technical & Tools Heavy" &&
    emphasisLabel("field") === "Delivery & Operations Heavy" &&
    emphasisLabel("who knows") === "Balanced",
);

check(
  "the facet list, the labels and the hints stay in step",
  EMPHASIS_IDS.length === 3 &&
    EMPHASIS_IDS.every((id) => Boolean(EMPHASIS_LABELS[id]) && Boolean(EMPHASIS_HINTS[id])) &&
    EMPHASIS_IDS.every((id) => normalizeEmphasis(id) === id),
  EMPHASIS_IDS.join(", "),
);
check(
  "no facet label names a job family or an industry",
  EMPHASIS_IDS.every((id) => !/vdc|bim|revit|construction|trades?\b/i.test(EMPHASIS_LABELS[id])),
  EMPHASIS_IDS.map((id) => EMPHASIS_LABELS[id]).join(" / "),
);

const legacyProfile = migrateProfile({
  header: { name: "Legacy Person" },
  pitchVariants: { automation: "Legacy technical pitch.", field: "Legacy field pitch.", balanced: "" },
  skillGroups: [{ id: "sg_custom", title: "Custom", items: [], emphasis: ["automation"] }],
  roles: [
    {
      id: "role_legacy",
      role: "Old Title",
      company: "Old Co",
      location: "",
      dates: "",
      bullets: [
        { id: "b1", label: "L", text: "Legacy bullet.", tags: [], emphasis: ["field", "balanced"] },
        { id: "b2", label: "L", text: "Another.", tags: [], emphasis: ["automation"] },
      ],
    },
  ],
});
check(
  "a stored profile's pitch variants are rebuilt under the new keys",
  legacyProfile.pitchVariants.technical === "Legacy technical pitch." &&
    legacyProfile.pitchVariants.delivery === "Legacy field pitch." &&
    legacyProfile.pitchVariants.balanced === createSeedProfile().pitchVariants.balanced,
  Object.keys(legacyProfile.pitchVariants).join(", "),
);
check(
  "and the legacy keys do not survive alongside them",
  !("automation" in legacyProfile.pitchVariants) && !("field" in legacyProfile.pitchVariants),
);
check(
  "bullet and skill-group tags are migrated",
  legacyProfile.roles[0].bullets[0].emphasis?.join(",") === "delivery,balanced" &&
    legacyProfile.roles[0].bullets[1].emphasis?.join(",") === "technical" &&
    legacyProfile.skillGroups[0].emphasis?.join(",") === "technical",
);
check(
  "a migrated profile still has every current facet",
  (["balanced", "technical", "delivery"] as const).every(
    (facet) => typeof legacyProfile.pitchVariants[facet] === "string",
  ),
);

check(
  "a saved draft's emphasis is migrated on read",
  migrateDraft({ ...DEFAULT_DRAFT, emphasis: "field" }).emphasis === "delivery",
);
check(
  "a saved application's emphasis is migrated on read",
  migrateApplications([{ id: "a", resume: {}, emphasis: "automation" } as never])[0].emphasis ===
    "technical",
);
check(
  "a saved version's emphasis is migrated on read",
  migrateVersions([{ id: "v", resume: {}, emphasis: "field", pinned: false } as never])[0]
    .emphasis === "delivery",
);

const legacyBackup = parseImport(
  JSON.stringify({ app: "vdc-career-matrix", version: 1, profile: { header: { name: "Old" } } }),
);
check(
  "a backup exported under the old app id still imports",
  legacyBackup.ok && legacyBackup.kind === "bundle",
  legacyBackup.ok ? legacyBackup.kind : legacyBackup.error,
);
const newBackup = parseImport(JSON.stringify(buildBackup()));
check(
  "and a backup exported now carries the new id",
  newBackup.ok && newBackup.kind === "bundle" && newBackup.bundle.app === "career-matrix",
  newBackup.ok && newBackup.kind === "bundle" ? newBackup.bundle.app : "not a bundle",
);

/* -------------------------------------------------------------------------- */

/**
 * Dates and the save payload.
 *
 * A follow-up calendar is only as good as its dates, and every failure mode here is
 * a silent one: a UTC parse lands a day early west of Greenwich, a leap year slips a
 * week, and a stage that walks backwards loses a real interview. None of those
 * throw — they just put the wrong thing on the wrong day.
 */
section("18. Application dates and the save payload");

check(
  "today is formatted as a local ISO date",
  todayIso() === toIsoDate(new Date()) && /^\d{4}-\d{2}-\d{2}$/.test(todayIso()),
  todayIso(),
);
check(
  "an ISO date round-trips through a real Date",
  toIsoDate(fromIsoDate("2026-09-29")!) === "2026-09-29",
);
check(
  "a date is never parsed as UTC midnight",
  // The bug this guards: `new Date("2026-09-29")` is UTC, so west of Greenwich it
  // reads back as the 28th.
  fromIsoDate("2026-09-29")!.getDate() === 29 && fromIsoDate("2026-01-01")!.getDate() === 1,
);
check(
  "impossible dates are rejected rather than rolled over",
  !isIsoDate("2026-02-31") && !isIsoDate("2026-13-01") && !isIsoDate("2026-2-3") && !isIsoDate("soon"),
);
check(
  "day arithmetic crosses months, years and leap days",
  addDays("2026-01-31", 1) === "2026-02-01" &&
    addDays("2026-12-31", 1) === "2027-01-01" &&
    addDays("2028-02-28", 1) === "2028-02-29" &&
    addDays("2027-02-28", 1) === "2027-03-01" &&
    addDays("2026-03-01", -1) === "2026-02-28",
);
check(
  "day arithmetic survives a daylight-saving boundary",
  // 2027-03-14 is a US DST switch, where millisecond arithmetic lands a day off.
  addDays("2027-03-13", 14) === "2027-03-27" && addDays("2027-11-06", 1) === "2027-11-07",
);
check(
  "an invalid date is returned untouched instead of becoming NaN",
  addDays("not-a-date", 7) === "not-a-date" && addDays("2026-09-29", Number.NaN) === "2026-09-29",
);
check(
  "day counts are signed and exact",
  daysBetween("2026-09-29", "2026-10-13") === 14 &&
    daysBetween("2026-10-13", "2026-09-29") === -14 &&
    daysBetween("2026-09-29", "2026-09-29") === 0,
);
check(
  "relative labels read the way a person would say them",
  relativeDayLabel("2026-09-29", "2026-09-29") === "today" &&
    relativeDayLabel("2026-09-30", "2026-09-29") === "tomorrow" &&
    relativeDayLabel("2026-09-28", "2026-09-29") === "yesterday" &&
    relativeDayLabel("2026-10-06", "2026-09-29") === "in 7 days" &&
    relativeDayLabel("2026-09-22", "2026-09-29") === "7 days ago",
);
check(
  "offsets are described in weeks when they divide evenly",
  describeOffset(14) === "2 weeks" &&
    describeOffset(7) === "1 week" &&
    describeOffset(30) === "30 days" &&
    describeOffset(1) === "1 day" &&
    describeOffset(0) === "same day",
);
check(
  "the follow-up presets are all forward-looking",
  FOLLOW_UP_PRESETS.length >= 3 && FOLLOW_UP_PRESETS.every((preset) => preset.days > 0),
  FOLLOW_UP_PRESETS.map((preset) => `${preset.label}=${preset.days}`).join(" "),
);

/* ------------------------- the save payload rules ------------------------- */

check(
  "a bare notes string still normalizes, for callers that predate the form",
  normalizeSaveDetails("Recruiter said two weeks").notes === "Recruiter said two weeks",
);
check(
  "missing fields come back as an empty record rather than undefined",
  normalizeSaveDetails(undefined).notes === "" &&
    normalizeSaveDetails(undefined).appliedAt === undefined,
);
check(
  "only real dates are kept, so nothing invalid can reach the calendar",
  normalizeSaveDetails({ appliedAt: "2026-02-31" }).appliedAt === undefined &&
    normalizeSaveDetails({ followUpAt: "nonsense" }).followUpAt === undefined &&
    normalizeSaveDetails({ appliedAt: "2026-01-05" }).appliedAt === "2026-01-05",
);
check(
  "blank contact and source are dropped rather than stored as spaces",
  normalizeSaveDetails({ contact: "   ", source: "" }).contact === undefined &&
    normalizeSaveDetails({ contact: " Dana ", source: "" }).contact === "Dana" &&
    // A restored backup can hold anything in a text slot; nothing here may throw over it.
    normalizeSaveDetails({ contact: 42 as never, source: {} as never }).contact === undefined &&
    normalizeSaveDetails({ contact: 42 as never, source: {} as never }).source === undefined,
);
check(
  "the office address is kept as typed, and a blank one is dropped",
  normalizeSaveDetails({ address: "  1201 SW 5th Ave, Portland, OR 97201  " }).address ===
    "1201 SW 5th Ave, Portland, OR 97201" &&
    normalizeSaveDetails({ address: "   " }).address === undefined &&
    normalizeSaveDetails(undefined).address === undefined,
);
check(
  "an old record keeps its address through a reload, and junk is dropped",
  (() => {
    const base = {
      id: "a1",
      savedAt: "2026-09-01",
      jobTitle: "Coordinator",
      company: "Northwest",
      location: "Hillsboro, OR",
      workMode: "Hybrid",
      matchScore: 70,
      intensity: 60,
      emphasis: "balanced",
      rawJobText: "",
      resume: {},
      edits: {},
      notes: "",
      stage: "Applied",
    };
    const survived = migrateApplications([
      { ...base, address: "1201 SW 5th Ave, Portland, OR 97201" },
    ])[0];
    const junk = migrateApplications([{ ...base, address: { line1: "somewhere" } }])[0];
    return (
      survived.address === "1201 SW 5th Ave, Portland, OR 97201" &&
      // A record saved before the field existed simply has none, and still reads back.
      migrateApplications([base])[0].address === undefined &&
      junk.address === undefined
    );
  })(),
);

/* --------------------- editing the details later -------------------------- */

/**
 * The rules behind the details dialog, checked here rather than through the dialog itself.
 *
 * The dialog renders in a radix portal, and a portal does not mount in this harness — radix decides whether it has
 * a browser when its module is first loaded, which is always before a test has set a window. Rather than assert
 * the harness, the rules the dialog draws are pure functions in `lib/applicationDetails.ts` and are checked
 * directly here; what the dialog *looks* like is on the manual list and in the screenshots.
 */
check("a blank optional detail clears the field, and blank notes are still notes", (() => {
  return (
    detailPatch("address", "  1201 SW 5th Ave  ").address === "1201 SW 5th Ave" &&
    detailPatch("address", "   ").address === undefined &&
    detailPatch("contact", "").contact === undefined &&
    detailPatch("source", " Referral ").source === "Referral" &&
    // Notes are not optional: the record always has a string, or every reader of it needs a null check.
    detailPatch("notes", "").notes === "" &&
    detailPatch("notes", "  Spoke to Sam.  ").notes === "Spoke to Sam."
  );
})());

check("placing an office looks it up by the address, and falls back to the posting's line", (() => {
  const entry = { location: "Hillsboro, OR", address: undefined as string | undefined };
  const addressed = placedAddress(entry, "1201 SW 5th Ave, Portland, OR", { lat: 45.5161, lng: -122.6787 });
  return (
    // The typed address wins, because it is the building rather than the metro.
    addressToPlace(entry, " 1201 SW 5th Ave, Portland, OR ") === "1201 SW 5th Ave, Portland, OR" &&
    // With nothing typed, the posting's own line is still worth a lookup rather than a dead button.
    addressToPlace(entry, "  ") === "Hillsboro, OR" &&
    addressToPlace({ location: "" }, "") === "" &&
    // The point is stored with the words, and the words are kept.
    addressed.coords?.lat === 45.5161 &&
    addressed.address === "1201 SW 5th Ave, Portland, OR" &&
    // Clearing the box before pressing the button keeps the address already on the record.
    placedAddress(
      { address: "1201 SW 5th Ave, Portland, OR" },
      "   ",
      { lat: 1, lng: 2 },
    ).address === "1201 SW 5th Ave, Portland, OR" &&
    pinnedLabel({ lat: 45.5161, lng: -122.6787 }) === "pinned at 45.5161, -122.6787"
  );
})());

check("the calendar and the saved list both open the details editor", (() => {
  // A source check, because the dialog lives in a portal this harness cannot mount: what is worth guarding is
  // that the two pages still wire it up, and pass it the record that was clicked.
  const calendar = readFileSync(join(process.cwd(), "app", "calendar", "page.tsx"), "utf8");
  const saved = readFileSync(join(process.cwd(), "app", "saved", "page.tsx"), "utf8");
  return (
    calendar.includes("ApplicationDetailsDialog") &&
    calendar.includes("data-details={event.applicationId}") &&
    calendar.includes("onDetails={(applicationId) => setDetailsId(applicationId)}") &&
    saved.includes("ApplicationDetailsDialog") &&
    saved.includes("onDetails={() => setDetailsId(entry.id)}") &&
    // The address is shown where the record is read, not only where it is edited.
    saved.includes("entry.address") &&
    calendar.includes("entry.address")
  );
})());

check(
  "recording an applied date promotes a saved record to Applied",
  resolveStage({ appliedAt: "2026-09-29" }, "Saved") === "Applied",
);
check(
  "an explicit stage always wins",
  resolveStage({ appliedAt: "2026-09-29", stage: "Offer" }, "Saved") === "Offer",
);
check(
  "nothing ever moves backwards",
  resolveStage({ appliedAt: "2026-09-29" }, "Interview") === "Interview" &&
    resolveStage({}, "Offer") === "Offer",
);
check("a save with no dates stays where it was", resolveStage({}, "Saved") === "Saved");

check(
  "a follow-up before the applied date is refused, not stored",
  validateSaveDetails({ appliedAt: "2026-09-29", followUpAt: "2026-09-01" }) !== null,
);
check(
  "a valid pair passes, and a partial one is allowed",
  validateSaveDetails({ appliedAt: "2026-09-29", followUpAt: "2026-10-13" }) === null &&
    validateSaveDetails({ appliedAt: "2026-09-29" }) === null &&
    validateSaveDetails({ followUpAt: "2026-10-13" }) === null &&
    validateSaveDetails({}) === null,
);

const overdue = followUpStatus("2026-09-22", "2026-09-29");
const dueToday = followUpStatus("2026-09-29", "2026-09-29");
const upcoming = followUpStatus("2026-10-06", "2026-09-29");
const undated = followUpStatus(undefined, "2026-09-29");
check(
  "follow-ups are classified for the agenda",
  overdue.state === "overdue" &&
    overdue.days === -7 &&
    overdue.needsAttention &&
    dueToday.state === "due" &&
    dueToday.needsAttention &&
    upcoming.state === "upcoming" &&
    !upcoming.needsAttention &&
    undated.state === "none" &&
    !undated.needsAttention,
  `${overdue.state}/${dueToday.state}/${upcoming.state}/${undated.state}`,
);
check(
  "an overdue follow-up says how late it is",
  overdue.label === "Follow-up 7 days overdue" && dueToday.label === "Follow up today",
  `${overdue.label} | ${dueToday.label}`,
);

const timeline = applicationTimeline({ appliedAt: "2026-09-29", followUpAt: "2026-10-13" });
check(
  "the timeline reports the gap in the units a person thinks in",
  timeline.followUpGap === "2 weeks" && timeline.appliedAt === "2026-09-29",
  String(timeline.followUpGap),
);
check(
  "a follow-up with no applied date still yields a usable timeline",
  applicationTimeline({ followUpAt: "2026-10-13" }).followUpGap === undefined &&
    applicationTimeline({ followUpAt: "2026-10-13" }).followUpAt === "2026-10-13",
);

/* Old records must survive the new fields. */
const migratedApplication = migrateApplications([
  {
    id: "old_app",
    resume: {},
    notes: "Called the recruiter on the 3rd",
    stage: "Applied",
    appliedAt: "2026-02-31",
    followUpAt: "2026-10-13",
    contact: "  ",
  } as never,
])[0];
check(
  "an old application keeps its notes and stage",
  migratedApplication.notes === "Called the recruiter on the 3rd" &&
    migratedApplication.stage === "Applied",
);
check(
  "an impossible stored date is dropped instead of reaching the calendar",
  migratedApplication.appliedAt === undefined &&
    migratedApplication.followUpAt === "2026-10-13" &&
    migratedApplication.contact === undefined,
  `${migratedApplication.appliedAt} / ${migratedApplication.followUpAt}`,
);

/* -------------------------------------------------------------------------- */

/**
 * The calendar.
 *
 * A follow-up calendar fails quietly in ways a resume can't: a month grid built from
 * the 31st skips February, an all-day event with an inclusive DTEND is a day short in
 * every client, and a reminder about a job you already accepted teaches you to ignore
 * the list. Each of those is asserted here rather than eyeballed in a browser.
 */
section("19. Follow-up calendar and iCalendar export");

check(
  "a month grid is six full weeks, always the same shape",
  monthMatrix("2026-09-15").length === 6 &&
    monthMatrix("2026-09-15").every((week) => week.length === 7),
);
check(
  "the grid starts on the week containing the 1st",
  monthMatrix("2026-09-15")[0][0] === "2026-08-30" && startOfWeek("2026-09-01") === "2026-08-30",
  monthMatrix("2026-09-15")[0][0],
);
check(
  "every day of the month appears exactly once in the grid",
  (() => {
    const flat = monthMatrix("2026-09-15").flat();
    return monthDays("2026-09-15").every((day) => flat.filter((cell) => cell === day).length === 1);
  })(),
);
check(
  "a 31-day month beginning on a Saturday still fits in six weeks",
  // August 2026 starts on a Saturday: the worst case for a Sunday-first grid.
  monthMatrix("2026-08-01").flat().includes("2026-08-31"),
);
check(
  "February in a leap year is 29 days and fits",
  monthDays("2028-02-10").length === 29 && monthMatrix("2028-02-10").flat().includes("2028-02-29"),
);
check(
  "month navigation clamps instead of rolling over",
  // The bug this guards: new Date(2026, 0 + 1, 31) is 31 February, which JavaScript
  // turns into 3 March — so January would skip February entirely.
  addMonths("2026-01-31", 1) === "2026-02-28" &&
    addMonths("2026-01-31", 3) === "2026-04-30" &&
    addMonths("2026-12-15", 1) === "2027-01-15" &&
    addMonths("2026-01-15", -1) === "2025-12-15",
);
check(
  "month labels and day numbers come from the date itself",
  monthLabel("2026-09-15").includes("2026") &&
    monthLabel("2026-09-15").includes("September") &&
    dayOfMonth("2026-09-01") === 1 &&
    dayOfMonth("2026-09-30") === 30,
);
check(
  "weekday labels line up with the grid columns",
  weekdayLabels().length === 7 &&
    // 2026-01-04 is a Sunday and 2026-01-05 a Monday.
    weekdayLabels()[0] ===
      fromIsoDate("2026-01-04")!.toLocaleDateString(undefined, { weekday: "short" }) &&
    weekdayLabels(1)[0] ===
      fromIsoDate("2026-01-05")!.toLocaleDateString(undefined, { weekday: "short" }),
);
check("weekends are identified", isWeekend("2026-09-26") && !isWeekend("2026-09-25"));
check(
  "month boundaries are the real first and last days",
  startOfMonth("2026-09-15") === "2026-09-01" &&
    endOfMonth("2026-09-15") === "2026-09-30" &&
    endOfMonth("2028-02-10") === "2028-02-29",
);
check(
  "grid cells that spill into the neighbouring month are identified as such",
  !isSameMonth(monthMatrix("2026-09-15")[0][0], "2026-09-15") &&
    isSameMonth(monthMatrix("2026-09-15")[0][2], "2026-09-15") &&
    isSameMonth("2026-09-30", "2026-09-15"),
);

/* --------------------------- events and stages ---------------------------- */

const appEntry = (over: Partial<SavedApplication>): SavedApplication =>
  ({
    id: "app",
    savedAt: "2026-09-01T10:00:00.000Z",
    jobTitle: "VDC Coordinator",
    company: "Northwest Engineering",
    location: "Portland, OR",
    workMode: "Hybrid",
    matchScore: 80,
    intensity: 60,
    emphasis: "balanced",
    rawJobText: "",
    resume: {},
    edits: {},
    notes: "",
    stage: "Applied",
    ...over,
  }) as SavedApplication;

const calendarFixture = [
  appEntry({ id: "a1", appliedAt: "2026-09-01", followUpAt: "2026-09-29" }),
  appEntry({
    id: "a2",
    appliedAt: "2026-09-20",
    followUpAt: "2026-10-04",
    stage: "Interview",
    company: "Data Center Builders",
  }),
  appEntry({
    id: "a3",
    appliedAt: "2026-08-10",
    followUpAt: "2026-09-10",
    stage: "Offer",
    company: "Offered Co",
  }),
];
const calendarEventsFor = calendarEvents(calendarFixture, "2026-10-01");

check(
  "each application contributes its applied date and its follow-up",
  calendarEventsFor.length === 6,
  `${calendarEventsFor.length} events`,
);
check(
  "events are sorted by date",
  calendarEventsFor.every(
    (event, index) => index === 0 || calendarEventsFor[index - 1].date <= event.date,
  ),
);
check(
  "an offer stops chasing, so its past follow-up is not outstanding",
  !calendarEventsFor.find((event) => event.company === "Offered Co" && event.kind === "followUp")!
    .outstanding,
);
check(
  "a still-open application with a past follow-up is outstanding",
  calendarEventsFor.find((event) => event.applicationId === "a1" && event.kind === "followUp")!
    .outstanding,
);
check(
  "a follow-up in the future is not outstanding",
  !calendarEventsFor.find((event) => event.applicationId === "a2" && event.kind === "followUp")!
    .outstanding,
);
check(
  "an applied date is never an outstanding task",
  calendarEventsFor
    .filter((event) => event.kind === "applied")
    .every((event) => !event.outstanding),
);
check(
  "an archived application never needs chasing",
  !needsChasing({ stage: "Archived" }) &&
    !needsChasing({ stage: "Offer" }) &&
    needsChasing({ stage: "Screen" }),
);
check(
  "event ids are unique, so none can shadow another",
  new Set(calendarEventsFor.map((event) => event.id)).size === calendarEventsFor.length,
);
check(
  "grouping by day puts every event on its own date",
  (() => {
    const byDate = eventsByDate(calendarEventsFor);
    return (
      byDate.get("2026-09-01")?.length === 1 &&
      byDate.get("2026-09-29")?.length === 1 &&
      [...byDate.values()].reduce((sum, list) => sum + list.length, 0) === calendarEventsFor.length
    );
  })(),
);
check(
  "the agenda covers the window and nothing outside it",
  agenda(calendarEventsFor, "2026-10-01", 14).every(
    (event) => event.date >= "2026-10-01" && event.date <= "2026-10-15",
  ) && agenda(calendarEventsFor, "2026-09-01", 7).some((event) => event.date === "2026-09-01"),
);
check(
  "an application with no dates produces no events",
  calendarEvents([appEntry({ appliedAt: undefined, followUpAt: undefined })], "2026-10-01").length === 0,
);

const octoberSummary = pipelineSummary(calendarFixture, "2026-10-01");
check(
  "the summary counts the month, the week and the overdue",
  // 2026-10-01 is a Thursday, so its week runs 09-27 to 10-03 — which catches a1's
  // overdue 09-29 follow-up as well as anything falling later in the week.
  octoberSummary.appliedThisMonth === 0 &&
    octoberSummary.overdue === 1 &&
    octoberSummary.dueThisWeek === 1 &&
    octoberSummary.active === 2,
  JSON.stringify(octoberSummary),
);
const septemberSummary = pipelineSummary(calendarFixture, "2026-09-15");
check(
  "and moves with the date it is asked about",
  // The week of 09-15 runs 09-13 to 09-19, which holds none of these follow-ups.
  septemberSummary.appliedThisMonth === 2 &&
    septemberSummary.dueThisWeek === 0 &&
    septemberSummary.overdue === 0,
  JSON.stringify(septemberSummary),
);
check(
  "an offer or an archived application is not counted as active",
  pipelineSummary(
    [
      appEntry({ id: "o", stage: "Offer" }),
      appEntry({ id: "x", stage: "Archived" }),
      appEntry({ id: "i", stage: "Interview" }),
    ],
    "2026-10-01",
  ).active === 1,
);

/* ------------------------------- rescheduling ----------------------------- */

const rescheduled = snoozeFollowUp(calendarFixture[0], 7);
check(
  "snoozing moves the follow-up and remembers the date it replaced",
  rescheduled.followUpAt === "2026-10-06" && rescheduled.followUpHistory?.join(",") === "2026-09-29",
  `${rescheduled.followUpAt} / ${rescheduled.followUpHistory?.join(",")}`,
);
const chasedTwice = snoozeFollowUp(
  {
    ...calendarFixture[0],
    followUpAt: rescheduled.followUpAt,
    followUpHistory: rescheduled.followUpHistory,
  },
  14,
);
check(
  "chasing twice keeps both dates, in order",
  chasedTwice.followUpHistory?.join(",") === "2026-09-29,2026-10-06" &&
    rescheduleCount({ followUpHistory: chasedTwice.followUpHistory }) === 2,
  chasedTwice.followUpHistory?.join(","),
);
check(
  "snoozing an application with no follow-up starts from today",
  snoozeFollowUp(appEntry({ followUpAt: undefined }), 7).followUpAt === addDays(todayIso(), 7),
);
check(
  "closing a follow-up clears it and keeps the history",
  (() => {
    const closed = completeFollowUp(calendarFixture[0]);
    return closed.followUpAt === undefined && closed.followUpHistory?.join(",") === "2026-09-29";
  })(),
);
check(
  "rescheduling to an explicit date works, and a bad date is ignored",
  rescheduleFollowUp(calendarFixture[0], "2026-11-02").followUpAt === "2026-11-02" &&
    rescheduleFollowUp(calendarFixture[0], "not-a-date").followUpAt === "2026-09-29",
);
check(
  "the chase log is bounded, so it cannot grow without limit",
  (() => {
    let entry = appEntry({ followUpAt: "2026-09-01", followUpHistory: [] });
    for (let step = 0; step < 40; step += 1) entry = { ...entry, ...snoozeFollowUp(entry, 7) };
    return entry.followUpHistory!.length <= 20 && entry.followUpHistory!.length > 0;
  })(),
);

/* ------------------------------ iCalendar export --------------------------- */

const icsEvent = {
  uid: "a1:followUp:2026-09-29",
  date: "2026-09-29",
  summary: "Follow up: VDC Coordinator at Northwest Engineering",
  description: "Northwest Engineering — Applied — 4 weeks after applying.",
};
const ics = buildIcs([icsEvent], { calendarName: "Career Matrix follow-ups" });
const icsLines = ics.split("\r\n");

check(
  "the calendar is a valid VCALENDAR with the required frames",
  ics.startsWith("BEGIN:VCALENDAR\r\n") &&
    ics.trimEnd().endsWith("END:VCALENDAR") &&
    icsLines.includes("VERSION:2.0") &&
    icsLines.some((line) => line.startsWith("PRODID:")) &&
    icsLines.includes("X-WR-CALNAME:Career Matrix follow-ups"),
);
check(
  "lines are CRLF-terminated, as the spec requires",
  ics.endsWith("\r\n") && !/[^\r]\n/.test(ics),
);
check(
  "an all-day event starts and ends on consecutive days",
  // The exclusive DTEND is the detail that makes an event one day long rather than
  // zero or two, depending on the client.
  icsLines.includes("DTSTART;VALUE=DATE:20260929") &&
    icsLines.includes("DTEND;VALUE=DATE:20260930") &&
    icsLines.includes("BEGIN:VEVENT") &&
    icsLines.includes("END:VEVENT"),
);
check(
  "the event carries its uid, stamp and summary",
  icsLines.includes("UID:a1:followUp:2026-09-29@career-matrix") &&
    icsLines.some((line) => /^DTSTAMP:\d{8}T\d{6}Z$/.test(line)) &&
    icsLines.some((line) => line.startsWith("SUMMARY:Follow up:")),
);
check(
  "escaped text keeps commas and semicolons from truncating a field",
  escapeIcsText("Acme, Inc.; Portland") === "Acme\\, Inc.\\; Portland" &&
    escapeIcsText("line one\nline two") === "line one\\nline two" &&
    escapeIcsText("back\\slash") === "back\\\\slash",
);
check(
  "an event with a comma in the title still reads as one SUMMARY line",
  (() => {
    const built = buildIcs([{ ...icsEvent, summary: "Follow up: Coordinator, Level II" }]);
    const summaryLines = built.split("\r\n").filter((line) => line.startsWith("SUMMARY:"));
    return summaryLines.length === 1 && summaryLines[0] === "SUMMARY:Follow up: Coordinator\\, Level II";
  })(),
);
check(
  "long lines are folded to 75 octets with a leading space",
  (() => {
    const folded = foldIcsLine(`DESCRIPTION:${"x".repeat(200)}`);
    return (
      folded.length > 1 &&
      folded.slice(1).every((line) => line.startsWith(" ")) &&
      folded.every((line) => new TextEncoder().encode(line).length <= 75)
    );
  })(),
);
check(
  "folding never splits a multi-byte character",
  (() => {
    // Em dashes are three bytes each, so splitting after N characters can land
    // inside one and produce a file strict parsers reject.
    const folded = foldIcsLine(`SUMMARY:${"—".repeat(60)}`);
    // Unfold the way a parser does — stripping the continuation indent — because a
    // naive join would insert the indent into the middle of the text.
    const unfolded = folded.map((line, index) => (index === 0 ? line : line.slice(1))).join("");
    return (
      folded.every((line) => new TextEncoder().encode(line).length <= 75) &&
      unfolded === `SUMMARY:${"—".repeat(60)}`
    );
  })(),
);
check(
  "a folded line rejoins to exactly the original",
  (() => {
    const original = `DESCRIPTION:${"A long description that goes past the seventy-five octet limit. ".repeat(3)}`;
    const rejoined = foldIcsLine(original)
      .map((line, index) => (index === 0 ? line : line.slice(1)))
      .join("");
    return rejoined === original;
  })(),
);
check(
  "the export skips past follow-ups and anything not needing attention",
  (() => {
    const entries = icsEventsFromPipeline(calendarEventsFor, "2026-10-01");
    return (
      // Only a2's future follow-up survives: a1's is past due, a3 is an offer.
      entries.length === 1 &&
      entries[0].uid === "a2:followUp:2026-10-04" &&
      entries[0].summary.includes("Data Center Builders")
    );
  })(),
  JSON.stringify(icsEventsFromPipeline(calendarEventsFor, "2026-10-01").map((entry) => entry.uid)),
);
check(
  "an empty pipeline exports a valid empty calendar rather than a broken one",
  (() => {
    const empty = buildIcs([]);
    return (
      empty.includes("BEGIN:VCALENDAR") && empty.includes("END:VCALENDAR") && !empty.includes("VEVENT")
    );
  })(),
);

/* -------------------------------------------------------------------------- */

/**
 * The portfolio foundation.
 *
 * The geometry and planning rules are where a portfolio quietly goes wrong: a filmstrip
 * that does not fit on letter, a crop that silently asks for more pixels than exist, a
 * page count nobody predicted. All of it is asserted here without rendering anything.
 */
section("20. Portfolio planning and the PDF capability matrix");

check(
  "page sizes are the real point dimensions",
  PAGE_SIZES.letter.width === 612 &&
    PAGE_SIZES.letter.height === 792 &&
    PAGE_SIZES.wide.width === 1224 &&
    PAGE_SIZES.wide.height === 792 &&
    PAGE_SIZES.tabloid.width === 792 &&
    PAGE_SIZES.tabloid.height === 1224 &&
    PAGE_SIZES.slide.width === 720 &&
    PAGE_SIZES.slide.height === 405,
);
check(
  "a filmstrip gets a wide page, except in slide mode where it keeps the slide shape",
  filmstripGeometry("letter").width === 1224 &&
    filmstripGeometry("tabloid").width === 1224 &&
    filmstripGeometry("slide").width === 720,
);

const emptyPortfolio = createPortfolio({ title: "Selected Work" });
check(
  "a new portfolio starts with interactivity on, since ignoring it is harmless",
  emptyPortfolio.transitions && emptyPortfolio.annotate && emptyPortfolio.navigable,
);
check("a new portfolio has a unique id", createPortfolio().id !== createPortfolio().id);
check(
  "block defaults match what the block is for",
  // Labels are deliberately absent: a stored pair supplies them, and the "Before"/"After"
  // defaults are applied where the pair is drawn and planned rather than baked into the data.
  createBlock("pair").beforeLabel === undefined &&
    createBlock("pair").columns === 2 &&
    createBlock("pair").images.length === 0 &&
    (createBlock("metrics").metrics ?? []).length === 2 &&
    createBlock("video").videoPoster === null &&
    createBlock("image").columns === 1,
);
check(
  "a new project starts with one slide, so it is immediately editable",
  createProject("Data Center").slides.length === 1,
);

/* ------------------------------- planning --------------------------------- */

const portfolio = createPortfolio({
  title: "Selected Work",
  pageSize: "letter",
  projects: [
    {
      id: "pr1",
      name: "Data Center",
      summary: "MEP coordination on a LOD 400 build.",
      slides: [
        {
          id: "sl1",
          title: "Overview",
          blocks: [createBlock("text", { title: "Brief", body: "Four trade packages." })],
        },
        {
          id: "sl2",
          title: "Walkthrough",
          blocks: [
            createBlock("filmstrip", {
              title: "Level by level",
              images: [1, 2, 3, 4, 5, 6].map((n) => ({
                id: `img${n}`,
                name: `l${n}.jpg`,
                width: 1600,
                height: 1000,
                crop: { x: 0, y: 0, w: 1, h: 1 },
              })),
            }),
          ],
        },
      ],
    },
  ],
});
const planned = planPortfolio(portfolio);

check(
  "the planner always starts with a cover",
  planned[0].kind === "cover" && planned[0].pageNumber === 1,
);
check(
  "a slide contributes pages, and never a page with nothing but a heading on it",
  // Slide 1 is a text block: one page. Slide 2 is a filmstrip whose slide has no body of its own,
  // so it gets its two wide pages and no letter page in front of them.
  planned.filter((page) => page.kind === "project").length === 1 &&
    planned.filter((page) => page.kind === "filmstrip").length === 2 &&
    planned.length === 4,
  planned.map((page) => page.kind).join("+"),
);
check(
  "the filmstrip leaves the slide page and gets its own wide page",
  planned.filter((page) => page.kind === "filmstrip").every((page) => page.width === 1224) &&
    !planned.some((page) => page.id === "pr1:sl2"),
);
check(
  "a slide with its own text keeps its page, so a caption cannot be lost to a filmstrip",
  (() => {
    // The complement of the rule above: the page is dropped only when it would show nothing beyond
    // a heading, never when it carries a sentence.
    const withBody = createPortfolio({
      title: "Body",
      projects: [
        {
          id: "pr1",
          name: "Data Center",
          slides: [
            {
              id: "sl2",
              title: "Walkthrough",
              body: "Level by level, in the order it was built.",
              blocks: [
                createBlock("filmstrip", {
                  title: "Level by level",
                  images: [1, 2, 3, 4].map((n) => ref(`body-${n}`)),
                }),
              ],
            },
          ],
        },
      ],
    });
    const pages = planPortfolio(withBody);
    const section = pages.find((page) => page.id === "pr1:sl2");
    return (
      section !== undefined &&
      (section.body ?? "").includes("in the order it was built") &&
      pages.some((page) => page.kind === "filmstrip")
    );
  })(),
);
check(
  "six frames wrap onto two wide pages rather than shrinking to thumbnails",
  planned.filter((page) => page.kind === "filmstrip").length === 2 &&
    planned.find((page) => page.kind === "filmstrip")!.frames!.length === 4,
  planned.filter((page) => page.kind === "filmstrip").map((page) => page.frames!.length).join("+"),
);
check(
  "page numbers run in sequence from one",
  planned.every((page, index) => page.pageNumber === index + 1),
);
check("page ids are unique, so links cannot collide", new Set(planned.map((p) => p.id)).size === planned.length);
check(
  "every page has an outline entry",
  planned.every((page) => page.bookmark.length > 0),
  planned.map((page) => page.bookmark).join(" | "),
);
check(
  "the first slide of a project is bookmarked by project name, later slides qualified",
  planned.some((page) => page.bookmark === "Data Center") &&
    planned.some((page) => page.bookmark === "Data Center — Walkthrough"),
);
check(
  "the cover carries the project count and the first project's name",
  // One string, drawn by both surfaces: the PDF's meta line and the cover on screen. It reads "1 project",
  // not "1 projects" — that old plural was wrong and this is where it would have stayed wrong.
  (planned[0].body ?? "").includes("1 project") &&
    !(planned[0].body ?? "").includes("1 projects") &&
    (planned[0].body ?? "").includes("Data Center"),
  planned[0].body ?? "(no meta line)",
);
check(
  "a filmstrip block does not also render inline on its slide",
  // The frames belong to the wide pages only. Asserted across every section page rather than by
  // looking up one page id, because a section with nothing else on it no longer gets a page.
  planned
    .filter((page) => page.kind === "project")
    .every((page) => page.blocks.every((block) => block.kind !== "filmstrip")),
);

check(
  "collecting images counts every frame the pages will draw",
  (() => {
    const portfolio = createPortfolio({
      projects: [
        {
          id: "p",
          name: "P",
          slides: [
            {
              id: "s",
              title: "S",
              blocks: [
                createBlock("image", {
                  images: [{ id: "a", name: "a", width: 10, height: 10, crop: { x: 0, y: 0, w: 1, h: 1 } }],
                }),
                createBlock("video", {
                  videoPoster: { id: "b", name: "b", width: 10, height: 10, crop: { x: 0, y: 0, w: 1, h: 1 } },
                }),
              ],
            },
          ],
        },
      ],
    });
    const images = collectImages(portfolio);
    return (
      // The section's frame and its poster frame…
      images.some((image) => image.id === "a") &&
      images.some((image) => image.id === "b") &&
      // …and the cover's frame, which nobody chose: with no cover images set, the cover shows the first
      // frames of the work, and the file draws that picture there as well as in the section. Counting it
      // once per drawn use is what makes this list the right one to fetch pixels for.
      images.filter((image) => image.id === "a").length === 2 &&
      images.length === 3
    );
  })(),
);

check(
  "the pixels are collected for what the *store* supplies, too",
  (() => {
    // The bug this pins: a picture placed from the clipboard is an asset id on the section, and the pixels
    // arrive only when the block is resolved with the library. Collecting from the raw document found
    // nothing for it, so the PDF preview fetched no pixels and the file drew an empty frame where the
    // workspace showed the photograph. Planning is what resolves it, so the list comes from the plan.
    const ref = (id: string) => ({
      id,
      name: id,
      width: 10,
      height: 10,
      crop: { x: 0, y: 0, w: 1, h: 1 },
    });
    const library = addAsset(createMediaLibrary(), imageAsset(ref("stored-1")));
    const asset = library.assets[0];
    const placed = createPortfolio({
      projects: [
        {
          id: "pr-stored",
          name: "Stored",
          slides: [{ id: "sl-stored", title: "One", blocks: [createBlock("image", { assetIds: [asset.id] })] }],
        },
      ],
    });
    const withCover = setCoverImage(placed, 0, "stored-1");

    const ids = (portfolio: Portfolio, lib?: typeof library) =>
      collectImages(portfolio, lib).map((image) => image.id);
    /** The workspace reads its plan; the preview reads the document. Both must ask for the same pixels. */
    const fromThePlan = planImageIds(planPortfolio(placed, library));
    const coverFrames = planPortfolio(withCover, library).find((entry) => entry.kind === "cover")?.frames ?? [];
    return (
      // With the store: the image the section placed by id…
      ids(placed, library).includes("stored-1") &&
      // …and the same list whichever surface works it out, because it is one function. This is the bug: the
      // workspace asked from the plan and the preview asked from the raw document, so the preview fetched no
      // pixels for a picture placed from the clipboard and the file drew an empty frame.
      fromThePlan.join(",") === ids(placed, library).join(",") &&
      fromThePlan.includes("stored-1") &&
      // …and the cover frame, which is the document's own and which the file draws on page one. (Chosen
      // explicitly here; with nothing chosen the cover shows the first frames of the work, which is the same
      // picture again — which is why this asserts that the frame is on the cover, not that the total grew.)
      coverFrames.some((image) => image.id === "stored-1") &&
      // Without the store there is nothing to resolve the id against, which is why the library has to travel
      // with the portfolio all the way to the preview.
      !ids(placed).includes("stored-1") &&
      // And the tally a page reports counts them.
      portfolioStats(placed, library).images === ids(placed, library).length
    );
  })(),
);

/* --------------------- the honest capability matrix ----------------------- */

check(
  "every capability is stated with a support level and a caveat",
  PORTFOLIO_CAPABILITIES.length >= 6 &&
    PORTFOLIO_CAPABILITIES.every(
      (entry) =>
        entry.feature.length > 3 &&
        entry.caveat.length > 20 &&
        entry.how.length > 10 &&
        ["universal", "common", "acrobat", "none"].includes(entry.level),
    ),
);
check(
  "images and navigation are claimed as universal, because they are",
  PORTFOLIO_CAPABILITIES.find((entry) => entry.feature === "Images, crops and captions")!.level ===
    "universal" &&
    PORTFOLIO_CAPABILITIES.find((entry) => entry.feature === "Slide-to-slide navigation")!.level ===
      "universal",
);
check(
  "video is not claimed as universal",
  PORTFOLIO_CAPABILITIES.find((entry) => entry.feature === "Video playback")!.level === "acrobat",
);
check(
  "a draggable before/after slider is recorded as impossible, not merely hard",
  PORTFOLIO_CAPABILITIES.find((entry) => entry.feature.includes("slider"))!.level === "none",
);
check(
  "every support level has a plain-English label",
  (["universal", "common", "acrobat", "none"] as const).every(
    (level) => SUPPORT_LABELS[level].length > 5,
  ),
);

/* --------------------------- crop and DPI maths ---------------------------- */

const landscape = { id: "i", name: "i", width: 4000, height: 3000, crop: { x: 0, y: 0, w: 1, h: 1 } };
check(
  "an uncropped image maps to its own pixels",
  sourceRect(landscape).sw === 4000 &&
    sourceRect(landscape).sh === 3000 &&
    croppedAspect(landscape) === 4000 / 3000,
);
check(
  "a crop is fractions of the source, so re-importing keeps the framing",
  (() => {
    const cropped = { ...landscape, crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.25 } };
    const rect = sourceRect(cropped);
    return rect.sx === 1000 && rect.sy === 1500 && rect.sw === 2000 && rect.sh === 750;
  })(),
);
check(
  "a crop is clamped inside the image and cannot collapse",
  (() => {
    const clamped = clampCrop({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
    return (
      clamped.x === 0.5 &&
      clamped.y === 0.5 &&
      clamped.w === 0.5 &&
      clamped.h === 0.5 &&
      clampCrop({ x: -1, y: -1, w: 0, h: 0 }).w === 0.02
    );
  })(),
);
check(
  "a full-width image at seven inches is comfortably sharp",
  dpiVerdict(landscape, 7).level === "good" && placedDpi(landscape, 7) === 571,
  `${dpiVerdict(landscape, 7).dpi} DPI`,
);
check(
  "the same image cropped to an eighth is not, and says so",
  (() => {
    const tight = { ...landscape, crop: { x: 0.4, y: 0.4, w: 0.125, h: 0.5 } };
    const verdict = dpiVerdict(tight, 7);
    return verdict.level === "poor" && verdict.message.includes("DPI");
  })(),
  dpiVerdict({ ...landscape, crop: { x: 0.4, y: 0.4, w: 0.125, h: 0.5 } }, 7).message,
);
check(
  "a mid-range image is called acceptable rather than good or bad",
  (() => {
    const mid = { ...landscape, width: 1000, height: 800 };
    return dpiVerdict(mid, 7).level === "acceptable" && dpiVerdict(mid, 7).dpi === 143;
  })(),
);
check(
  "a zero-width placement cannot produce an infinite DPI claim",
  placedDpi(landscape, 0) === 0,
);

/* ----------------------------- stats warnings ----------------------------- */

check(
  "an empty portfolio is told it is empty rather than reported as ready",
  portfolioStats(createPortfolio()).warnings.some((warning) => /no projects/i.test(warning)),
);
check(
  "a video block with no poster and no link is flagged, because that is the only thing readers get",
  (() => {
    const stats = portfolioStats(
      createPortfolio({
        projects: [
          {
            id: "p",
            name: "P",
            slides: [{ id: "s", title: "S", blocks: [createBlock("video", { title: "Clip" })] }],
          },
        ],
      }),
    );
    return (
      stats.warnings.some((warning) => /poster frame/i.test(warning)) &&
      stats.warnings.some((warning) => /no link/i.test(warning))
    );
  })(),
);
check(
  "a pair with the wrong number of images is flagged",
  (() => {
    const stats = portfolioStats(
      createPortfolio({
        projects: [
          {
            id: "p",
            name: "P",
            slides: [{ id: "s", title: "S", blocks: [createBlock("pair", { images: [] })] }],
          },
        ],
      }),
    );
    return stats.warnings.some((warning) => /exactly two/i.test(warning));
  })(),
);
check(
  "the stats count what the planner produced, not a separate estimate",
  (() => {
    const stats = portfolioStats(portfolio);
    return stats.pages === planned.length && stats.projects === 1 && stats.slides === 2 && stats.filmstrips === 1;
  })(),
  JSON.stringify(portfolioStats(portfolio)),
);

/* -------------------------------------------------------------------------- */

section("21. The media store");

check("a new store is empty and versioned", (() => {
  const library = createMediaLibrary();
  return library.version === MEDIA_LIBRARY_VERSION && library.assets.length === 0;
})());

check("an imported image becomes a retrievable asset", (() => {
  const library = addAsset(createMediaLibrary(), imageAsset(ref("lib-a"), { tags: ["fabrication"] }));
  return assetById(library, "lib-a")?.kind === "image" && libraryStats(library).images === 1;
})());

check("re-adding the same image id replaces rather than duplicates", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("lib-a")));
  library = addAsset(library, imageAsset(ref("lib-a"), { name: "Renamed shot" }));
  return library.assets.length === 1 && assetById(library, "lib-a")?.name === "Renamed shot";
})());

check("a pair yields its halves before/after, whatever order they were stored in", (() => {
  const before = ref("half-before");
  const after = ref("half-after");
  // Written after-first on purpose: the store decides the sequence, not the author's clicks.
  const asset: MediaAsset = {
    ...pairAsset(before, after),
    images: [after, before],
  };
  const library = addAsset(createMediaLibrary(), asset);
  const resolved = imagesForAssets(library, [asset.id]);
  return resolved[0].id === "half-before" && resolved[1].id === "half-after";
})());

check("re-cropping an image updates it everywhere it is used", (() => {
  const library = addAsset(createMediaLibrary(), pairAsset(ref("crop-before"), ref("crop-after")));
  const recropped = { ...ref("crop-before"), crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } };
  const next = replaceImage(library, "crop-before", recropped);
  const images = imagesForAssets(next, [next.assets[0].id]);
  return (
    images[0].crop.w === 0.5 &&
    // The pair's identity survives, so labels and pairing are untouched by a re-crop.
    next.assets[0].pair?.beforeId === "crop-before"
  );
})());

check("filtering works by kind, by tag and by free text", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("f-1"), { tags: ["Clash Detection"] }));
  library = addAsset(library, pairAsset(ref("f-2"), ref("f-3"), { tags: ["clash detection"] }));
  library = addAsset(library, metricAsset({ label: "hours saved", value: "180" }, ["automation"]));
  const byKind = filterAssets(library, { kind: "pair" });
  const byTag = filterAssets(library, { tag: "clash detection" });
  const byQuery = filterAssets(library, { query: "180" });
  return byKind.length === 1 && byTag.length === 2 && byQuery.length === 1 && byQuery[0].kind === "metric";
})());

check("tags are counted case-insensitively and listed by weight", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("t-1"), { tags: ["Clash", "Automation"] }));
  library = addAsset(library, imageAsset(ref("t-2"), { tags: ["clash"] }));
  const tags = libraryTags(library);
  return tags[0].tag === "clash" && tags[0].count === 2 && tags.length === 2;
})());

check("the stats count assets by kind and images in total", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("s-1")));
  library = addAsset(library, pairAsset(ref("s-2"), ref("s-3")));
  library = addAsset(library, textAsset("Some words", "A caption"));
  const stats = libraryStats(library);
  return stats.total === 3 && stats.byKind.image === 1 && stats.byKind.pair === 1 && stats.images === 3;
})());

check("text and metrics are found through their assets", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, textAsset("Coordination caught 40 clashes early.", "Clash narrative"));
  library = addAsset(library, metricAsset({ label: "hours saved", value: "180" }));
  const narrative = library.assets.find((asset) => asset.kind === "text")!;
  const figure = library.assets.find((asset) => asset.kind === "metric")!;
  return (
    // A missing id is simply nothing, not an error: sections outlive the assets they point at.
    textForAssets(library, ["text-nope"]) === undefined &&
    textForAssets(library, [figure.id, narrative.id]) === "Coordination caught 40 clashes early." &&
    metricsForAssets(library, [narrative.id, figure.id])[0].value === "180"
  );
})());

check("removing an asset leaves the rest untouched", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("r-1")));
  library = addAsset(library, imageAsset(ref("r-2")));
  const next = removeAsset(library, "r-1");
  return next.assets.length === 1 && assetById(next, "r-2") !== undefined;
})());

check("seeding from the profile brings the text across, tagged by project", (() => {
  const assets = seedFromProfile([
    { name: "Trade Coordination", summary: "Ran the coordination cycle.", bullets: ["Caught 40 clashes", "   "] },
    { name: "Automation Toolkit", summary: "", bullets: ["Wrote a clash exporter"] },
  ]);
  return (
    assets.length === 3 &&
    assets.every((asset) => asset.kind === "text") &&
    assets[0].tags[0] === "trade coordination" &&
    // Blank bullets are dropped rather than stored as empty assets.
    assets.filter((asset) => asset.text?.trim() === "").length === 0
  );
})());

check("the store never holds the pixels, only references to them", (() => {
  const library = addAsset(createMediaLibrary(), imageAsset(ref("bytes-1")));
  // What goes to localStorage has to stay small: ids and crops, no base64 image data.
  const serialized = JSON.stringify(library);
  return !/data:image/.test(serialized) && serialized.length < 1200;
})());

/* -------------------------------------------------------------------------- */

section("22. Presentation options");

/**
 * A stand-in image reference. The store deals in refs, not pixels, so a test needs nothing
 * more than an id and a natural size.
 */
function ref(id: string): PortfolioImageRef {
  return { id, name: `${id}.jpg`, width: 1600, height: 1000, crop: { x: 0, y: 0, w: 1, h: 1 } };
}

/**
 * The WCAG relative-luminance contrast ratio between two hex colours.
 *
 * Used by the checks that judge colour rather than by anything the app runs: a palette and a set of pad tones are
 * claims about legibility, and a claim that is not measured is a claim that drifts the first time someone likes a
 * hex. The same maths the accessibility guidelines use, so "4.5:1" means what it means everywhere else.
 */
function contrastRatio(a: string, b: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** The relative luminance of a colour, for the checks that ask "is this light?". */
function luminanceOf(hex: string): number {
  // The ratio against white is 1.05 / (L + 0.05), so the luminance comes back out of it — and a pure white
  // gives exactly 1, which is the check on the check.
  return 1.05 / contrastRatio(hex, "#ffffff") - 0.05;
}

check("every option names a capability the matrix actually has", (() => {
  // This is the guarantee that the store cannot offer something the exported PDF cannot do:
  // a typo or a renamed feature would leave an option advertising support that does not exist.
  const features = new Set(PORTFOLIO_CAPABILITIES.map((capability) => capability.feature));
  const unknown = PRESENTATION_OPTIONS.filter((option) => !features.has(option.capability));
  return unknown.length === 0;
})(), PRESENTATION_OPTIONS.filter((option) => !PORTFOLIO_CAPABILITIES.some((c) => c.feature === option.capability)).map((option) => `${option.id} → ${option.capability}`).join(", "));

check("no option leans on a capability that PDF simply cannot do", (() => {
  const impossible = new Set(
    PORTFOLIO_CAPABILITIES.filter((capability) => capability.level === "none").map((c) => c.feature),
  );
  return PRESENTATION_OPTIONS.every((option) => !impossible.has(option.capability));
})());

check("every option carries a caveat in the user's words", (() => {
  return PRESENTATION_OPTIONS.every(
    (option) => option.label.trim().length > 0 && option.summary.trim().length > 0 && option.caveat.trim().length > 0,
  );
})());

check("option ids are unique", (() => {
  const ids = PRESENTATION_OPTIONS.map((option) => option.id);
  return new Set(ids).size === ids.length;
})());

check("a section with one image is not offered a comparison", (() => {
  const menu = availablePresentations({ images: 1, hasPair: false, hasText: false, hasMetric: false, hasUrl: false });
  return (
    menu.includes("full") &&
    menu.includes("framed") &&
    !menu.includes("duo") &&
    !menu.includes("pair-side") &&
    !menu.includes("pair-flip") &&
    !menu.includes("filmstrip")
  );
})());

check("a stored pair unlocks both pair presentations", (() => {
  const content = { images: 2, hasPair: true, hasText: false, hasMetric: false, hasUrl: false };
  const menu = availablePresentations(content);
  return menu.includes("pair-side") && menu.includes("pair-flip") && menu.includes("duo");
})());

check("two loose images are not a before/after pair", (() => {
  // The distinction matters: showing two unrelated views as "before / after" is a false claim,
  // so the pair options stay unavailable until the two halves are stored as a pair.
  const menu = availablePresentations({ images: 2, hasPair: false, hasText: false, hasMetric: false, hasUrl: false });
  return menu.includes("duo") && !menu.includes("pair-side") && !menu.includes("pair-flip");
})());

check("the picker explains why an option is missing rather than hiding it", (() => {
  const entries = optionAvailability({ images: 2, hasPair: false, hasText: false, hasMetric: false, hasUrl: false });
  const flip = entries.find((entry) => entry.option.id === "pair-flip");
  const metrics = entries.find((entry) => entry.option.id === "metrics");
  const video = entries.find((entry) => entry.option.id === "video");
  return (
    flip?.available === false &&
    flip.reason === "needs a stored before / after pair" &&
    metrics?.reason === "needs a metric asset" &&
    video?.reason === "needs a link or a video poster"
  );
})());

check("a grid says how many frames it can hold", (() => {
  const entries = optionAvailability({ images: 5, hasPair: false, hasText: false, hasMetric: false, hasUrl: false });
  return entries.find((entry) => entry.option.id === "grid")?.reason === "shows up to 4 — this section holds 5";
})());

check("a chosen option normalises to what the planner understands", (() => {
  const flip = applyPresentation(createBlock("image", { presentation: "pair-flip" }));
  const grid = applyPresentation(createBlock("image", { presentation: "grid" }));
  const strip = applyPresentation(createBlock("image", { presentation: "filmstrip" }));
  const notes = applyPresentation(
    createBlock("markup", {
      annotations: [{ id: "a1", kind: "box", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
    }),
  );
  const annotated = applyPresentation({ ...notes, presentation: "annotate" });
  return (
    flip.kind === "pair" &&
    flip.pairMode === "flip" &&
    grid.kind === "image" &&
    grid.columns === 2 &&
    strip.kind === "filmstrip" &&
    notes.annotations[0].asAnnotation === undefined &&
    annotated.annotations[0].asAnnotation === true
  );
})());

/**
 * Options whose inferred presentation differs from the one applied.
 *
 * Each option is given content that satisfies it — the full complement, capped at four, since
 * a two-by-two grid holding only two images genuinely is a two-frame row.
 */
function roundTripMismatches(): string[] {
  return PRESENTATION_OPTIONS.filter((option) => {
    const count = Math.max(1, Math.min(option.requires.images?.max ?? 1, 4));
    const block = createBlock(option.blockKind, {
      presentation: option.id,
      images: [ref("rt-1"), ref("rt-2"), ref("rt-3"), ref("rt-4")].slice(0, count),
      annotations: [{ id: "an-1", kind: "box", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
    });
    return inferPresentation(applyPresentation(block)) !== option.id;
  }).map((option) => option.id);
}

check("applying an option and reading it back returns the same option", (() => {
  // The picker shows the inferred option for sections authored before it existed, so the two
  // have to agree. "Framed with caption" is the one honest exception: a single image with a
  // title is framed and the same image with none is full bleed, so an empty framed block reads
  // back as full bleed. Both are the single-image family, pinned down by the assertion below.
  const mismatches = roundTripMismatches();
  return mismatches.length === 1 && mismatches[0] === "framed";
})(), `mismatched: ${roundTripMismatches().join(", ") || "none"}`);

check("the full bleed and framed options share one family, in order", (() => {
  const bare = applyPresentation(createBlock("image", { presentation: "full", images: [ref("fam-1")] }));
  const titled = applyPresentation(
    createBlock("image", { presentation: "framed", images: [ref("fam-1")], title: "Level 4 plant room" }),
  );
  return inferPresentation(bare) === "full" && inferPresentation(titled) === "framed" && bare.kind === titled.kind;
})());

check("a block with no option set is left exactly as it was", (() => {
  const original = createBlock("image", { title: "Untouched", columns: 1 });
  const applied = applyPresentation(original);
  return applied === original || JSON.stringify(applied) === JSON.stringify(original);
})());

check("only the options that own pages are flagged as page-adding", (() => {
  const ids = pageAddingPresentations().map((option) => option.id).sort();
  return ids.length === 2 && ids[0] === "filmstrip" && ids[1] === "pair-flip";
})());

/* -------------------------------------------------------------------------- */

section("23. The store feeding the planner");

/** A one-project document whose single section holds whatever the test needs to exercise. */
function storePortfolio(block: PortfolioBlock): Portfolio {
  return createPortfolio({
    title: "Stored Work",
    pageSize: "letter",
    projects: [
      {
        id: "sp",
        name: "Coordination",
        slides: [{ id: "ss", title: "The change", blocks: [block] }],
      },
    ],
  });
}

check("a section with no assets keeps the images it holds", (() => {
  const block = createBlock("image", { images: [ref("loose-1")] });
  const library = addAsset(createMediaLibrary(), imageAsset(ref("other")));
  const resolved = resolveBlock(block, library);
  return resolved.images.length === 1 && resolved.images[0].id === "loose-1";
})());

check("images come from the store when the section names assets", (() => {
  const library = addAsset(createMediaLibrary(), imageAsset(ref("stored-1")));
  const resolved = resolveBlock(createBlock("image", { assetIds: ["stored-1"] }), library);
  return resolved.images.length === 1 && resolved.images[0].id === "stored-1";
})());

check("a deleted asset leaves the stale reference rather than blanking the section", (() => {
  // Blanking would silently delete a page from the deck; a stale reference is visible and
  // recoverable, which is the safer failure.
  const block = createBlock("image", { assetIds: ["gone"], images: [ref("kept")] });
  const resolved = resolveBlock(block, createMediaLibrary());
  return resolved.images.length === 1 && resolved.images[0].id === "kept";
})());

check("text and metrics fill their sections from the store", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, textAsset("Four trade packages coexisted.", "Brief"));
  library = addAsset(library, metricAsset({ label: "hours saved", value: "180" }));
  const book = library.assets.find((asset) => asset.kind === "text")!;
  const figure = library.assets.find((asset) => asset.kind === "metric")!;
  const text = resolveBlock(createBlock("text", { assetIds: [book.id] }), library);
  const metrics = resolveBlock(createBlock("metrics", { assetIds: [figure.id] }), library);
  return (
    text.body === "Four trade packages coexisted." &&
    (metrics.metrics ?? []).length === 1 &&
    metrics.metrics?.[0].value === "180"
  );
})());

check("a video section takes its link from the store", (() => {
  const library = addAsset(
    createMediaLibrary(),
    posterAsset(ref("poster-1"), { url: "https://example.com/walkthrough", label: "Walkthrough" }),
  );
  const resolved = resolveBlock(createBlock("video", { assetIds: ["poster-poster-1"] }), library);
  return resolved.videoUrl === "https://example.com/walkthrough" && resolved.videoPoster?.id === "poster-1";
})());

check("a stored pair drives the flip, labels and all", (() => {
  const library = addAsset(
    createMediaLibrary(),
    pairAsset(ref("clash-1"), ref("clash-2"), { beforeLabel: "Week 1", afterLabel: "Week 6" }),
  );
  const asset = library.assets[0];
  const block = createBlock("pair", { presentation: "pair-flip", assetIds: [asset.id] });
  const pages = planPortfolio(storePortfolio(block), library).filter((page) => page.kind === "flip");
  return (
    pages.length === 2 &&
    pages[0].flip?.label === "Week 1" &&
    pages[1].flip?.label === "Week 6" &&
    pages[0].flip?.image.id === "clash-1" &&
    // Two loose images would have been refused this option; a stored pair makes it real.
    pages[1].flip?.image.id === "clash-2"
  );
})());

check("the same section can be presented differently without touching its content", (() => {
  // This is the point of splitting the store from the presentation: one stored pair, three
  // presentations, identical content, and the page plan says exactly what each one costs.
  const library = addAsset(createMediaLibrary(), pairAsset(ref("same-1"), ref("same-2")));
  const asset = library.assets[0];
  const plans = ["pair-side", "pair-flip", "duo"].map((presentation) => {
    const block = createBlock("pair", {
      presentation: presentation as PortfolioBlock["presentation"],
      assetIds: [asset.id],
    });
    const pages = planPortfolio(storePortfolio(block), library);
    return `${presentation}:${pages.map((page) => page.kind).join("+")}`;
  });
  return (
    plans[0] === "pair-side:cover+project" &&
    // The flipped pair owns its two pages, and the section has no body of its own, so there is no
    // letter page in front of them.
    plans[1] === "pair-flip:cover+flip+flip" &&
    plans[2] === "duo:cover+project"
  );
})(), "a stored pair shown three ways");

check("a filmstrip built from the store takes its own wide pages", (() => {
  let library = createMediaLibrary();
  for (const id of ["w1", "w2", "w3", "w4", "w5"]) library = addAsset(library, imageAsset(ref(id)));

  const build = (count: number) =>
    createBlock("filmstrip", {
      presentation: "filmstrip",
      assetIds: library.assets.slice(0, count).map((asset) => asset.id),
    });

  // Four frames fill one row; the fifth flows onto a second wide page, which is the cap doing its
  // job rather than shrinking frames until they are unreadable. The cover plus the rows are the
  // whole document: a filmstrip section with no body of its own adds no page of its own.
  const four = planPortfolio(storePortfolio(build(4)), library);
  const five = planPortfolio(storePortfolio(build(5)), library);
  return (
    four.filter((page) => page.kind === "filmstrip").length === 1 &&
    four.filter((page) => page.kind === "filmstrip")[0].frames?.length === 4 &&
    four.length === 2 &&
    five.filter((page) => page.kind === "filmstrip").length === 2 &&
    five.length === 3
  );
})());

check("documents written before the store existed plan identically", (() => {
  // The back-compatibility guarantee, asserted rather than assumed: a library must not change
  // the plan for a document that references no assets and chooses no presentation.
  const legacy = storePortfolio(createBlock("image", { images: [ref("old-1")] }));
  const library = addAsset(createMediaLibrary(), imageAsset(ref("unused")));
  const withoutLibrary = JSON.stringify(planPortfolio(legacy).map((page) => page.id));
  const withLibrary = JSON.stringify(planPortfolio(legacy, library).map((page) => page.id));
  return withoutLibrary === withLibrary;
})());

check("assets and presentations survive a save and load round trip", (() => {
  const library = addAsset(createMediaLibrary(), pairAsset(ref("rt-1"), ref("rt-2")));
  const block = createBlock("pair", { presentation: "pair-flip", assetIds: [library.assets[0].id] });
  const saved = JSON.parse(JSON.stringify(storePortfolio(block)));
  const pages = planPortfolio(saved, JSON.parse(JSON.stringify(library)));
  return pages.filter((page) => page.kind === "flip").length === 2;
})());

/* -------------------------------------------------------------------------- */

section("24. Persistence, and bytes that survive the browser");

check("a portfolio survives a save and load, presentations included", (() => {
  const library = addAsset(createMediaLibrary(), pairAsset(ref("p-1"), ref("p-2")));
  const saved = storePortfolio(
    createBlock("pair", { presentation: "pair-flip", assetIds: [library.assets[0].id] }),
  );
  const loaded = migratePortfolio(JSON.parse(JSON.stringify(saved)));
  const loadedLibrary = migrateMediaLibrary(JSON.parse(JSON.stringify(library)));
  return (
    loaded !== null &&
    planPortfolio(loaded, loadedLibrary).filter((page) => page.kind === "flip").length === 2
  );
})());

check("a document that was never a portfolio reads as none, not as an empty one", (() => {
  // Null is a state the page shows as an invitation to start; an empty document would hide it.
  return (
    migratePortfolio(null) === null &&
    migratePortfolio({}) === null &&
    migratePortfolio({ title: "no projects" }) === null
  );
})());

check("a damaged document is repaired field by field rather than rejected", (() => {
  const repaired = migratePortfolio({
    title: "",
    pageSize: "a3",
    projects: [{ id: "x", name: "Kept", slides: [{ id: "y", title: "Section" }] }],
  });
  return (
    repaired?.pageSize === "letter" &&
    // An empty title falls back to the default rather than leaving a blank cover.
    repaired.title === "Selected Work" &&
    repaired.transitions === true &&
    repaired.projects[0].slides[0].blocks.length === 0
  );
})());

check("a look survives a reload, and a look from the future does not", (() => {
  // The theme rides on the document, so it goes through the same door as everything else: kept when it is
  // recognised, dropped axis by axis when it is not, and absent when there is nothing left of it — which is
  // what keeps a document from an older version opening as the document it was.
  const base = {
    projects: [{ id: "x", name: "Kept", slides: [{ id: "y", title: "Section" }] }],
  };
  const kept = migratePortfolio({ ...base, theme: { scheme: "plum", type: "editorial", scale: "roomy" } });
  const partial = migratePortfolio({ ...base, theme: { scheme: "forest", scale: "spacious" } });
  const junk = migratePortfolio({ ...base, theme: { scheme: "chartreuse" } });
  const notAnObject = migratePortfolio({ ...base, theme: "plum" });
  return (
    kept?.theme?.scheme === "plum" && kept.theme.type === "editorial" && kept.theme.scale === "roomy" &&
    partial?.theme?.scheme === "forest" && partial.theme.scale === undefined &&
    junk?.theme === undefined &&
    notAnObject?.theme === undefined &&
    // And a document with no theme is not given an empty one.
    migratePortfolio(base)?.theme === undefined &&
    // The cover's contact block goes through the same door, links included.
    migratePortfolio({
      ...base,
      contact: { email: "you@example.com", links: [{ label: "x", url: "javascript:alert(1)" }] },
    })?.contact?.email === "you@example.com" &&
    migratePortfolio({
      ...base,
      contact: { email: "you@example.com", links: [{ label: "x", url: "javascript:alert(1)" }] },
    })?.contact?.links === undefined &&
    migratePortfolio({ ...base, contact: { email: "  " } })?.contact === undefined
  );
})());

check("one corrupt asset costs that asset, not the library", (() => {
  const library = migrateMediaLibrary({
    version: 99,
    assets: [
      imageAsset(ref("good-1")),
      { name: "no id or kind" },
      { id: "text-1", kind: "text" },
    ],
  });
  return (
    library.version === MEDIA_LIBRARY_VERSION &&
    library.assets.length === 2 &&
    // Fields a hand-edited file might be missing are filled in rather than left undefined.
    library.assets[1].tags.length === 0 &&
    library.assets[1].images.length === 0
  );
})());

check("a backup from before the portfolio existed still imports", (() => {
  const legacy = JSON.stringify({
    app: "career-matrix",
    version: 1,
    exportedAt: "2025-01-01T00:00:00.000Z",
    profile: createSeedProfile(),
    draft: { rawText: "" },
    applications: [],
  });
  const result = parseImport(legacy);
  return (
    result.ok === true &&
    result.kind === "bundle" &&
    result.bundle.portfolio === null &&
    result.bundle.mediaLibrary?.assets.length === 0
  );
})());

check("bytes round-trip exactly, including the range that bites in browsers", (() => {
  // 0x80–0x9F is where TextDecoder("latin1") silently remaps to windows-1252 in a browser,
  // which would corrupt a compressed stream inside an exported PDF.
  const bytes = new Uint8Array([0x00, 0x0a, 0x25, 0x80, 0x8f, 0x9f, 0xa0, 0xff, 0x50, 0x44, 0x46]);
  const round = stringToBytes(bytesToString(bytes));
  return round.length === bytes.length && bytes.every((byte, index) => round[index] === byte);
})());

check("a patched PDF survives a byte round trip through the browser path", (() => {
  // The same sequence an export takes: bytes → string → patch → bytes. The xref claims object 1
  // sits at offset 9, which is where it does sit, so the patch has something real to rebuild.
  const original =
    "%PDF-1.4\n1 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
    "xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n" +
    "trailer\n<< /Size 2 >>\nstartxref\n58\n%%EOF\n";

  const patched = withPageTransitions(bytesToString(stringToBytes(original)));
  const back = stringToBytes(patched);
  return (
    countTransitions(patched) === 1 &&
    // Re-encoding did not change the byte count the patch added.
    back.length === patched.length &&
    bytesToString(back).includes("/Type /Trans")
  );
})());

/* -------------------------------------------------------------------------- */

section("25. Provider wiring: a click has to be visible without a reload");

/**
 * The context value and the dependency list that gates it, read out of the component.
 *
 * A value that lists something the dependencies omit is invisible: the memo returns the previous
 * object, consumers keep rendering yesterday's state, and the change only appears after a reload.
 * That is exactly the bug this checks for, so it is checked structurally rather than by eye.
 */
function providerMemo(): { keys: string[]; deps: string[] } {
  const source = readFileSync(join(process.cwd(), "components", "WorkspaceProvider.tsx"), "utf8");
  const start = source.indexOf("const value = React.useMemo<WorkspaceValue>(");
  const block = source.slice(start);
  const object = /\(\) => \(\{([\s\S]*?)\}\),\s*\[/.exec(block);
  const deps = /\[([\s\S]*?)\],\s*\);\s*\n\s*return/.exec(block);
  const entries = (text: string) =>
    [...text.matchAll(/^\s{6}([A-Za-z_$][\w$]*),$/gm)].map((match) => match[1]);
  return {
    keys: object ? entries(object[1]) : [],
    deps: deps ? entries(deps[1]) : [],
  };
}

check("the context value and its dependencies stay in step", (() => {
  const { keys, deps } = providerMemo();
  const missing = keys.filter((key) => !deps.includes(key));
  // A vacuous pass would be worse than no check, so the parse is asserted to have found both sides.
  return keys.length > 25 && deps.length > 25 && missing.length === 0;
})(), (() => {
  const { keys, deps } = providerMemo();
  const missing = keys.filter((key) => !deps.includes(key));
  return missing.length ? `missing from deps: ${missing.join(", ")}` : `${keys.length} keys / ${deps.length} deps`;
})());

check("every screen's state is exposed with its setter", (() => {
  const { keys } = providerMemo();
  return [
    "portfolio",
    "updatePortfolio",
    "mediaLibrary",
    "updateMediaLibrary",
    "mapSettings",
    "updateMapSettings",
    // The map's lookup comes through the context too, so the cache it fills is the one that gets persisted.
    "geocode",
  ].every((key) => keys.includes(key));
})());

check("re-reading an unchanged store keeps the same reference, so no loop", (() => {
  // The loop the guard prevents: write → broadcast → read (a new object every time) → state
  // change → write-back effect → write. `syncedValue` has to return the *current* reference,
  // not merely an equal one, or React cannot bail out.
  const stored: unknown = { version: 1, assets: [], updatedAt: "2026-01-01T00:00:00.000Z" };
  const onScreen = JSON.parse(JSON.stringify(stored)) as unknown;
  const reread = JSON.parse(JSON.stringify(stored)) as unknown;
  return (
    onScreen !== reread &&
    sameJson(onScreen, reread) &&
    syncedValue(onScreen, reread) === onScreen
  );
})());

check("a genuine change from another screen still lands", (() => {
  const onScreen = { version: 1, assets: [], updatedAt: "2026-01-01T00:00:00.000Z" };
  const fromElsewhere = { version: 1, assets: [{ id: "text-1" }], updatedAt: "2026-01-01T00:00:01.000Z" };
  return syncedValue(onScreen, fromElsewhere) === fromElsewhere;
})());

check("a write-time stamp alone does not count as a change", (() => {
  // The stores stamp a fresh `updatedAt` on every write, so a read-back differs from the screen
  // every single time. Without this the guard would never bail out and the loop would come back
  // through the timestamp instead of the content.
  const onScreen = { version: 1, assets: [], updatedAt: "2026-01-01T00:00:00.000Z" };
  const justWritten = { version: 1, assets: [], updatedAt: "2026-01-01T00:00:07.123Z" };
  return sameJson(onScreen, justWritten) === false && syncedValue(onScreen, justWritten) === onScreen;
})());

check("the store broadcasts a write in this tab, which is why the guard is needed", (() => {
  // Installs the jsdom window as a global for this check only: `subscribe` needs one, and without
  // the global there is nothing to prove the broadcast happens at all.
  const syncDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = { window: globals.window, CustomEvent: globals.CustomEvent, localStorage: globals.localStorage };
  globals.window = syncDom.window;
  globals.CustomEvent = syncDom.window.CustomEvent;
  globals.localStorage = syncDom.window.localStorage;

  let notifications = 0;
  const unsubscribe = subscribe(STORAGE_KEYS.portfolio, () => {
    notifications += 1;
  });
  portfolioStore.write(createPortfolio({ title: "Broadcast check" }));
  const readBack = portfolioStore.read();
  unsubscribe();

  globals.window = previous.window;
  globals.CustomEvent = previous.CustomEvent;
  globals.localStorage = previous.localStorage;

  return notifications === 1 && readBack?.title === "Broadcast check";
})());

/* -------------------------------------------------------------------------- */

section("26. Templates, companions, and editing the document");

check("every template slot names a real presentation", (() => {
  // A typo here would produce a section the planner cannot present, so it is checked against the
  // registry rather than trusted.
  const ids = new Set(PRESENTATION_OPTIONS.map((option) => option.id));
  const bad = PORTFOLIO_TEMPLATES.flatMap((template) =>
    template.sections
      .filter((slot) => !ids.has(slot.presentation))
      .map((slot) => `${template.id}/${slot.title}`),
  );
  return PORTFOLIO_TEMPLATES.length >= 4 && bad.length === 0;
})(), PORTFOLIO_TEMPLATES.map((template) => `${template.id}: ${templatePreview(template)}`).join(" · "));

check("a template on an empty store gives structure without content", (() => {
  const template = templateById("case-study")!;
  const project = applyTemplate(template, { name: "Demo", library: createMediaLibrary(), id: "pr-t1" });
  return (
    project.slides.length === template.sections.length &&
    project.slides.every((slide) => (slide.blocks[0].assetIds ?? []).length === 0) &&
    project.slides[0].title === "Brief"
  );
})());

check("a template places everything that was loaded, leaving nothing stranded", (() => {
  // The macro promise: load twelve frames and pick a five-slot template, and all twelve land.
  let library = createMediaLibrary();
  for (let index = 0; index < 9; index += 1) library = addAsset(library, imageAsset(ref(`t-img-${index}`)));
  library = addAsset(library, pairAsset(ref("t-pair-a"), ref("t-pair-b")));
  library = addAsset(library, textAsset("Four trade packages shared one model.", "Brief text"));
  library = addAsset(library, metricAsset({ label: "clashes resolved", value: "1,240" }));
  library = addAsset(library, metricAsset({ label: "weeks saved", value: "6" }));

  const project = applyTemplate(templateById("one-pager")!, { name: "Placed", library, id: "pr-t2" });
  return (
    library.assets.length === 13 &&
    placedAssetIds(project).length === 13 &&
    // Seven frames left over, in rows of four, plus the pair given its own comparison section.
    project.slides.filter((slide) => slide.title === "More work").length === 2 &&
    project.slides.some((slide) => slide.blocks[0].kind === "pair")
  );
})(), "13 assets in, 13 assets placed");

check("cards put several captioned pieces on one page", (() => {
  // The layout the whole refinement is about: a page is not one section, it is a composition of
  // two or three — each a photograph with its own description under it.
  let library = createMediaLibrary();
  for (const id of ["card-1", "card-2", "card-3"]) library = addAsset(library, imageAsset(ref(id)));
  const project = applyTemplate(templateById("one-pager")!, { name: "Cards", library, id: "pr-cards" });
  const block = project.slides[0].blocks[0];
  const pages = planPortfolio(createPortfolio({ projects: [project] }), library);

  return (
    block.presentation === "cards" &&
    (block.assetIds ?? []).length === 3 &&
    // One page for the three pieces, not three pages. The planner prefixes the project id, and a
    // template's section ids already carry their own stamp, so the page id repeats it.
    pages.filter((page) => page.id === "pr-cards:pr-cards-s0").length === 1 &&
    (pages.find((page) => page.id === "pr-cards:pr-cards-s0")?.blocks[0].assetIds ?? []).length === 3
  );
})(), "three pieces, one page");

check("the description under a card is the text tied to that photograph", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("cap-1")));
  library = addAsset(library, imageAsset(ref("cap-2")));
  library = addAsset(library, textAsset("Level 4 ceiling void, week 6.", "Caption one"));
  library = addAsset(library, textAsset("Plant room riser, signed off.", "Caption two"));
  // Named lookups rather than positions: the store prepends, so the array order is newest first.
  const byName = (name: string) => library.assets.find((asset) => asset.name === name)!.id;
  library = tieCompanion(library, "cap-1", byName("Caption one"));
  library = tieCompanion(library, "cap-2", byName("Caption two"));

  const resolved = resolveBlock(
    createBlock("image", { presentation: "cards", assetIds: ["cap-1", "cap-2"] }),
    library,
  );
  return (
    resolved.images.length === 2 &&
    resolved.images[0].caption === "Level 4 ceiling void, week 6." &&
    resolved.images[1].caption === "Plant room riser, signed off."
  );
})());

check("a card caption does not write through to the store", (() => {
  // The refs are the store's own objects: stamping a caption onto one would change the description
  // under every other card showing the same photograph.
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("ro-1")));
  library = addAsset(library, imageAsset(ref("ro-2")));
  library = addAsset(library, textAsset("Belongs to the first frame only.", "Shared"));
  library = tieCompanion(library, "ro-1", library.assets.find((asset) => asset.text)!.id);
  const before = assetById(library, "ro-2")!.images[0].caption;

  const resolved = resolveBlock(
    createBlock("image", { presentation: "cards", assetIds: ["ro-1", "ro-2"] }),
    library,
  );
  return (
    resolved.images[0].caption === "Belongs to the first frame only." &&
    resolved.images[1].caption === undefined &&
    assetById(library, "ro-2")!.images[0].caption === before
  );
})());

check("fewer frames than cards still fill the page", (() => {
  // Two photographs and a 2-up row is a cards page too; the menu allows two so a page is never
  // half empty because there were not three things to show.
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("two-1")));
  library = addAsset(library, imageAsset(ref("two-2")));
  const menu = availablePresentations({ images: 2, hasPair: false, hasText: false, hasMetric: false, hasUrl: false });
  const resolved = resolveBlock(
    createBlock("image", { presentation: "cards", assetIds: ["two-1", "two-2"] }),
    library,
  );
  return menu.includes("cards") && resolved.images.length === 2 && resolved.layout === "cards";
})());

check("a template leans on cards, so its pages hold pieces rather than prose", (() => {
  const cards = PORTFOLIO_TEMPLATES.flatMap((template) =>
    template.sections.filter((slot) => slot.presentation === "cards"),
  );
  // Three templates offer a cards page, each asking for the two or three pieces a page holds.
  return cards.length >= 3 && cards.every((slot) => slot.images >= 2 && slot.images <= 3);
})());

/* ---------------------- a page holding several things ---------------------- */

check("a page can hold several blocks, and stays one page", (() => {
  // The composition the editor now allows: a cards row, then the numbers, on the same page.
  let library = createMediaLibrary();
  for (const id of ["comp-1", "comp-2"]) library = addAsset(library, imageAsset(ref(id)));
  for (const [label, value] of [["clashes", "1,240"], ["weeks", "6"]]) {
    library = addAsset(library, metricAsset({ label, value }));
  }
  const [metricA, metricB] = library.assets.filter((asset) => asset.metric).map((asset) => asset.id);

  const portfolio = createPortfolio({
    title: "Composed",
    projects: [
      {
        id: "pr-comp",
        name: "Composed",
        slides: [
          {
            id: "sl-comp",
            title: "One page",
            blocks: [
              createBlock("image", { presentation: "cards", title: "The work", assetIds: ["comp-1", "comp-2"] }),
              createBlock("image", { presentation: "metrics", title: "Numbers", assetIds: [metricA, metricB] }),
            ],
          },
        ],
      },
    ],
  });

  const pages = planPortfolio(portfolio, library);
  const section = pages.find((page) => page.id === "pr-comp:sl-comp");
  return (
    pages.filter((page) => page.kind === "project").length === 1 &&
    (section?.blocks.length ?? 0) === 2 &&
    (section?.blocks[0].images.length ?? 0) === 2 &&
    (section?.blocks[1].metrics?.length ?? 0) === 2
  );
})(), "cards + metrics, one page");

check("blocks can be reordered within their page", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-order",
        name: "Order",
        slides: [
          {
            id: "sl-order",
            title: "Page",
            blocks: [
              createBlock("image", { id: "bl-a", presentation: "full" }),
              createBlock("image", { id: "bl-b", presentation: "metrics" }),
            ],
          },
        ],
      },
    ],
  });
  const down = moveBlock(portfolio, "bl-a", 1);
  const up = moveBlock(portfolio, "bl-a", -1);
  return (
    down.projects[0].slides[0].blocks.map((block) => block.id).join(",") === "bl-b,bl-a" &&
    up.projects[0].slides[0].blocks.map((block) => block.id).join(",") === "bl-a,bl-b"
  );
})());

check("a description typed in the store becomes the line under the card", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("desc-1")));
  library = updateAsset(library, "desc-1", { description: "Level 4 ceiling void, week 6." });

  const resolved = resolveBlock(
    createBlock("image", { presentation: "cards", assetIds: ["desc-1", "desc-1"] }),
    library,
  );
  return resolved.images[0].caption === "Level 4 ceiling void, week 6.";
})());

check("text tied to a frame still wins over the one-line description", (() => {
  // Two ways to write the same thing: the explicit tie is the more deliberate of the two, so it is
  // the one that shows.
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("both-1")));
  library = addAsset(library, textAsset("The tied caption.", "Tied"));
  library = updateAsset(library, "both-1", { description: "The quick description." });
  library = tieCompanion(library, "both-1", library.assets.find((asset) => asset.text)!.id);

  const resolved = resolveBlock(
    createBlock("image", { presentation: "cards", assetIds: ["both-1", "both-1"] }),
    library,
  );
  return resolved.images[0].caption === "The tied caption.";
})());

check("a description is not mistaken for a text asset to fill slots from", (() => {
  // `description` annotates a photograph; `text` marks something as a piece of writing. Conflating
  // them would make template slots pull captions out of the image store as if they were prose.
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("only-desc")));
  library = updateAsset(library, "only-desc", { description: "Just a caption." });
  const project = applyTemplate(templateById("one-pager")!, { name: "No prose", library, id: "pr-desc" });
  const notes = project.slides.filter((slide) => slide.title === "Notes");
  return library.assets.filter((asset) => Boolean(asset.text)).length === 0 && notes.length === 0;
})());

check("a template gives guidance on pages it has, and none on pages the rows own", (() => {
  // The purpose line is what the section is for, and it belongs in the document where the user will
  // type over it — but a filmstrip or a flip owns its pages, and a one-sentence body there would add
  // a heading-only page in front of the content.
  const library = addAsset(createMediaLibrary(), imageAsset(ref("tpl-hint-1")));
  const project = applyTemplate(templateById("case-study")!, { name: "Hints", library, id: "pr-h1" });
  const brief = project.slides.find((slide) => slide.title === "Brief")!;
  const sequence = project.slides.find((slide) => slide.title === "Sequence")!;
  const pages = planPortfolio(createPortfolio({ projects: [project] }), library);
  return (
    (brief.body ?? "").includes("at stake") &&
    sequence.body === undefined &&
    // The filmstrip section contributes its wide page and nothing in front of it.
    pages.filter((page) => page.title === "Sequence").every((page) => page.kind === "filmstrip")
  );
})());

check("a pair slot prefers a stored pair over two loose images", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("loose-a")));
  library = addAsset(library, imageAsset(ref("loose-b")));
  const pair = pairAsset(ref("stored-a"), ref("stored-b"), { beforeLabel: "Week 1", afterLabel: "Week 6" });
  library = addAsset(library, pair);
  const project = applyTemplate(templateById("change")!, { name: "Change", library, id: "pr-t3" });
  const change = project.slides.find((slide) => slide.title === "The change")!;
  return (change.blocks[0].assetIds ?? [])[0] === pair.id;
})());

check("a templated project plans to pages, flip and filmstrip included", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, pairAsset(ref("plan-a"), ref("plan-b")));
  for (let index = 0; index < 4; index += 1) library = addAsset(library, imageAsset(ref(`plan-${index}`)));
  const project = applyTemplate(templateById("case-study")!, { name: "Planned", library, id: "pr-t4" });
  const portfolio = createPortfolio({ projects: [project] });
  const kinds = planPortfolio(portfolio, library).map((page) => page.kind);
  return (
    kinds.includes("cover") &&
    kinds.filter((kind) => kind === "flip").length === 2 &&
    kinds.filter((kind) => kind === "filmstrip").length >= 1
  );
})(), "the template's slots decide the page kinds");

check("a caption tied to an image follows it into a section", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("host-1")));
  library = addAsset(library, textAsset("Ceiling void, week 1 to 6.", "Clash caption"));
  library = tieCompanion(library, "host-1", library.assets.find((asset) => asset.text)!.id);

  const resolved = resolveBlock(
    createBlock("image", { presentation: "framed", assetIds: ["host-1"] }),
    library,
  );
  return resolved.images.length === 1 && resolved.body === "Ceiling void, week 1 to 6.";
})());

check("a number tied to an image rides along, and the presentation decides", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("host-2")));
  library = addAsset(library, metricAsset({ label: "clashes resolved", value: "1,240" }));
  library = tieCompanion(library, "host-2", library.assets.find((asset) => asset.metric)!.id);

  // The same placed asset, presented two ways: the metric is attached in both, and only the
  // metrics row puts it on the page.
  const asNumbers = resolveBlock(
    createBlock("image", { presentation: "metrics", assetIds: ["host-2"] }),
    library,
  );
  const asPicture = resolveBlock(
    createBlock("image", { presentation: "full", assetIds: ["host-2"] }),
    library,
  );
  return (
    asNumbers.kind === "metrics" &&
    (asNumbers.metrics ?? []).length === 1 &&
    asPicture.kind === "image" &&
    (asPicture.metrics ?? []).length === 1
  );
})(), "same content, two presentations");

check("deleting a section, a project or a block leaves the rest intact", (() => {
  const library = addAsset(createMediaLibrary(), imageAsset(ref("edit-1")));
  const project = applyTemplate(templateById("one-pager")!, { name: "Edits", library, id: "pr-e1" });
  const portfolio = createPortfolio({ projects: [project, { ...project, id: "pr-e2", name: "Second" }] });

  const withoutProject = removeProject(portfolio, "pr-e2");
  const withoutSlide = removeSlide(portfolio, "pr-e1-s0");
  const withoutBlock = removeBlock(portfolio, project.slides[0].blocks[0].id);
  return (
    withoutProject.projects.length === 1 &&
    withoutSlide.projects[0].slides.length === 1 &&
    withoutBlock.projects[0].slides[0].blocks.length === 0 &&
    // And the page plan shrinks with the document, rather than keeping a ghost page.
    planPortfolio(withoutSlide).length < planPortfolio(portfolio).length
  );
})());

check("a project can be emptied, and an empty page is still a page", (() => {
  // This used to refuse, which read as a delete button that did not work. It is allowed now: an
  // empty project says "0 sections", and the way back is the Add a page button next to it.
  const project = applyTemplate(templateById("one-pager")!, {
    name: "One",
    library: createMediaLibrary(),
    id: "pr-e3",
  });
  const portfolio = createPortfolio({ projects: [project] });
  const once = removeSlide(portfolio, "pr-e3-s0");
  const twice = removeSlide(once, "pr-e3-s1");
  const noPages = planPortfolio(twice).length;

  // A page you added and have not filled yet is still a page — it is where the next section goes —
  // so "Add a page" does not look like it did nothing. A project with no pages at all contributes
  // nothing to the plan.
  const { portfolio: withBlank, slideId } = addSlide(portfolio, "pr-e3", "Arranging");
  const planned = planPortfolio(withBlank);
  return (
    once.projects[0].slides.length === project.slides.length - 1 &&
    twice.projects[0].slides.length === 0 &&
    noPages === planPortfolio(portfolio).length - project.slides.length &&
    planned.some((page) => page.id === `pr-e3:${slideId}` && page.blocks.length === 0) &&
    planned.length === planPortfolio(portfolio).length + 1
  );
})());

{
  const slot = (id: string, span?: number) => createBlock("image", { id, ...(span ? { span } : {}) });
  const shape = (blocks: PortfolioBlock[]) =>
    rowsOf(blocks)
      .map((row) => row.map((block) => block.id).join("+"))
      .join(" | ");
  // Every case as spans in, grouping out. Full width is alone; two halves share one row; three
  // thirds share; four quarters share; and a half plus two thirds is two rows, because the second
  // cannot be squeezed in beside the first.
  const ids = "abcdefgh";
  const cases: { spans: number[]; expect: string }[] = [
    { spans: [12], expect: "a" },
    { spans: [6, 6], expect: "a+b" },
    { spans: [4, 4, 4], expect: "a+b+c" },
    { spans: [3, 3, 3, 3], expect: "a+b+c+d" },
    { spans: [8, 4], expect: "a+b" },
    // A half and a third fit together, so they share the row and the third third starts the next
    // one. The rule is greedy — a section sits as high on the page as its width allows.
    { spans: [6, 4, 4], expect: "a+b | c" },
    { spans: [3, 3, 3, 3, 3], expect: "a+b+c+d | e" },
    // Twelfths that do not sum to a row are still placed honestly, in reading order.
    { spans: [5, 5, 5], expect: "a+b | c" },
  ];
  const wrong = cases
    .map((entry) => {
      const got = shape(entry.spans.map((span, index) => slot(ids[index], span)));
      return { got, want: entry.expect };
    })
    .filter((entry) => entry.got !== entry.want);
  check(
    "the row rule: widths add up into rows, and add up exactly",
    wrong.length === 0,
    wrong.map((entry) => `got "${entry.got}", wanted "${entry.want}"`).join("; "),
  );
}

{
  const slot = (id: string, span?: number) => createBlock("image", { id, ...(span ? { span } : {}) });
  const four = [slot("a", 3), slot("b", 3), slot("c", 3), slot("d", 3)];
  check(
    "where a section sits on a page is reportable",
    blockPosition(four, "c")?.row === 0 &&
      blockPosition(four, "c")?.column === 2 &&
      blockPosition(four, "zz") === null,
    JSON.stringify(blockPosition(four, "c")),
  );
}

check("a width step is settable, clamped, and never mutates the original", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-w",
        name: "Widths",
        slides: [{ id: "sl-w", title: "Page", blocks: [createBlock("image", { id: "bl-w" })] }],
      },
    ],
  });
  const only = (doc: Portfolio) => doc.projects[0].slides[0].blocks[0];
  return (
    blockSpan(only(setBlockSpan(portfolio, "bl-w", 6))) === 6 &&
    spanFraction(only(setBlockSpan(portfolio, "bl-w", 6))) === 0.5 &&
    blockSpan(only(setBlockSpan(portfolio, "bl-w", 99))) === GRID_SPAN &&
    blockSpan(only(setBlockSpan(portfolio, "bl-w", -4))) === 1 &&
    // Untouched: every edit returns a new document.
    only(portfolio).span === undefined &&
    // Every offered width can be completed to a full row by other offered widths — ¾ with a ¼, ⅔ with
    // a ⅓, ½ with another ½ — which is what makes "put three of them beside each other" a matter of
    // pressing width buttons rather than doing arithmetic.
    BLOCK_SPANS.every(
      (entry) =>
        GRID_SPAN % entry.span === 0 ||
        BLOCK_SPANS.some((other) => other.span + entry.span === GRID_SPAN),
    )
  );
})());

check("frames can be reserved before the pictures arrive", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-s",
        name: "Slots",
        slides: [
          {
            id: "sl-s",
            title: "Page",
            blocks: [createBlock("image", { id: "bl-s", presentation: "cards" })],
          },
        ],
      },
    ],
  });
  const only = (doc: Portfolio) => doc.projects[0].slides[0].blocks[0];
  // The same section, but with two pictures already placed in it.
  const placed = createPortfolio({
    projects: [
      {
        id: "pr-s",
        name: "Slots",
        slides: [
          {
            id: "sl-s",
            title: "Page",
            blocks: [createBlock("image", { id: "bl-s", images: [ref("slot-1"), ref("slot-2")] })],
          },
        ],
      },
    ],
  });
  return (
    frameSlots(only(setBlockSlots(portfolio, "bl-s", 4))) === 4 &&
    frameSlots(only(setBlockSlots(portfolio, "bl-s", 0))) === 0 &&
    setBlockSlots(portfolio, "bl-s", 99).projects[0].slides[0].blocks[0].slots === 8 &&
    // Reserving fewer frames than are placed is refused rather than obeyed — a count that dropped a
    // picture would look like data loss.
    frameSlots(only(setBlockSlots(placed, "bl-s", 1))) === 2 &&
    // Without `slots` set, a section is exactly as many frames as it has, so documents written
    // before any of this are unaffected.
    frameSlots(createBlock("image", { images: [ref("a")] })) === 1 &&
    frameSlots(createBlock("image")) === 0
  );
})());

check("each variation states the room it wants", (() => {
  const withFrames = PRESENTATION_OPTIONS.filter((option) => option.frames !== undefined);
  const textOnly = PRESENTATION_OPTIONS.filter((option) => option.frames === undefined);
  return (
    // Every option that shows frames declares how many, and the number is one it accepts.
    withFrames.length >= 10 &&
    withFrames.every((option) => {
      const range = option.requires.images;
      return range ? option.frames! >= range.min && option.frames! <= range.max : false;
    }) &&
    // And every option that declares no frames really shows none.
    textOnly.every((option) => option.requires.images === undefined) &&
    framesForPresentation("cards") === 3 &&
    framesForPresentation("grid") === 4 &&
    framesForPresentation("filmstrip") === 4 &&
    framesForPresentation("copy") === 0
  );
})());

check("a section moves a row at a time as well as a place at a time", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-m",
        name: "Move",
        slides: [
          {
            id: "sl-m",
            title: "Page",
            blocks: [
              createBlock("image", { id: "b-a", span: 6 }),
              createBlock("image", { id: "b-b", span: 6 }),
              createBlock("image", { id: "b-c", span: 4 }),
              createBlock("image", { id: "b-d", span: 4 }),
              createBlock("image", { id: "b-e", span: 4 }),
            ],
          },
        ],
      },
    ],
  });
  const order = (doc: Portfolio) =>
    doc.projects[0].slides[0].blocks.map((block) => block.id).join(",");
  const rows = (doc: Portfolio) =>
    rowsOf(doc.projects[0].slides[0].blocks)
      .map((row) => row.length)
      .join("+");

  return (
    rows(portfolio) === "2+3" &&
    // One place: within the row, so the two halves swap.
    order(moveBlock(portfolio, "b-b", -1)) === "b-b,b-a,b-c,b-d,b-e" &&
    // A row: out of its row, past the whole row below. The page then re-flows, and because the
    // section that moved is a half rather than a quarter the rows come out 2+2+1 — not 2+3. That is
    // the layout being honest about widths, and the width buttons are how you put it back.
    order(moveBlockAcrossRows(portfolio, "b-a", 1)) === "b-b,b-c,b-d,b-e,b-a" &&
    rows(moveBlockAcrossRows(portfolio, "b-a", 1)) === "2+2+1" &&
    // And up the other way: it lands on the far side of the row above, at the top of the page,
    // which is the same rule read in the other direction.
    order(moveBlockAcrossRows(portfolio, "b-e", -1)) === "b-e,b-a,b-b,b-c,b-d" &&
    // At either end nothing happens, and the *same* document comes back — which is what stops a
    // fruitless arrow press from costing an undo step.
    moveBlockAcrossRows(portfolio, "b-a", -1) === portfolio &&
    moveBlockAcrossRows(portfolio, "b-c", 1) === portfolio
  );
})());

check("a template reserves the frames it intends, even into an empty store", (() => {
  const template = templateById("case-study")!;
  const project = applyTemplate(template, {
    name: "Empty",
    library: createMediaLibrary(),
    id: "pr-tpl",
  });
  const framed = template.sections.filter((slot) => slot.images > 0);
  const blockFor = (title: string) =>
    project.slides.find((slide) => slide.title === title)?.blocks[0];
  return (
    // Nothing was placed, and the page still shows the holes it is arranged around.
    framed.length >= 3 &&
    framed.every((slot) => {
      const block = blockFor(slot.title);
      return block?.assetIds?.length === 0 && frameSlots(block) === slot.images;
    }) &&
    // A section that shows no frames — prose, numbers — reserves none.
    template.sections
      .filter((slot) => slot.images === 0)
      .every((slot) => blockFor(slot.title)?.slots === undefined)
  );
})());

check("a page can be dragged between pages, in its project or another", (() => {
  const project = (id: string, slides: string[]) => ({
    id,
    name: id,
    slides: slides.map((slide) => ({ id: slide, title: slide, blocks: [] })),
  });
  const portfolio = createPortfolio({
    projects: [project("pr-a", ["a1", "a2", "a3"]), project("pr-b", ["b1", "b2"])],
  });
  const order = (doc: Portfolio) =>
    doc.projects.map((entry) => entry.slides.map((slide) => slide.id).join("")).join(" | ");

  return (
    order(portfolio) === "a1a2a3 | b1b2" &&
    // Along its own project: a3 to the front, a1 to the end.
    order(moveSlideTo(portfolio, "a3", "a1", "before")) === "a3a1a2 | b1b2" &&
    order(moveSlideTo(portfolio, "a1", "a3", "after")) === "a2a3a1 | b1b2" &&
    // Into another project, before and after.
    order(moveSlideTo(portfolio, "a2", "b1", "before")) === "a1a3 | a2b1b2" &&
    order(moveSlideTo(portfolio, "b2", "a1", "after")) === "a1b2a2a3 | b1" &&
    // A page dropped back where it was changes nothing and returns the *same* document, so it costs
    // no undo step — the same rule the block moves follow.
    moveSlideTo(portfolio, "a2", "a1", "after") === portfolio &&
    moveSlideTo(portfolio, "a2", "a3", "before") === portfolio &&
    // Dropping a page on itself, or naming a page that is gone, is likewise nothing.
    moveSlideTo(portfolio, "a2", "a2", "before") === portfolio &&
    moveSlideTo(portfolio, "a2", "nope", "before") === portfolio
  );
})());

check("a picture lands in the frame it was dropped on", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-f",
        name: "Frames",
        slides: [
          {
            id: "sl-f",
            title: "Page",
            blocks: [createBlock("image", { id: "bl-f", slots: 4, assetIds: ["existing"] })],
          },
        ],
      },
    ],
  });
  const ids = (doc: Portfolio) => doc.projects[0].slides[0].blocks[0].assetIds?.join(",");
  return (
    // Frame three of four — and the picture already there stays where it was, so filling a hole does
    // not rearrange the page around it.
    ids(placeAssetAt(portfolio, "bl-f", "new", 2)) === "existing,new" &&
    ids(placeAssetAt(portfolio, "bl-f", "new", 0)) === "new,existing" &&
    // Past the end, and an asset that is already placed, are both handled rather than duplicated.
    ids(placeAssetAt(portfolio, "bl-f", "new", 9)) === "existing,new" &&
    ids(placeAssetAt(portfolio, "bl-f", "existing", 0)) === "existing" &&
    // Untouched original.
    ids(portfolio) === "existing"
  );
})());

check("a section can be moved to another page, or another project", (() => {
  const block = (id: string) => createBlock("image", { id, title: id });
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-a",
        name: "A",
        slides: [
          { id: "a1", title: "One", blocks: [block("x"), block("y")] },
          { id: "a2", title: "Two", blocks: [] },
        ],
      },
      { id: "pr-b", name: "B", slides: [{ id: "b1", title: "Three", blocks: [block("z")] }] },
    ],
  });
  const where = (doc: Portfolio) =>
    doc.projects
      .map((project) =>
        project.slides
          .map((slide) => slide.blocks.map((entry) => entry.id).join(""))
          .join("|"),
      )
      .join(" // ");
  return (
    where(portfolio) === "xy| // z" &&
    // Onto the next page of the same project, appended.
    where(moveBlockToPage(portfolio, "x", "a2")) === "y|x // z" &&
    // Onto the next page, at a given place.
    where(moveBlockToPage(portfolio, "y", "a2", 0)) === "x|y // z" &&
    // Into a different project entirely, before what is already there.
    where(moveBlockToPage(portfolio, "x", "b1", 0)) === "y| // xz" &&
    // Onto its own page this is a reorder, which the reorder path owns.
    where(moveBlockToPage(portfolio, "x", "a1", 1)) === "yx| // z" &&
    // A page that does not exist changes nothing.
    moveBlockToPage(portfolio, "x", "nope") === portfolio
  );
})());
check("words typed on the page beat the store, and only for that page", (() => {
  const piece = imageAsset(ref("page-1"), { name: "piece.png" });
  // The store's caption is both the tied text and the one-line description, so the expectation below
  // is one string rather than two that happen to differ.
  const described = { ...textAsset("Store caption", "shared note"), description: "Store caption" };
  let library = addAsset(createMediaLibrary(), piece);
  library = addAsset(library, described);
  library = tieCompanion(library, piece.id, described.id);

  const block = createBlock("image", {
    id: "bl-cap",
    presentation: "cards",
    layout: "cards",
    assetIds: [piece.id],
    slots: 2,
    images: [ref("page-1"), ref("page-2")],
  });
  const portfolio = createPortfolio({
    projects: [{ id: "pr-c", name: "C", slides: [{ id: "sl-c", title: "Page", blocks: [block] }] }],
  });
  const captions = (doc: Portfolio) =>
    resolveBlock(doc.projects[0].slides[0].blocks[0], library).images.map((image) => image.caption);

  const typed = setBlockCaption(portfolio, "bl-cap", "page-1", "Typed here");
  return (
    // With nothing typed, the store's description travels with the photograph.
    captions(portfolio)[0] === "Store caption" &&
    // Typed on the page, it wins — for this page, without touching the store.
    captions(typed)[0] === "Typed here" &&
    // Clearing it is also an instruction: no caption here, despite the store.
    captions(setBlockCaption(typed, "bl-cap", "page-1", ""))[0] === "" &&
    // A frame nobody typed on still follows the store.
    captions(typed)[1] === undefined &&
    // The store's own description is untouched, so other pages are unaffected…
    assetById(library, described.id)?.description === "Store caption" &&
    // …and nothing was written onto the store's image object, which every other section holds.
    library.assets.find((asset) => asset.id === piece.id)?.images[0].caption === undefined
  );
})());

check("a caption typed on the page survives planning without a store", (() => {
  // The regression this exists for: captions were applied only on the path where a store was passed,
  // so planning the same document without one quietly dropped the page's own words.
  const block = createBlock("image", {
    id: "bl-nl",
    images: [ref("inline-1")],
    captions: { "inline-1": "Typed on the page" },
  });
  const portfolio = createPortfolio({
    projects: [{ id: "pr-nl", name: "N", slides: [{ id: "sl-nl", title: "Page", blocks: [block] }] }],
  });
  const planned = planPortfolio(portfolio);
  return (
    resolveBlock(block).images[0].caption === "Typed on the page" &&
    planned.find((page) => page.id === "pr-nl:sl-nl")?.blocks[0].images[0].caption ===
      "Typed on the page"
  );
})());

check("numbers typed on the page survive the store's numbers", (() => {
  const metric = metricAsset({ label: "From store", value: "1" });
  const library = addAsset(createMediaLibrary(), metric);
  const block = createBlock("metrics", {
    id: "bl-m",
    presentation: "metrics",
    assetIds: [metric.id],
    metrics: [{ label: "Mine", value: "42" }],
  });
  const portfolio = createPortfolio({
    projects: [{ id: "pr-m", name: "M", slides: [{ id: "sl-m", title: "Page", blocks: [block] }] }],
  });
  const shown = (doc: Portfolio) =>
    resolveBlock(doc.projects[0].slides[0].blocks[0], library).metrics ?? [];

  const edited = setBlockMetric(portfolio, "bl-m", 0, { value: "43" });
  return (
    // Before the edit the store's numbers win, which is what a metrics section is for.
    shown(portfolio)[0].value === "1" &&
    // After typing on the page, the typed number stays put: the store stops overwriting it.
    shown(edited)[0].value === "43" &&
    shown(edited)[0].label === "Mine" &&
    // The flag is on the block, so it survives a write and read like any other field.
    edited.projects[0].slides[0].blocks[0].metricsEdited === true
  );
})());

check("text placement and body style are settable", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-t",
        name: "T",
        slides: [{ id: "sl-t", title: "Page", blocks: [createBlock("image", { id: "bl-t" })] }],
      },
    ],
  });
  const only = (doc: Portfolio) => doc.projects[0].slides[0].blocks[0];
  return (
    only(setBlockTextPlacement(portfolio, "bl-t", "right")).textPlacement === "right" &&
    only(setBlockBodyStyle(portfolio, "bl-t", "bullets")).bodyStyle === "bullets" &&
    // Defaults stay unset, so a document written before any of this reads exactly as it did.
    only(portfolio).textPlacement === undefined &&
    only(portfolio).bodyStyle === undefined &&
    setSlideText(portfolio, "sl-t", { title: "Renamed" }).projects[0].slides[0].title === "Renamed" &&
    setBlockText(portfolio, "bl-t", { body: "Words" }).projects[0].slides[0].blocks[0].body === "Words"
  );
})());

check("every page layout obeys the row rule it draws", (() => {
  return PAGE_TEMPLATES.every((template) => {
    const rows = pageTemplateRows(template);
    return (
      // Rows of the layout add up the way the rule says they must…
      rows.every((row) => row.reduce((total, span) => total + span, 0) <= GRID_SPAN) &&
      // …the diagram covers every section…
      rows.flat().length === template.sections.length &&
      // …and every section is a width the editor can actually set, which is what stops a layout
      // offering a shape you cannot rebuild by hand.
      template.sections.every((section) =>
        BLOCK_SPANS.some((entry) => entry.span === section.span),
      ) &&
      // A layout that shows frames reserves them, so an empty start is still the right shape.
      template.sections.every(
        (section) => section.presentation === "copy" || section.slots !== undefined,
      ) &&
      // Every presentation it names is one the registry knows, or the section could never be drawn.
      template.sections.every((section) =>
        PRESENTATION_OPTIONS.some((option) => option.id === section.presentation),
      )
    );
  });
})());

check("a page layout builds a page of ordinary sections", (() => {
  const template = pageTemplateById("three-and-a-big-one")!;
  const portfolio = createPortfolio({
    projects: [{ id: "pr-p", name: "P", slides: [] }, { id: "pr-other", name: "O", slides: [] }],
  });
  const built = applyPageTemplate(portfolio, "pr-p", template, { stamp: "s1", id: "sl-new" });
  const page = built.projects[0].slides[0];
  const rows = rowsOf(page.blocks);

  return (
    // One page, in the project that was named, and nothing in the other.
    built.projects[0].slides.length === 1 &&
    built.projects[1].slides.length === 0 &&
    page.title === template.title &&
    // The shape is what the diagram promised: three thirds, then a full-width section.
    rows.length === 2 &&
    rows[0].length === 3 &&
    rows[1].length === 1 &&
    // Nothing is placed, and the frames are reserved: applying a layout gives you the holes to fill.
    page.blocks.every((block) => (block.assetIds ?? []).length === 0) &&
    page.blocks.every((block) => frameSlots(block) === 1) &&
    // And it plans as one page, like any other.
    planPortfolio(built).filter((entry) => entry.id === "pr-p:sl-new").length === 1
  );
})());

check("a layout can put the words beside the frame", (() => {
  const beside = PAGE_TEMPLATES.filter((template) =>
    template.sections.some((section) => section.textPlacement === "left" || section.textPlacement === "right"),
  );
  const built = pageFromTemplate(pageTemplateById("frame-and-words")!, { id: "sl-x", stamp: "s2" });
  const block = built.blocks[0];
  return (
    beside.length >= 2 &&
    block.textPlacement === "right" &&
    block.span === 8 &&
    // The words are there from the start, so the layout reads as a layout rather than as a box.
    Boolean(block.body) &&
    // And the sequence layout's notes arrive as bullets.
    pageFromTemplate(pageTemplateById("sequence-and-notes")!, { id: "sl-y", stamp: "s3" }).blocks[1]
      .bodyStyle === "bullets"
  );
})());

check("a pad stays on the page, and a line stays thin", (() => {
  const panel = createPad({ x: 0.5, y: 0.5, w: 0.8, h: 0.8 });
  const line = createPad({ tone: "rule", y: 0.2, h: 0.02 });
  // Dragged off the right and bottom, it comes back inside rather than half-drawing off the sheet.
  const pushed = clampPad({ ...panel, x: 0.9, y: 0.95 });
  // A wobble that inverts a drag cannot produce a negative width.
  const inverted = clampPad({ ...panel, w: -0.4, h: -0.2 });
  return (
    // Floating point: `1 - 0.8` is 0.19999999999999996, so these compare within a hair.
    Math.abs(pushed.x - 0.2) < 1e-9 &&
    Math.abs(pushed.y - 0.2) < 1e-9 &&
    Math.abs(pushed.x + pushed.w - 1) < 1e-9 &&
    Math.abs(pushed.y + pushed.h - 1) < 1e-9 &&
    inverted.w === MIN_PAD &&
    // A rule is allowed to be a hairline; a panel is not, or it would vanish when you let go.
    clampPad({ ...line, h: 0 }).h === MIN_RULE &&
    clampPad({ ...line, h: 0 }).h < MIN_PAD &&
    // The default line is thin out of the box.
    defaultRulePad().h < 0.01 &&
    defaultRulePad().w === 1
  );
})());

check("a pad snaps to the sections' own grid", (() => {
  const pad = createPad({ x: 0.244, y: 0.041, w: 0.34, h: 0.3 });
  const snapped = snapPad(pad);
  // Aimed between the marks — every edge of this one sits mid-way between a twelfth and a
  // twenty-fourth — so nothing moves and free positioning is still possible.
  const clear = snapPad(
    createPad({ x: 4.5 / 12, y: 1.5 / 24, w: 1 / 12, h: 1 / 24 }),
  );
  return (
    // A third, near enough: both edges land on twelfths, so the pad lines up with a section that is
    // a third of the width.
    Math.abs(snapped.x - 3 / 12) < 1e-9 &&
    Math.abs(snapped.x + snapped.w - 7 / 12) < 1e-9 &&
    Math.abs(snapped.y - 1 / 24) < 1e-9 &&
    // Aimed between the marks, nothing moves: free positioning still exists.
    clear.x === 4.5 / 12 &&
    clear.y === 1.5 / 24 &&
    clear.w === 1 / 12 &&
    clear.h === 1 / 24 &&
    // And after snapping it is still a legal pad.
    snapped.w >= MIN_PAD &&
    snapped.x + snapped.w <= 1
  );
})());

check("dragging a pad moves it, and dragging a corner resizes it", (() => {
  const pad = createPad({ x: 0.25, y: 0.25, w: 0.5, h: 0.25 });
  const moved = dragPad(pad, "move", 0.25, 0.125);
  const grown = dragPad(pad, "se", 0.25, 0.25);
  const shrunk = dragPad(pad, "nw", 0.125, 0.0625);
  return (
    moved.x === 0.5 &&
    moved.y === 0.375 &&
    // The size does not change when it moves.
    moved.w === 0.5 &&
    moved.h === 0.25 &&
    // Growing from the south-east leaves the top-left alone.
    grown.x === 0.25 &&
    grown.y === 0.25 &&
    Math.abs(grown.w - 0.75) < 1e-9 &&
    Math.abs(grown.h - 0.5) < 1e-9 &&
    // Growing from the north-west moves the corner and the size together.
    shrunk.x === 0.375 &&
    shrunk.y === 0.3125 &&
    Math.abs(shrunk.w - 0.375) < 1e-9 &&
    Math.abs(shrunk.h - 0.1875) < 1e-9
  );
})());

check("pads can be added, changed and removed, and reach the plan", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-pad",
        name: "Pads",
        slides: [{ id: "sl-pad", title: "Page", blocks: [createBlock("image", { id: "bl-p" })] }],
      },
    ],
  });
  const pad = createPad({ id: "pad-1", tone: "tint", label: "Before", w: 0.5 });
  const withPad = addPad(portfolio, "sl-pad", pad);
  const relabelled = updatePad(withPad, "pad-1", { label: "After", x: 0.5 });
  const asLine = updatePad(withPad, "pad-1", { tone: "rule" });
  const page = planPortfolio(withPad).find((entry) => entry.id === "pr-pad:sl-pad");
  return (
    // Added, and carried onto the planned page so both surfaces draw the same thing.
    (withPad.projects[0].slides[0].pads ?? []).length === 1 &&
    (page?.pads ?? []).length === 1 &&
    page?.pads?.[0].tone === "tint" &&
    // Changed by the same call the drag and the tone buttons both use.
    relabelled.projects[0].slides[0].pads?.[0].label === "After" &&
    relabelled.projects[0].slides[0].pads?.[0].x === 0.5 &&
    // A full-width pad is pinned sideways: there is nowhere for it to move to, so asking is a no-op
    // rather than a pad that hangs off the page.
    updatePad(withPad, "pad-1", { x: 0.3, w: 1 }).projects[0].slides[0].pads?.[0].x === 0 &&
    // The id cannot be changed, whatever a patch says: it is how the pad is found.
    updatePad(withPad, "pad-1", { ...pad, id: "other" }).projects[0].slides[0].pads?.[0].id ===
      "pad-1" &&
    // A tone change clamps with the new tone's minimum, so a rule can be shrunk to a line.
    (asLine.projects[0].slides[0].pads?.[0].h ?? 1) <= pad.h &&
    // Removed, and a pad that is not there changes nothing.
    (removePad(withPad, "pad-1").projects[0].slides[0].pads ?? []).length === 0 &&
    (removePad(withPad, "pad-1").projects[0].slides[0].pads ?? []).length === 0 &&
    removePad(withPad, "pad-nope") === withPad &&
    // The order is the draw order, and a second pad goes on top of the first.
    ((addPad(withPad, "sl-pad", createPad({ id: "pad-2" })).projects[0].slides[0].pads ?? [])[1].id) ===
      "pad-2"
  );
})());
check("a text module joins a section's words, or becomes a section of its own", (() => {
  const page = createPortfolio({
    projects: [
      {
        id: "pr-t",
        name: "T",
        slides: [
          { id: "sl-t", title: "P", blocks: [createBlock("text", { id: "bl-t", body: "First thought." })] },
        ],
      },
    ],
  });
  const joined = appendTextToBlock(page, "bl-t", "Second thought.");
  const grown = addTextSection(joined, "sl-t", "A whole paragraph.");
  const slots = grown.projects[0].slides[0].blocks;

  return (
    // Two paragraphs that were separate stay separate: one blank line between them.
    slots[0].body === "First thought.\n\nSecond thought." &&
    // Dropped on empty page space, a module becomes a section holding those words.
    slots.length === 2 &&
    slots[1].kind === "text" &&
    slots[1].body === "A whole paragraph." &&
    // Joining text to nothing is just the text, and joining nothing to text changes nothing.
    appendText(undefined, "  only  ") === "only" &&
    appendText("only", "   ") === "only" &&
    // A drop that would change nothing is not an edit, so it costs no undo step.
    appendTextToBlock(page, "bl-t", "   ") === page &&
    appendTextToBlock(page, "bl-nowhere", "x") === page &&
    addTextSection(joined, "sl-t", "  ") === joined &&
    addTextSection(joined, "sl-nowhere", "x") === joined
  );
})());

check("the clipboard is images and text modules, and nothing else", (() => {
  const library = addAsset(
    addAsset(addAsset(createMediaLibrary(), imageAsset({ id: "im-1", src: "", aspect: 1 } as never)), textAsset("A paragraph.", "A paragraph")),
    metricAsset({ label: "hours saved", value: "180" }),
  );
  const stats = libraryStats(library);
  return (
    // The two kinds the panel deals in, in the order they are worth reading.
    CLIPBOARD_KINDS.join(",") === "image,text" &&
    MEDIA_KIND_LABELS.text === "Text modules" &&
    // There is no "saved sections" kind left: a section is rearranged by dragging it, not by saving a copy.
    Object.values(MEDIA_KIND_LABELS).every((label) => label !== "Saved sections") &&
    Object.keys(stats.byKind).sort().join(",") === "image,link,metric,pair,poster,text" &&
    // A number that is still in the store because a section shows it is counted, not lost.
    stats.byKind.metric === 1 &&
    // And the filter can still narrow to the two kinds the clipboard holds.
    filterAssets(library, { kind: "text" }).length === 1 &&
    filterAssets(library, { kind: "image" }).length === 1
  );
})());

check("the cover's words are the document's, and edit in place", (() => {
  const portfolio = createPortfolio({ title: "Selected Work", subtitle: "Portfolio" });
  const renamed = setPortfolioText(portfolio, { title: "Twenty twenty-six", author: "Alex Rivera" });
  const planned = planPortfolio(renamed).find((page) => page.kind === "cover");
  return (
    renamed.title === "Twenty twenty-six" &&
    renamed.author === "Alex Rivera" &&
    // Typing the same thing again is not an edit, so it costs no undo step.
    setPortfolioText(renamed, { title: "Twenty twenty-six" }) === renamed &&
    // The cover page carries the three parts separately, which is what lets each be edited on the page.
    planned?.title === "Twenty twenty-six" &&
    planned?.subtitle === "Portfolio" &&
    planned?.author === "Alex Rivera"
  );
})());

check("the cover shows the work by default, or the frames you choose", (() => {
  const withImages = (ids: string[]) =>
    createPortfolio({
      projects: [
        {
          id: "pr-c",
          name: "C",
          slides: [{ id: "sl-c", title: "P", blocks: [createBlock("image", { id: "bl-c", images: ids.map(ref) })] }],
        },
      ],
    });
  const derived = withImages(["c1", "c2", "c3", "c4"]);
  const chosen = setCoverImage(withImages(["c1", "c2", "c3", "c4"]), 0, "c4");
  const cleared = clearCoverImage(chosen, 1);
  const coverFramesOf = (doc: Portfolio) =>
    (planPortfolio(doc).find((page) => page.kind === "cover")?.frames ?? []).map((frame) => frame.id);

  return (
    // Default: the portfolio shows itself, three frames of it.
    coverFrames(derived).join(",") === "c1,c2,c3" &&
    coverFramesOf(derived).join(",") === "c1,c2,c3" &&
    // Choosing one puts it in the slot asked for, and keeps the others.
    coverFrames(chosen)[0] === "c4" &&
    coverFrames(chosen).length === 3 &&
    coverFramesOf(chosen).join(",") === "c4,c2,c3" &&
    // Clearing a slot empties *that* slot and leaves the others where they are. The empty one is still a
    // slot: it prints as the panel an empty frame prints as, and the card offers to fill it.
    coverFrames(cleared).join(",") === "c4,,c3" &&
    coverFramesOf(cleared).join(",") === "c4,,c3" &&
    // And the plan carries all three, so the file and the screen show the same three.
    (planPortfolio(cleared).find((page) => page.kind === "cover")?.frames ?? []).length === 3
  );
})());

check("clearing a cover picture removes it, and the work does not put it back", (() => {
  // The report from the reader: a picture dragged onto a page also appeared on the cover, and the × on the
  // cover would not take it off. Both halves were one bug — `coverFrames` dropped empty slots and fell back
  // to the first frames of the work, so the moment you cleared the cover, the section below supplied the
  // picture again.
  const picture = (id: string) => ({
    id,
    name: id,
    width: 10,
    height: 10,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  });
  // A document with exactly one picture, placed in a section: the cover derives it, as it always has.
  const placed = createPortfolio({
    projects: [
      {
        id: "pr-one",
        name: "One",
        slides: [{ id: "sl-one", title: "P", blocks: [createBlock("image", { images: [picture("only")] })] }],
      },
    ],
  });
  const cleared = clearCoverImage(placed, 0);
  const framesOf = (doc: Portfolio) =>
    (planPortfolio(doc).find((page) => page.kind === "cover")?.frames ?? []).map((frame) => frame.id);

  // The slot the author emptied, then a second picture added from the cover itself.
  const refilled = setCoverImage(cleared, nextCoverSlot(cleared), "second");

  return (
    // Before anyone touches it, the cover shows the work.
    coverFrames(placed).join(",") === "only" &&
    framesOf(placed).join(",") === "only" &&
    // Clearing the only slot leaves one *empty* slot, and the picture in the section does not reappear: the
    // frame is still there to fill, and the file prints the panel an empty frame prints as.
    coverFrames(cleared).join(",") === "" &&
    cleared.coverImages?.join(",") === "" &&
    framesOf(cleared).length === 1 &&
    framesOf(cleared)[0] === "" &&
    // The picture is still in the section, which is where it belongs now.
    planPortfolio(cleared).some((page) => page.blocks.some((block) => block.images[0]?.id === "only")) &&
    // Adding a picture fills the hole rather than appending past it, and does not invent a second empty slot.
    nextCoverSlot(cleared) === 0 &&
    coverFrames(refilled).join(",") === "second" &&
    // With a hole in the middle, the first free slot is the hole — not the end of the list.
    nextCoverSlot(clearCoverImage(setCoverImage(placed, 0, "a"), 1)) === 1 &&
    // And an untouched cover still grows a slot at a time as pictures are added to it.
    setCoverImage(placed, 1, "b").coverImages?.join(",") === "only,b"
  );
})());
check("a click puts the tools away only when it was aimed at the page", (() => {
  // The bug this exists for: selecting a pad you placed earlier took a pointer press, the browser
  // retargeted the release's click to the page box, and the box's click deselected — so the modifiers
  // appeared while the button was held and vanished on release. Only a click that began on the page and
  // landed on the page may clear the tools.
  return (
    clickClearsTools({ startedOnPad: false, targetIsPad: false }) === true &&
    clickClearsTools({ startedOnPad: true, targetIsPad: true }) === false &&
    // Either guard alone is enough: a press on a pad whose click arrives at the box (capture), and a
    // click that lands on a pad after a press elsewhere.
    clickClearsTools({ startedOnPad: true, targetIsPad: false }) === false &&
    clickClearsTools({ startedOnPad: false, targetIsPad: true }) === false
  );
})());

check("changing one page's layout leaves every other page alone", (() => {
  const image = (id: string, asset: string, span: number) =>
    createBlock("image", {
      id,
      presentation: "framed",
      title: id,
      span,
      assetIds: [asset],
      slots: 1,
    });
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-l",
        name: "Lay out",
        slides: [
          // Three sections, quite wide, with content in them.
          {
            id: "a1",
            title: "Page one",
            blocks: [image("b1", "x1", 12), image("b2", "x2", 12), image("b3", "x3", 12)],
          },
          { id: "a2", title: "Page two", blocks: [image("b9", "x9", 12)] },
        ],
      },
    ],
  });
  const template = pageTemplateById("three-and-a-big-one")!;
  const relaid = relayoutPage(portfolio, "a1", template, "s1");
  const page = relaid.projects[0].slides[0];
  const other = relaid.projects[0].slides[1];
  const rows = rowsOf(page.blocks);

  return (
    // The page takes the layout's shape: three thirds, then a full-width slot filled in for it.
    rows.length === 2 &&
    rows[0].length === 3 &&
    rows[1].length === 1 &&
    page.blocks.length === 4 &&
    page.blocks.every((block) => blockSpan(block) === template.sections[0].span || block.span === 12) &&
    // The content is still there, untouched: same assets, same presentations, same titles.
    page.blocks[0].assetIds?.join(",") === "x1" &&
    page.blocks[1].assetIds?.join(",") === "x2" &&
    page.blocks[2].assetIds?.join(",") === "x3" &&
    page.blocks[0].presentation === "framed" &&
    page.blocks[0].id === "b1" &&
    // The added section is empty and reserved, so the shape is visible before the picture exists.
    (page.blocks[3].assetIds ?? []).length === 0 &&
    frameSlots(page.blocks[3]) === 1 &&
    // And no other page moved a millimetre.
    other.blocks.length === 1 &&
    blockSpan(other.blocks[0]) === 12 &&
    other.blocks[0].id === "b9" &&
    // Applying the same layout again is not an edit: it costs no undo step.
    relayoutPage(relaid, "a1", template, "s2") === relaid &&
    // A page that does not exist changes nothing.
    relayoutPage(portfolio, "nope", template) === portfolio
  );
})());

check("a layout with fewer slots leaves the extra sections where they are", (() => {
  const block = (id: string) => createBlock("image", { id, title: id, span: 12, assetIds: [id] });
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-x",
        name: "Extra",
        slides: [
          { id: "x1", title: "Page", blocks: [block("k1"), block("k2"), block("k3"), block("k4"), block("k5")] },
        ],
      },
    ],
  });
  // "Four squares" has four slots; the fifth section keeps what it had rather than being dropped.
  const relaid = relayoutPage(portfolio, "x1", pageTemplateById("quad")!, "s1");
  const blocks = relaid.projects[0].slides[0].blocks;
  return (
    blocks.length === 5 &&
    blocks.slice(0, 4).every((entry) => blockSpan(entry) === 3) &&
    blocks[4].id === "k5" &&
    blockSpan(blocks[4]) === 12 &&
    // Four quarters then a full-width remainder: two rows, nothing lost.
    rowsOf(blocks).length === 2 &&
    rowsOf(blocks)[1].length === 1
  );
})());

check("the six styles are six, and every one is a format the document already had", (() => {
  // The point of the table: nothing new is invented. Each style must carry both surfaces — the class
  // the workspace draws with and the numbers the PDF draws with — because a style that looked one way
  // on screen and another on paper would defeat the point of a preview at all.
  const ids = TEXT_STYLE_ORDER;
  const names = new Set(ids);
  const complete = ids.every((id) => {
    const style = TEXT_STYLES[id];
    return (
      style.id === id &&
      style.name.length > 0 &&
      style.what.length > 10 &&
      style.sample.length > 0 &&
      style.from.length > 0 &&
      style.className.includes("proj-") &&
      style.paper.fontSize > 0 &&
      typeof PORTFOLIO_INK[style.paper.color] === "string" &&
      /^Helvetica(-Bold|-Oblique)?$/.test(style.paper.fontFamily)
    );
  });

  // The label is the PORTFOLIO tag, which is the one the whole idea is named from: small, spaced 2.4,
  // upright capitals, in the accent — exactly what the cover has always worn.
  const label = TEXT_STYLES.label;
  return (
    ids.length === 6 &&
    names.size === 6 &&
    complete &&
    label.uppercase === true &&
    label.paper.letterSpacing === 2.4 &&
    label.paper.fontSize === 10 &&
    label.paper.color === "accent" &&
    label.paper.fontFamily === "Helvetica-Bold" &&
    // Biggest first, so the picker reads the way a page reads.
    TEXT_STYLES.headline.paper.fontSize > TEXT_STYLES.header.paper.fontSize &&
    TEXT_STYLES.header.paper.fontSize > TEXT_STYLES.subject.paper.fontSize &&
    // Only the label shouts: capitals are its whole character, not a habit.
    ids.filter((id) => TEXT_STYLES[id].uppercase).join(",") === "label"
  );
})());

check("a style is a format, so choosing one changes the type and nothing else", (() => {
  // The precedence rule: what was chosen by hand wins, the slot's own drawn style is the fallback, and a
  // slot nobody has touched resolves to the same thing as before the six existed.
  const map = { title: "label" as const, body: "subject" as const };
  return (
    resolveTextStyle(map, "title", "title")?.id === "label" &&
    resolveTextStyle(map, "body")?.id === "subject" &&
    // Nothing chosen for the caption: no fallback, so nothing is applied and the renderer keeps its own.
    resolveTextStyle(map, "caption") === undefined &&
    // Nothing chosen at all: the fallback, which is what the slot is drawn as today.
    resolveTextStyle(undefined, "title", "header")?.id === "header" &&
    // An id from an older or newer document is ignored rather than crashing the page.
    resolveTextStyle({ title: "gigantic" as never }, "title", "title")?.id === "title" &&
    // Every surface names a fallback that really exists, so "as drawn" always has a name to show.
    Object.values(SLOT_DRAWN_AS).every((slots) =>
      Object.values(slots).every((id) => textStyleOf(id) !== undefined),
    )
  );
})());

check("the label shouts, and nothing else does", (() => {
  return (
    styleWords(TEXT_STYLES.label, "selected work") === "SELECTED WORK" &&
    styleWords(TEXT_STYLES.header, "Selected work") === "Selected work" &&
    styleWords(undefined, "Selected work") === "Selected work" &&
    // A style whose family is the oblique face keeps the same words.
    styleWords(TEXT_STYLES.title, "before and after") === "before and after"
  );
})());

/**
 * The cover's contact block.
 *
 * The one page of a portfolio that has a job to do outside the work: it tells a reader who wrote this, how to
 * reply, and where else to look. The rules are small and all of them are about restraint — a document with no
 * contact block draws exactly what it drew before, and a link that is not a link never becomes one.
 */
check("only a real link can go into a document", (() => {
  return (
    isSafeLink("https://example.com/work") &&
    isSafeLink("http://example.com") &&
    isSafeLink("mailto:you@example.com") &&
    // Everything else is words on a page rather than an annotation: a script in an emailed PDF is not a
    // surprise anyone should get from a portfolio.
    !isSafeLink("javascript:alert(1)") &&
    !isSafeLink("JavaScript:alert(1)") &&
    !isSafeLink("data:text/html,<script>") &&
    !isSafeLink("file:///etc/passwd") &&
    !isSafeLink("example.com") &&
    !isSafeLink("https://") &&
    !isSafeLink("mailto:") &&
    !isSafeLink("")
  );
})());

check("links are typed as text and read as data, without inventing anything", (() => {
  const parsed = parseLinks(
    [
      "LinkedIn | https://linkedin.com/in/you",
      "https://you.example.com/work",
      "  email  |  mailto:you@example.com  ",
      "bad | javascript:alert(1)",
      "",
      "   ",
    ].join("\n"),
  );
  return (
    parsed.length === 3 &&
    parsed[0].label === "LinkedIn" &&
    parsed[0].url === "https://linkedin.com/in/you" &&
    // A bare url gets its host as the label rather than sixty characters of nothing.
    parsed[1].label === "you.example.com" &&
    // Trimming happens once, so a round trip through the field changes nothing.
    parsed[2].url === "mailto:you@example.com" &&
    formatLinks(parsed).split("\n").length === 3 &&
    formatLinks(parseLinks(formatLinks(parsed))) === formatLinks(parsed) &&
    // And the dropped line is dropped, not kept and hidden.
    !formatLinks(parsed).includes("javascript")
  );
})());

check("a contact block keeps what it recognises and nothing else", (() => {
  const cleaned = cleanContact({
    tagline: "  VDC Coordinator  ",
    email: "you@example.com",
    phone: "",
    location: "Portland, OR",
    links: [
      { label: "LinkedIn", url: "https://linkedin.com/in/you" },
      { label: "bad", url: "javascript:alert(1)" },
      { url: "https://you.example.com" },
      "not an object",
    ],
  });
  return (
    cleaned?.tagline === "VDC Coordinator" &&
    cleaned.email === "you@example.com" &&
    // A blank phone is absent rather than an empty string, so nothing draws an empty separator.
    cleaned.phone === undefined &&
    cleaned.links?.length === 2 &&
    cleaned.links[1].label === "you.example.com" &&
    // The one line the cover prints, in one order, assembled in one place.
    contactLine(cleaned) === "you@example.com · Portland, OR" &&
    contactLine({ phone: "555 0100" }) === "555 0100" &&
    contactLine(undefined) === "" &&
    contactLine({ email: "  ", location: "  " }) === "" &&
    // Nothing to draw means nothing to draw: no empty line on the cover of an old document.
    hasContact(undefined) === false &&
    hasContact({ email: "   " }) === false &&
    hasContact({ tagline: "A line" }) === true &&
    hasContact({ links: [{ label: "x", url: "https://x.example" }] }) === true &&
    // Nothing recognisable in means nothing out.
    cleanContact(undefined) === undefined &&
    cleanContact("you@example.com") === undefined &&
    cleanContact({}) === undefined &&
    cleanContact({ email: "   ", links: [] }) === undefined
  );
})());

/**
 * The cover, planned.
 *
 * The plan is what both renderers draw from, so this is where "the screen and the file agree" is decided: the
 * tagline, the one contact line and the links are assembled once, here, and left out entirely when there are none.
 */
check("the cover carries what it knows, and adds nothing it was not given", (() => {
  const bare = createPortfolio({
    projects: [{ id: "pr-c", name: "Tower", slides: [{ id: "sl-c", title: "Page", blocks: [] }] }],
  });
  const withContact = createPortfolio({
    author: "Alex Rivera",
    projects: [{ id: "pr-c", name: "Tower", slides: [{ id: "sl-c", title: "Page", blocks: [] }] }],
    contact: {
      tagline: "VDC Coordinator",
      email: "you@example.com",
      location: "Portland, OR",
      links: [{ label: "LinkedIn", url: "https://linkedin.com/in/you" }],
    },
  });
  const plainCover = planPortfolio(bare)[0];
  const cover = planPortfolio(withContact)[0];
  return (
    // A document with no contact block plans exactly the cover it always did.
    plainCover.kind === "cover" &&
    plainCover.contactLine === undefined &&
    plainCover.tagline === undefined &&
    plainCover.links === undefined &&
    cover.contactLine === "you@example.com · Portland, OR" &&
    cover.tagline === "VDC Coordinator" &&
    cover.links?.length === 1 &&
    cover.author === "Alex Rivera"
  );
})());

/**
 * The document's look.
 *
 * The composer had one look built into it: six sizes, one typeface family, five colours, all written where they
 * were drawn. A theme is what turns that into a decision — and the reason these checks matter is that a theme
 * which quietly changed the *default* would mean every existing document opened looking different.
 */
check("with no theme, the document draws exactly what it always drew", (() => {
  const variables = themeVariables(undefined);
  const styles = themedTextStyles(undefined);
  return (
    // Same hexes, same point sizes, same families — the static table, reached through the themed path.
    Object.entries(PORTFOLIO_INK).every(([role, value]) => variables[`--proj-${role}`] === value) &&
    TEXT_STYLE_ORDER.every((id) => styles[id].paper.fontSize === TEXT_STYLES[id].paper.fontSize) &&
    TEXT_STYLE_ORDER.every((id) => styles[id].paper.fontFamily === TEXT_STYLES[id].paper.fontFamily) &&
    TEXT_STYLE_ORDER.every((id) => styles[id].menu === TEXT_STYLES[id].menu) &&
    TEXT_STYLE_ORDER.every((id) => variables[`--proj-size-${id}`] === `${SCREEN_SIZES[id]}px`) &&
    isDefaultTheme(undefined) &&
    isDefaultTheme({}) &&
    // And a document whose theme is only *partly* set still resolves the rest to the default.
    themeOf({ scheme: "plum" }).type === DEFAULT_THEME.type &&
    themeOf({ scheme: "plum" }).scale === DEFAULT_THEME.scale
  );
})());

check("a look moves the colours, the fonts and every size — and nothing else", (() => {
  const roomy = themedTextStyles({ type: "editorial", scale: "roomy" });
  const compact = themedTextStyles({ scale: "compact" });
  const sheet = applyThemeToSheet(
    {
      body: { fontSize: 10.5, color: PORTFOLIO_INK.ink, fontFamily: "Helvetica", marginTop: 4 },
      head: { fontFamily: "Helvetica-Bold", color: PORTFOLIO_INK.navy, marginTop: 14 },
      paper: { backgroundColor: "#ffffff", color: "#e11d48" },
    },
    { scheme: "plum", type: "editorial", scale: "roomy" },
  );
  return (
    // Sizes multiply, and monotonically: roomy is bigger than standard is bigger than compact.
    roomy.headline.paper.fontSize === 43.2 &&
    compact.headline.paper.fontSize === 37.6 &&
    roomy.subject.paper.fontSize > TEXT_STYLES.subject.paper.fontSize &&
    compact.subject.paper.fontSize < TEXT_STYLES.subject.paper.fontSize &&
    themeVariables({ scale: "roomy" })["--proj-size-headline"] === "20.5px" &&
    // Families come from the pairing: serif headings over a sans body, in both engines.
    roomy.headline.paper.fontFamily === "Times-Bold" &&
    roomy.subject.paper.fontFamily === "Helvetica" &&
    TYPE_PAIRINGS.helvetica.screen.text === TYPE_PAIRINGS.helvetica.screen.heading &&
    TYPE_PAIRINGS.editorial.screen.heading !== TYPE_PAIRINGS.editorial.screen.text &&
    // The sheet: palette roles swap, sizes scale, layout survives untouched.
    sheet.body.color === INK_SCHEMES.plum.colours.ink &&
    sheet.head.color === INK_SCHEMES.plum.colours.navy &&
    sheet.head.fontFamily === "Times-Bold" &&
    sheet.body.fontSize === 11.3 &&
    sheet.body.marginTop === 4 &&
    sheet.head.marginTop === 14 &&
    // A colour that is not one of the five is not ours to change.
    sheet.paper.backgroundColor === "#ffffff" &&
    sheet.paper.color === "#e11d48" &&
    // The controls show a value even on a document that has never chosen one.
    themeOf({ scheme: "nonsense" as never, type: "nonsense" as never }).scheme === DEFAULT_THEME.scheme &&
    cleanTheme({ scheme: "plum", type: "chartreuse", scale: 7 })?.scheme === "plum" &&
    cleanTheme({ scheme: "plum", type: "chartreuse", scale: 7 })?.type === undefined &&
    cleanTheme({ type: "chartreuse" }) === undefined &&
    cleanTheme("plum") === undefined
  );
})());

check("every part of the PDF takes its colours, fonts and sizes from the document's look", (() => {
  // The renderer is a tree of components and the theme reaches them by context, so the failure this guards
  // against is one component reading the untabbed sheet directly and staying navy in a plum document. Three
  // mentions of `BASE_SHEET` are exactly right: its definition, the context that defaults to it, and the
  // builder that themes it.
  const source = readFileSync(
    join(process.cwd(), "components", "PortfolioPdfDocument.tsx"),
    "utf8",
  );
  return (
    (source.match(/BASE_SHEET/g) ?? []).length === 3 &&
    source.includes("applyThemeToSheet(BASE_SHEET, portfolio.theme)") &&
    source.includes("themedTextStyles(portfolio.theme)") &&
    source.includes("<SheetContext.Provider value={S}>") &&
    source.includes("<TextStylesContext.Provider value={styles}>") &&
    // Every component that draws words resolves them from the themed table rather than the static one.
    !source.includes("resolveTextStyle(") &&
    source.includes("styleIn(styles,") &&
    // And the cover's contact block is drawn from the plan here too, links and all.
    source.includes("contactLine ? <Text style={S.coverMeta}>") &&
    source.includes("<Link key={link.url} src={link.url} style={S.coverLink}>") &&
    // And a component that uses the sheet asks for it.
    (source.match(/const S = useSheet\(\);/g) ?? []).length >= 4
  );
})());

check("every palette is print-safe, and survives a greyscale printer", (() => {
  // The five palettes are judged here rather than by eye: body ink has to be near-black on paper, the accent has
  // to hold its shape as a rule or a link, and the five roles have to be five *different* colours rather than a
  // grey soup. A scheme that fails any of those is a scheme that prints badly.
  return INK_SCHEME_ORDER.every((id) => {
    const colours = INK_SCHEMES[id].colours;
    return (
      Object.values(colours).every((hex) => /^#[0-9a-f]{6}$/.test(hex)) &&
      new Set(Object.values(colours)).size === 5 &&
      contrastRatio(colours.ink, "#ffffff") >= 10 &&
      contrastRatio(colours.navy, "#ffffff") >= 8 &&
      contrastRatio(colours.accent, "#ffffff") >= 3 &&
      contrastRatio(colours.soft, "#ffffff") >= 3.5 &&
      // A hairline wants to be light but not invisible.
      luminanceOf(colours.rule) > 0.55
    );
  });
})());

check("every pad tone is legible on its own fill, and they are twelve different tones", (() => {
  // A pad carries the ink that is legible on it, which is the promise the whole tone table makes — so it is
  // measured rather than admired. 4.5:1 is the text-contrast figure everyone else uses.
  return (
    PAD_TONE_ORDER.length === Object.keys(PAD_TONES).length &&
    new Set(PAD_TONE_ORDER).size === PAD_TONE_ORDER.length &&
    PAD_TONE_ORDER.every((tone) => {
      const entry = PAD_TONES[tone];
      return (
        entry !== undefined &&
        entry.label.length > 0 &&
        entry.hint.length > 0 &&
        /^#[0-9a-f]{6}$/.test(entry.fill) &&
        /^#[0-9a-f]{6}$/.test(entry.ink) &&
        contrastRatio(entry.ink, entry.fill) >= 4.5
      );
    }) &&
    // Twelve fills, twelve tones: two tones that look the same are one tone offered twice.
    new Set(PAD_TONE_ORDER.map((tone) => PAD_TONES[tone].fill)).size === PAD_TONE_ORDER.length &&
    // And the set is a ramp: the lightest panel is much lighter than the darkest block, or the picker would be
    // twelve shades of the same decision.
    luminanceOf(PAD_TONES.wash.fill) - luminanceOf(PAD_TONES.ink.fill) > 0.7
  );
})());

check("the palette is written down once, and the stylesheet still agrees", (() => {
  // The values used to live in two places — the PDF's constants and `.proj-*` in globals.css — which is
  // exactly how a preview drifts from the file. They live in the table (and, for a themed document, in
  // `lib/portfolioTheme.ts`) and the stylesheet reads *variables* whose defaults are those values. So what
  // this pins is the defaults: with no theme, the page draws exactly the palette it always drew.
  const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? "";
  const declared = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim() ?? "";
  // And the page the workspace draws has to hand the look to the stylesheet, or the variables are never set
  // and every page silently draws the defaults.
  const page = readFileSync(join(process.cwd(), "app", "portfolio", "page.tsx"), "utf8");
  const classes = ["proj-ink", "proj-navy", "proj-soft", "proj-accent", "proj-rule"];
  const everyClass = [...classes, "proj-f-heading", "proj-f-text", ...TEXT_STYLE_ORDER.map((id) => `proj-s-${id}`)];
  return (
    Object.entries(PORTFOLIO_INK).every(([role, value]) => declared(`--proj-${role}`) === value) &&
    classes.every((name) => css.includes(`.${name}`)) &&
    // Every class the six styles name has to exist, or a style would draw with no family at all.
    everyClass.every((name) => css.includes(`.${name}`)) &&
    TEXT_STYLE_ORDER.every((id) =>
      TEXT_STYLES[id].className
        .split(/\s+/)
        .filter((part) => part.startsWith("proj-"))
        .every((part) => everyClass.includes(part)),
    ) &&
    // The six sizes the stylesheet falls back to are the six sizes the theme scales, to the pixel.
    TEXT_STYLE_ORDER.every(
      (id) => declared(`--proj-size-${id}`) === `${SCREEN_SIZES[id]}px`,
    ) &&
    // And the variables are actually set, from the document's own look, on the container the pages sit in.
    page.includes("themeVariables(doc?.theme)") &&
    page.includes("cleanTheme(next)")
  );
})());

check("a page's sections know which page is one of theirs", (() => {
  // The plan writes `${projectId}:${slideId}` for a page of sections and
  // `${projectId}:${slideId}:${blockId}:${half}` for one a section owns. Everything that has to tell
  // them apart goes through these two, so a flip half is never mistaken for a page with no sections.
  return (
    blocksOnPage("pr_1:sl_1") === true &&
    blocksOnPage("pr_1:sl_1:bl_9") === false &&
    pageBlockId("pr_1:sl_1:bl_9:before") === "bl_9" &&
    pageBlockId("pr_1:sl_1:bl_9:2") === "bl_9" &&
    pageBlockId("pr_1:sl_1") === undefined &&
    pageBlockId("cover") === undefined &&
    // And the renderer's two shapes agree with the planner's own ids.
    planPortfolio(createPortfolio({ projects: [] }))[0].id === "cover"
  );
})());

check("a style chosen by hand follows the document, and clearing it costs no undo step", (() => {
  const portfolio = createPortfolio({
    title: "Studio book",
    subtitle: "Selected work",
    projects: [
      {
        id: "pr-s",
        name: "Styled",
        slides: [
          {
            id: "sl-s",
            title: "Grid",
            body: "A page",
            blocks: [
              createBlock("text", { id: "bl-s", title: "Summary", body: "Words", span: 12 }),
              createBlock("image", { id: "bl-t", title: "Untouched", span: 12 }),
            ],
          },
        ],
      },
    ],
  });

  const titled = setBlockTextStyle(portfolio, "bl-s", "title", "label");
  const worded = setBlockTextStyle(titled, "bl-s", "body", "subject");
  const heading = setSlideTextStyle(worded, "sl-s", "title", "header");
  const document_ = setPortfolioTextStyle(heading, "subtitle", "label");

  // The plan carries each of them, so the file and the screen resolve the same style.
  const planned = planPortfolio(document_);
  const page = planned.find((entry) => entry.id === "pr-s:sl-s")!;
  const cover = planned.find((entry) => entry.kind === "cover")!;

    // ...and clearing returns the same document too: absent is how "as drawn" is stored, so a section
    // nobody has styled carries no field at all.
    const cleared = setBlockTextStyle(worded, "bl-s", "title", null);
    return (
      worded.projects[0].slides[0].blocks[0].textStyles?.title === "label" &&
      worded.projects[0].slides[0].blocks[0].textStyles?.body === "subject" &&
      // The other section is untouched — by reference, not merely by value.
      document_.projects[0].slides[0].blocks[1] === portfolio.projects[0].slides[0].blocks[1] &&
      page.textStyles?.title === "header" &&
      cover.textStyles?.subtitle === "label" &&
      // Choosing the same style twice is not an edit, so it costs no undo step...
      setBlockTextStyle(worded, "bl-s", "title", "label") === worded &&
      setSlideTextStyle(document_, "sl-s", "title", "header") === document_ &&
      setPortfolioTextStyle(document_, "subtitle", "label") === document_ &&
      // ...and neither is clearing a slot that is already clear.
      cleared.projects[0].slides[0].blocks[0].textStyles?.title === undefined &&
      cleared.projects[0].slides[0].blocks[0].textStyles?.body === "subject" &&
      setBlockTextStyle(cleared, "bl-s", "title", null) === cleared &&
      // A style map that empties out is dropped, so a section nobody has styled carries no field.
      setBlockTextStyle(
        setBlockTextStyle(portfolio, "bl-s", "title", "label"),
        "bl-s",
        "title",
        null,
      ).projects[0].slides[0].blocks[0].textStyles === undefined &&
      // A section that does not exist changes nothing.
      setBlockTextStyle(portfolio, "nope", "title", "label") === portfolio
    );
})());

check("a section's styles reach the pages that section owns", (() => {
  // A flip half and a filmstrip row are pages a section owns, so their words *are* the section's words.
  // The plan is where that is written down, which is why it carries a style map of its own.
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-own",
        name: "Owned",
        slides: [
          {
            id: "sl-own",
            title: "Change",
            blocks: [
              {
                ...createBlock("pair", { id: "bl-flip", title: "Ceiling", body: "Before and after" }),
                pairMode: "flip" as const,
                beforeLabel: "Existing",
                afterLabel: "After",
                images: [
                  { id: "im-a", name: "before", width: 200, height: 140, crop: { x: 0, y: 0, w: 1, h: 1 } },
                  { id: "im-b", name: "after", width: 200, height: 140, crop: { x: 0, y: 0, w: 1, h: 1 } },
                ],
                textStyles: { title: "label", body: "subject", caption: "label" },
              },
              {
                ...createBlock("filmstrip", { id: "bl-strip", title: "Set", body: "Eight frames" }),
                images: [
                  { id: "im-strip", name: "frame", width: 200, height: 140, crop: { x: 0, y: 0, w: 1, h: 1 } },
                ],
                textStyles: { title: "header", body: "title" },
              },
            ],
          },
        ],
      },
    ],
  });
  const planned = planPortfolio(portfolio);
  const flip = planned.find((entry) => entry.kind === "flip");
  const strip = planned.find((entry) => entry.kind === "filmstrip");

  return (
    // Both pages really were planned, so the assertions below are about styles rather than about a
    // missing page quietly passing.
    flip !== undefined &&
    strip !== undefined &&
    // A flip half draws the section's heading as its subtitle, so it takes the section's title style.
    flip.textStyles?.subtitle === "label" &&
    flip.textStyles?.body === "subject" &&
    flip.textStyles?.caption === "label" &&
    flip.flip?.label === "Existing" &&
    // A filmstrip's heading and line are the section's too.
    strip.textStyles?.title === "header" &&
    strip.textStyles?.body === "title" &&
    strip.title === "Set" &&
    // And a section with no styles carries nothing on the plan, so the renderer draws as it always did.
    planPortfolio(
      createPortfolio({
        projects: [
          {
            id: "pr-plain",
            name: "Plain",
            slides: [
              {
                id: "sl-plain",
                title: "Plain",
                blocks: [
                  {
                    ...createBlock("pair", { id: "bl-plain" }),
                    pairMode: "flip" as const,
                    images: [],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).find((entry) => entry.kind === "flip")?.textStyles === undefined
  );
})());

check("a before/after label is typed on the comparison, not on one of its pages", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-l",
        name: "Labels",
        slides: [
          {
            id: "sl-l",
            title: "Change",
            blocks: [
              {
                ...createBlock("pair", { id: "bl-l" }),
                pairMode: "flip" as const,
                beforeLabel: "Before",
                afterLabel: "After",
                images: [],
              },
            ],
          },
        ],
      },
    ],
  });
  const renamed = setBlockLabel(portfolio, "bl-l", "before", "Existing ceiling");
  const both = setBlockLabel(renamed, "bl-l", "after", "New ceiling");
  return (
    both.projects[0].slides[0].blocks[0].beforeLabel === "Existing ceiling" &&
    both.projects[0].slides[0].blocks[0].afterLabel === "New ceiling" &&
    // Typing what is already there is not an edit; the drawn default counts as "already there".
    setBlockLabel(both, "bl-l", "before", "Existing ceiling") === both &&
    setBlockLabel(portfolio, "bl-l", "before", "Before") === portfolio &&
    setBlockLabel(portfolio, "nope", "before", "x") === portfolio
  );
})());

/** The sliver of the DOM the screen test reads: enough to ask what was drawn, and nothing more. */
interface EditableNode {
  className: string;
  textContent: string;
  querySelectorAll: (selector: string) => Iterable<{ className: string; textContent: string }>;
}

check("the chosen style is what the page on screen draws, and nothing else moves", (() => {
  // The strongest check available without a browser: mount the real workspace in jsdom and look at the
  // classes on the elements it drew. jsdom does not implement `innerText`, which is how the editor puts
  // values into the DOM, so the *words* are not visible here — the classes are, and the classes are the
  // thing a style changes. The capitals themselves are asserted on the real PDF instead, where they are
  // in the glyphs.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    Node: g.Node,
    IS_REACT_ACT_ENVIRONMENT: g.IS_REACT_ACT_ENVIRONMENT,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const portfolio = createPortfolio({
    title: "Studio book",
    subtitle: "Selected work",
    projects: [
      {
        id: "pr-w",
        name: "Tower",
        slides: [
          {
            id: "sl-w",
            title: "Level by level",
            textStyles: { title: "header" },
            blocks: [
              createBlock("text", {
                id: "bl-w",
                title: "Selected work, in detail",
                body: "Words that stay as typed.",
                span: 12,
                // The heading's base style is the page-heading one, and the words "Selected work" inside it
                // are marked as the tag — the same mixed line the PDF has to draw.
                textStyles: { title: "header" },
                textMarks: { title: [{ start: 0, end: 13, style: "label" }] },
              }),
            ],
            pads: [],
          },
        ],
      },
    ],
  });


  const noop = () => {};
  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  try {
    act(() => {
      root.render(
        React.createElement(PortfolioWorkspace, {
          pages: planPortfolio(portfolio),
          library: { assets: [] } as never,
          footer: {
            title: "Studio book",
            projects: ["Tower"],
            pageCount: 2,
            navigable: true,
          },
          onReorder: noop,
          onDropAsset: noop,
          onMovePage: noop,
          onPreviewPage: noop,
          onActivatePage: noop,
          selectedBlockId: "bl-w",
          draggingAssetId: null,
          onSelectBlock: noop,
          edits: new Proxy({}, { get: () => noop }) as never,
          selectedPadId: null,
          onSelectPad: noop,
        }),
      );
    });

    const element = container as unknown as {
      innerHTML: string;
      querySelector: (selector: string) => EditableNode | null;
    };
    const classes = (placeholder: string) =>
      element.querySelector(
        `[contenteditable="true"][data-placeholder="${placeholder}"]`,
      )?.className ?? "";
    // The runs *inside* the section heading, which is where the mark is — the cover wears the same tag, so
    // a document-wide search would find two and say nothing about either.
    const heading = element.querySelector(
      '[contenteditable="true"][data-placeholder="section heading"]',
    );
    const runs = heading ? Array.from(heading.querySelectorAll("span")) : [];
    const body = classes("type here");

    return (
      // One line, two styles: the marked words drawn as the tag, the rest of the heading as a header — and
      // this is the same split the PDF draws, from the same `segmentsOf`.
      runs.length === 2 &&
      runs[0].className === TEXT_STYLES.label.className &&
      runs[0].textContent === "SELECTED WORK" &&
      runs[1].className === TEXT_STYLES.header.className &&
      runs[1].textContent === ", in detail" &&
      (heading?.className ?? "").includes(TEXT_STYLES.header.className) &&
      // And a body nobody styled is drawn exactly as it was before the six styles existed.
      body.includes("proj-ink") &&
      body.includes("text-[10px]")
    );

  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})(), "what the picker chooses is what the page draws");

check("a style on part of a line is a range, and ranges never fight each other", (() => {
  // Ranges rather than mark-up: the words stay plain — searchable, extractable — and the styling is a list
  // of stretches over them. `applyMark` resolves overlaps at the point of the edit, so the stored list is
  // always a set of non-overlapping runs and both renderers can be one loop.
  const base = TEXT_STYLES.header;
  const marked = applyMark(undefined, { start: 0, end: 13 }, "label");
  const twoParts = applyMark(marked, { start: 8, end: 13 }, "subject");
  const cleared = applyMark(twoParts, { start: 8, end: 13 }, null);
  const segments = segmentsOf("Selected work, in detail", base, marked);

  return (
    // One mark: the line splits into the marked run and what is left of it.
    segments.length === 2 &&
    segments[0].text === "SELECTED WORK" &&
    segments[0].style?.id === "label" &&
    segments[1].text === ", in detail" &&
    segments[1].style?.id === "header" &&
    // Overlapping a mark with another style trims the first rather than stacking two styles on one word...
    twoParts.length === 2 &&
    twoParts[0].end === 8 &&
    twoParts[0].style === "label" &&
    twoParts[1].start === 8 &&
    twoParts[1].style === "subject" &&
    // ...and clearing a range removes exactly that stretch, leaving nothing behind.
    cleared.length === 1 &&
    cleared[0].style === "label" &&
    cleared[0].end === 8 &&
    // A backwards range is the same range: a drag can end left of where it started.
    JSON.stringify(applyMark(undefined, { start: 8, end: 2 }, "label")) ===
      JSON.stringify(applyMark(undefined, { start: 2, end: 8 }, "label")) &&
    // An empty range is not a mark at all.
    applyMark(undefined, { start: 3, end: 3 }, "label").length === 0 &&
    // And no marks at all is one run, which is what keeps an untouched slot byte-identical.
    segmentsOf("Plain", base, undefined).length === 1
  );
})());

check("a range is trimmed to the words, and a whole-line choice is not a range at all", (() => {
  // Two rules that keep one dropdown honest. Ranges are clamped whenever the text changes, because a range
  // pointing past the end of a shortened line would style the wrong words. And a range covering the whole
  // text is stored as the slot's *own* style, which is what keeps "style the heading" and "highlight the
  // whole heading and style it" the same stored thing — and what lets a whole-line style survive edits.
  const block = createBlock("text", { id: "bl-m", title: "Selected work", body: "Words here" });
  const portfolio = createPortfolio({
    projects: [
      { id: "pr-m", name: "Marks", slides: [{ id: "sl-m", title: "Page", blocks: [block] }] },
    ],
  });

  const part = setBlockTextMark(portfolio, "bl-m", "title", { start: 0, end: 8 }, "label");
  const whole = setBlockTextMark(portfolio, "bl-m", "title", { start: 0, end: 13 }, "label");
  const wholeNoRange = setBlockTextMark(portfolio, "bl-m", "title", undefined, "label");
  const afterEdit = setBlockText(part, "bl-m", { title: "Selected" });

  return (
    part.projects[0].slides[0].blocks[0].textMarks?.title?.[0].end === 8 &&
    part.projects[0].slides[0].blocks[0].textStyles === undefined &&
    // All three ways of saying "the whole heading" store the same one thing.
    whole.projects[0].slides[0].blocks[0].textStyles?.title === "label" &&
    whole.projects[0].slides[0].blocks[0].textMarks === undefined &&
    JSON.stringify(whole) === JSON.stringify(wholeNoRange) &&
    // A range that runs past the end of the text is trimmed to it, not left dangling.
    clampMarks([{ start: 2, end: 99, style: "label" }], 4)?.[0].end === 4 &&
    // Editing the words trims the mark with them: "Selected w" no longer has eight characters to mark.
    afterEdit.projects[0].slides[0].blocks[0].textMarks?.title?.[0].end === 8 &&
    setBlockText(part, "bl-m", { title: "Sel" }).projects[0].slides[0].blocks[0].textMarks?.title?.[0]
      .end === 3 &&
    // Choosing the same thing twice is not an edit...
    setBlockTextMark(part, "bl-m", "title", { start: 0, end: 8 }, "label") === part &&
    // ...and a section that does not exist changes nothing.
    setBlockTextMark(portfolio, "nope", "title", { start: 0, end: 1 }, "label") === portfolio
  );
})());

const portfolioPage = readFileSync(
  join(process.cwd(), "app", "portfolio", "page.tsx"),
  "utf8",
);
const portfolioWorkspaceSource = readFileSync(
  join(process.cwd(), "components", "PortfolioWorkspace.tsx"),
  "utf8",
);
check(
  "the panel and the clipboard are rails beside the pages, not blocks above them",
  (() => {
    // This is the bug the whole layout was getting wrong: the panel was rendered *inside* the pages column,
    // stacked above the grid, so opening it pushed the pages down instead of giving them less width, and its
    // `sticky` put it over the top of a page as you scrolled. Three children in one flex row now — panel,
    // pages, clipboard — so a panel's width comes out of the workspace, the way the clipboard already did.
    const mainAt = portfolioPage.indexOf('<main className="mx-auto flex w-full');
    const columnAt = portfolioPage.indexOf('<div className="min-w-0 flex-1');
    const panelAt = portfolioPage.indexOf("<PortfolioInspector");
    const clipboardAt = portfolioPage.indexOf("<MediaLibraryPanel");
    return (
      mainAt !== -1 &&
      panelAt > mainAt &&
      panelAt < columnAt &&
      clipboardAt > columnAt &&
      // The row they share has to be a flex row, and the pages have to be the part that gives way: without
      // `min-w-0` a wide page pushes the rails off the side instead of shrinking.
      portfolioPage.includes("flex w-full max-w-[1800px]") &&
      portfolioPage.includes('className="min-w-0 flex-1') &&
      // And the styles are in the panel rather than in a bar above the pages, once.
      !portfolioPage.includes("function StyleBar")
    );
  })(),
  "one panel, one column of pages, one clipboard — and one place the styles are chosen",
);

check("the cards draw what the file draws, including the parts that were hidden", (() => {
  // The complaint this answers: the PDF drew a footer with links, a centred cover, an accent rule and
  // notes under video and mark-up sections, and the workspace drew none of it. Anything that reaches the
  // file has to be visible here first, or the preview cannot be trusted — so this mounts the real
  // workspace and looks for each of them by name.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, document: g.document, HTMLElement: g.HTMLElement, Element: g.Element, Node: g.Node };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const photo = (id: string) => ({
    id,
    name: id,
    width: 200,
    height: 140,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  });
  const portfolio = createPortfolio({
    title: "Studio book",
    subtitle: "Selected work",
    author: "Alex Rivera",
    /**
     * The cover's contact block, on the document this check draws: the preview has to show what the file will
     * print, in the same order, with the links live on screen as they are in the PDF.
     */
    contact: {
      tagline: "VDC Coordinator — available from June",
      email: "you@example.com",
      phone: "555 0100",
      location: "Portland, OR",
      links: [
        { label: "LinkedIn", url: "https://linkedin.com/in/you" },
        { label: "portfolio", url: "https://you.example.com" },
      ],
    },
    projects: [
      {
        id: "pr-f",
        name: "Tower",
        slides: [
          {
            id: "sl-f",
            title: "Level by level",
            body: "A line about this page.",
            blocks: [
              {
                ...createBlock("video", { id: "bl-v", title: "Walkthrough", span: 12 }),
                videoUrl: "https://example.com/walkthrough",
                videoPoster: photo("im-p"),
              },
            ],
            pads: [createPad({ tone: "rule", x: 0, y: 0.4, w: 1, h: 0.0035 })],
          },
        ],
      },
    ],
  });

  const noop = () => {};
  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  try {
    act(() => {
      root.render(
        React.createElement(PortfolioWorkspace, {
          pages: planPortfolio(portfolio),
          library: { assets: [] } as never,
          footer: { title: "Studio book", projects: ["Tower"], pageCount: 3, navigable: true },
          onReorder: noop,
          onDropAsset: noop,
          onMovePage: noop,
          onPreviewPage: noop,
          onActivatePage: noop,
          selectedBlockId: null,
          draggingAssetId: null,
          onSelectBlock: noop,
          edits: new Proxy({}, { get: () => noop }) as never,
          selectedPadId: null,
          onSelectPad: noop,
        }),
      );
    });

    const html = (container as unknown as { innerHTML: string }).innerHTML;
    const has = (needle: string) => html.includes(needle);
    // jsdom normalises an inline colour to `rgb(...)`, so a hex has to be looked for in both forms.
    const hasColour = (hex: string) => {
      const value = hex.replace("#", "");
      const rgb = `rgb(${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)})`;
      return has(hex) || has(rgb);
    };
    const facts: [string, boolean][] = [
      ["cover centred", has("justify-center gap-[3%] px-[3.6%]")],
      ["accent rule", hasColour(PORTFOLIO_INK.accent)],
      ["meta line", has("1 project · Tower")],
      // React writes the style attribute with spaces, and 3.03% is 24pt of a Letter page: the file's own
      // footer margin, rather than inside the text area where it used to sit.
      ["footer in the margin", has("bottom: 3.03%")],
      ["footer page number", has("Page 2 of 3")],
      ["footer title", has("Studio book")],
      // The cover's contact block, as the file will print it: what you do, how to reply, where else to look.
      ["cover: the tagline", has("VDC Coordinator — available from June")],
      ["cover: one line to reply on", has("you@example.com · 555 0100 · Portland, OR")],
      [
        "cover: live links",
        has('href="https://linkedin.com/in/you"') && has('href="https://you.example.com"'),
      ],
      // The video address is a note, not a link: it is drawn as words on the page.
      ["nothing link-styled", !has('<a href="https://example.com/walkthrough"')],
      ["video address", has("https://example.com/walkthrough")],
      ["video note", has("does not play in most viewers")],
      ["pad drawn", hasColour(PAD_TONES.rule.fill)],
    ];
    for (const [what, ok] of facts) if (!ok) console.log(`    … missing: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})(), "nothing reaches the file that the page does not show");

check("fidelity: the cards draw every word and every picture the plan holds", (() => {
  // The card half of the check the PDF suite makes on the file: one document, built the way the app builds
  // them — a template filled from the store — and then the *workspace* is asked what it actually drew. Every
  // heading, line and caption has to be on the cards, and every frame the plan holds has to be a picture
  // rather than the empty-frame panel. The mirror of this is "the pixels are collected for what the store
  // supplies": the list of pictures can be right and a card can still show a placeholder, and either way the
  // reader sees a preview that is not the document.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    Node: g.Node,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const ref = (id: string) => ({
    id,
    name: id,
    width: 10,
    height: 10,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  });
  let library = createMediaLibrary();
  for (let index = 0; index < 12; index += 1) library = addAsset(library, imageAsset(ref(`fid-${index}`)));
  library = addAsset(library, pairAsset(ref("fid-a"), ref("fid-b")));
  library = addAsset(library, textAsset("Four trade packages shared one model.", "Tied caption"));

  const project = applyTemplate(templateById("case-study")!, {
    name: "Fidelity",
    library,
    id: "pr-fid",
  });
  const portfolio = createPortfolio({ title: "Fidelity", projects: [project] });
  const pages = planPortfolio(portfolio, library);

  // A pixel for every frame, so a frame with data in the store draws a picture and nothing else does.
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AARAAE/gFv2w4WAAAAAElFTkSuQmCC";
  const data: Record<string, string> = {};
  for (const id of planImageIds(pages)) data[id] = pixel;

  const noop = () => {};
  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  try {
    act(() => {
      root.render(
        React.createElement(PortfolioWorkspace, {
          pages,
          library,
          footer: { title: portfolio.title, projects: [project.name], pageCount: pages.length, navigable: true },
          onReorder: noop,
          onDropAsset: noop,
          onMovePage: noop,
          onPreviewPage: noop,
          onActivatePage: noop,
          selectedBlockId: null,
          draggingAssetId: null,
          onSelectBlock: noop,
          edits: new Proxy({}, { get: () => noop }) as never,
          selectedPadId: null,
          onSelectPad: noop,
        }),
      );
    });

    const element = container as unknown as {
      textContent: string;
      querySelectorAll: (selector: string) => { length: number };
    };
    const cardText = element.textContent ?? "";
    const frames = planImageIds(pages);

    // What the document says, read from the plan rather than from the fixture.
    const said: string[] = [];
    for (const page of pages) {
      if (page.title) said.push(page.title);
      if (page.body && page.kind !== "cover") said.push(page.body);
      for (const block of page.blocks) {
        if (block.title) said.push(block.title);
        if (block.body) said.push(block.body);
        for (const image of block.images) if (image.caption) said.push(image.caption);
      }
    }
    const missing = said.filter((words) => !cardText.includes(words));
    for (const words of missing.slice(0, 3)) console.log(`    … card is missing: ${words}`);

    // And the frames, one at a time: a frame with pixels for its id is a picture, and a frame without is the
    // panel the file prints in its place. Both are rendered in a second container so the question is asked of
    // the component rather than of a mock.
    act(() => root.unmount());
    const withPixels = createRoot(container);
    act(() => {
      withPixels.render(
        React.createElement("div", null,
          React.createElement(Frame, { id: frames[0], data: { [frames[0]]: pixel } }),
          React.createElement(Frame, { id: frames[0], data: {} }),
        ),
      );
    });
    const drawn = container as unknown as {
      querySelectorAll: (selector: string) => { length: number };
    };
    const pictures = drawn.querySelectorAll("img").length;
    const panels = drawn.querySelectorAll(".proj-empty").length;
    act(() => withPixels.unmount());

    return (
      said.length > 4 &&
      // Every word the plan draws is on a card…
      missing.length === 0 &&
      // …every frame in the plan is handed to a frame to draw…
      frames.length > 0 &&
      // …and a frame with pixels draws the picture, while a frame without draws the printed panel.
      pictures === 1 &&
      panels === 1
    );
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})());

check("a line can be caught: a band around it, end handles, and arrow keys", (() => {
  // The complaint this answers: making a line was easy, selecting and moving one was not. A hairline is about
  // three pixels on a card, so this mounts the workspace with one line and one panel and asks what each is
  // given: a strip around the line to grab it by, handles at its *ends* rather than four corners stacked on a
  // three-pixel strip, a dashed ring that reads at that size — and, in the page above, arrow keys for the
  // times when a drag is the wrong tool at any size.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    Node: g.Node,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const panel = createPad({ id: "pad-panel", tone: "wash", x: 0, y: 0.05, w: 1, h: 0.3 });
  const rule = createPad({ id: "pad-rule", tone: "rule", x: 0.25, y: 0.5, w: 0.5, h: MIN_RULE });
  const portfolio = addPad(
    addPad(
      createPortfolio({
        projects: [{ id: "pr-pads", name: "Pads", slides: [{ id: "sl-pads", title: "One", blocks: [] }] }],
      }),
      "sl-pads",
      panel,
    ),
    "sl-pads",
    rule,
  );
  const pages = planPortfolio(portfolio);

  const noop = () => {};
  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  const query = (selector: string) =>
    (container as unknown as { querySelector: (s: string) => Element | null }).querySelector(selector);
  const all = (selector: string) =>
    Array.from(
      (container as unknown as { querySelectorAll: (s: string) => ArrayLike<Element> }).querySelectorAll(
        selector,
      ),
    );
  const classes = (element: Element | null) => element?.getAttribute("class") ?? "";

  try {
    act(() => {
      root.render(
        React.createElement(PortfolioWorkspace, {
          pages,
          library: createMediaLibrary(),
          footer: { title: "Pads", projects: ["Pads"], pageCount: pages.length, navigable: true },
          onReorder: noop,
          onDropAsset: noop,
          onMovePage: noop,
          onPreviewPage: noop,
          onActivatePage: noop,
          selectedBlockId: null,
          draggingAssetId: null,
          onSelectBlock: noop,
          edits: new Proxy({}, { get: () => noop }) as never,
          selectedPadId: rule.id,
          onSelectPad: noop,
        }),
      );
    });

    const pads = all("[data-pad]");
    const thinPad = pads.find((pad) => pad.getAttribute("data-pad-thin") === "true") ?? null;
    const thickPad = pads.find((pad) => pad.getAttribute("data-pad-thin") !== "true") ?? null;
    const facts: [string, boolean][] = [
      // Both pads are drawn, and only the line is treated as a line.
      ["two pads drawn", pads.length === 2],
      ["the rule is a line", thinPad !== null && thickPad !== null],
      // The band: wider around a line than around a panel, because that is where the difficulty is.
      ["band around the line", classes(thinPad?.querySelector("[data-pad-band]") ?? null).includes("-inset-y-2")],
      ["band on the panel", classes(thickPad?.querySelector("[data-pad-band]") ?? null).includes("-inset-y-0.5")],
      // Handles at the ends of the line, and four corners on a panel.
      ["ends, not corners", all("[data-pad-handle]").length === 2],
      ["the west end", query('[data-pad-handle="w"]') !== null],
      ["the east end", query('[data-pad-handle="e"]') !== null],
      // Selection that reads on a hairline: a ring around it, not one hidden inside three pixels.
      ["a dashed ring around it", (thinPad?.getAttribute("style") ?? "").includes("dashed")],
      ["no inset ring on a line", !(thinPad?.getAttribute("style") ?? "").includes("inset")],
      // And the ends resize the line's length, which is what their handles promise.
      ["its west end moves the edge", dragPad(rule, "w", 0.02, 0).x === rule.x + 0.02],
      ["its east end grows the length", dragPad(rule, "e", 0.02, 0).w === rule.w + 0.02],
      ["a fine nudge is a fine step", dragPad(rule, "move", 0.005, 0).x === rule.x + 0.005],
      ["and it cannot be shrunk out of existence", dragPad(rule, "e", -1, 0).w === MIN_PAD],
      // The arrows are wired in the page, at a step the panel's hint quotes.
      [
        "arrow keys nudge the selected pad",
        portfolioPage.includes('event.key.startsWith("Arrow")') &&
          portfolioPage.includes('dragPad(pad, "w", -step, 0)') &&
          portfolioPage.includes('dragPad(pad, "e", step, 0)') &&
          portfolioPage.includes("NUDGE_FINE = 0.005"),
      ],
    ];
    for (const [what, ok] of facts) if (!ok) console.log(`    … line interaction wrong: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})());

check("the story that was broken: a picture on a page, in the file, and off the cover", (() => {
  // The two reports from the reader, as one chain of document edits — because they turned out to be the same
  // thread: a picture imported, dragged onto a page, seen on the cover as well, and refusing to come off it,
  // while the PDF drew a blank frame where the card showed the photograph.
  const picture = (id: string) => ({
    id,
    name: id,
    width: 10,
    height: 10,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  });
  const library = addAsset(createMediaLibrary(), imageAsset(picture("shot-1")));
  const asset = library.assets[0];
  let doc = createPortfolio({
    projects: [
      {
        id: "pr-live",
        name: "Live",
        slides: [{ id: "sl-live", title: "One", blocks: [createBlock("image", { id: "bl-live" })] }],
      },
    ],
  });
  // Placing it in the section: the frame the section draws is an *asset id*, not a copy of the picture — which
  // is exactly the indirection the PDF preview used to miss.
  doc = placeAsset(doc, "bl-live", asset.id);
  const section = doc.projects[0].slides[0].blocks[0];

  const pages = planPortfolio(doc, library);
  /** What the workspace fetches pixels for, and what the preview fetches pixels for: the same call. */
  const wanted = planImageIds(pages);
  /** And the plan's own frames, which is what both surfaces draw. */
  const drawn = plannedFrames(pages).map((frame) => frame.id);

  const coverBefore = planPortfolio(doc, library).find((entry) => entry.kind === "cover")?.frames ?? [];
  const cleared = clearCoverImage(doc, 0);
  const coverAfter = planPortfolio(cleared, library).find((entry) => entry.kind === "cover")?.frames ?? [];

  return (
    // The section holds a reference…
    section.assetIds?.includes(asset.id) === true &&
    section.images.length === 0 &&
    // …the plan resolves it into a frame the section draws, with its pixels asked for on both surfaces…
    drawn.includes("shot-1") &&
    wanted.includes("shot-1") &&
    collectImages(doc, library).some((frame) => frame.id === "shot-1") &&
    // …the cover mirrors it, because nobody has touched the cover (the half that surprised the reader)…
    coverBefore.map((frame) => frame.id).join(",") === "shot-1" &&
    // …and once the cover is cleared, the picture is off the cover for good while staying in the section,
    // which is the half that did not work.
    coverAfter.length === 1 &&
    coverAfter[0].id === "" &&
    planPortfolio(cleared, library).some((page) =>
      page.blocks.some((block) => block.images.some((frame) => frame.id === "shot-1")),
    ) &&
    // The pixels are still asked for, because the file still draws that frame on the page.
    planImageIds(planPortfolio(cleared, library)).includes("shot-1")
  );
})());

check("the pad's controls are laid out for the panel's width, not the window's", (() => {
  // The complaint this answers: selecting a pad gave you four columns of about 65px inside a 19rem panel —
  // the grid's breakpoints were the *window's*, so on any normal screen the tone names, the chips and the
  // label field were all crushed into slivers. This mounts the real pad panel and checks the shape it is laid
  // out in, and then uses it: a panel that was merely prettier would fail the clicks.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    Node: g.Node,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const pad = createPad({
    id: "pad-l",
    tone: "wash",
    x: 0.5,
    y: 0.25,
    w: 0.5,
    h: 0.04,
    label: "Existing",
  });
  const portfolio = addPad(
    createPortfolio({
      projects: [{ id: "pr-pad", name: "Studio", slides: [{ id: "sl-pad", title: "One", blocks: [] }] }],
    }),
    "sl-pad",
    pad,
  );
  const pages = planPortfolio(portfolio);
  const page = pages.find((entry) => entry.kind === "project") ?? pages[1] ?? pages[0];

  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  const calls: { updates: Partial<PagePad>[]; deleted: number; closed: number } = {
    updates: [],
    deleted: 0,
    closed: 0,
  };
  const html = () => (container as unknown as { innerHTML: string }).innerHTML;
  const byText = (text: string) =>
    Array.from(dom.window.document.querySelectorAll("button")).find(
      (entry) => (entry.textContent ?? "").trim() === text,
    );
  const click = (target: Element | undefined) => {
    if (target) {
      act(() => {
        target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
    }
    return Boolean(target);
  };

  try {
    act(() => {
      root.render(
        React.createElement(PadInspector, {
          pad,
          page,
          onUpdate: (patch: Partial<PagePad>) => calls.updates.push(patch),
          onDelete: () => {
            calls.deleted += 1;
          },
          onClose: () => {
            calls.closed += 1;
          },
        }),
      );
    });
    const markup = html();
    const facts: [string, boolean][] = [
      // Where it is, spelled out in the page's own percentages rather than "50%, 25% · 50% × 4%".
      [
        "position reads as percentages",
        ["left 50%", "top 25%", "50% wide", "4% tall"].every((entry) => markup.includes(entry)),
      ],
      // Six tones in two equal columns, each name spelled out beside its swatch.
      [
        "six tones, named",
        PAD_TONE_ORDER.every((id) => markup.includes(`>${PAD_TONES[id].label}<`)) &&
          markup.includes("grid-cols-2"),
      ],
      // Chips that take the room they are given: "full width" spanning both columns, the rest filling one.
      ["chips fill their column", markup.includes("col-span-2") && (markup.match(/w-full/g)?.length ?? 0) >= 4],
      // And no four-column grid anywhere: one group per row is what stopped the whole thing being slivers.
      ["no four-column grid", !markup.includes("grid-cols-4") && !portfolioWorkspaceSource.includes("xl:grid-cols-4")],
      // Still a control panel, not just a tidier one: every choice reports what was chosen, and the two
      // buttons do their jobs.
      ["a tone can be chosen", click(byText("navy")) && calls.updates.some((patch) => patch.tone === "navy")],
      ["outline can be chosen", click(byText("outline")) && calls.updates.some((patch) => patch.outline === true)],
      ["it can be deleted", click(byText("Delete pad")) && calls.deleted === 1],
      ["it can be closed", click(byText("Done")) && calls.closed === 1],
      // And it says how to handle a line, which is the thing that is hard to see: a strip to grab it by and
      // arrow keys to place it, both stated where the pad's controls are.
      [
        "it explains how to catch a line",
        markup.includes("Arrow keys") && markup.includes("drag <i>near</i> a line"),
      ],
    ];
    for (const [what, ok] of facts) if (!ok) console.log(`    … pad panel wrong: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})());

check("the left panel carries the styles, the page's own controls, and the selection's", (() => {
  // One panel, one target. What used to be a style bar above the pages, a strip under every page, and two
  // panels at the top of the workspace is now a single column — so this mounts it and asks whether the
  // things a reader needs are all *there*, for the page and for what is selected on it.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, document: g.document, HTMLElement: g.HTMLElement, Element: g.Element, Node: g.Node };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const block = createBlock("text", { id: "bl-p", title: "Summary", body: "Words", span: 12 });
  /**
   * Two pictures as well, so the page's print-size readout has something to judge: a frame placed 7in wide with
   * 1600px behind it is sharp, and the same placement with 400px behind it is not — which is the whole reason that
   * arithmetic exists.
   */
  const sharp = createBlock("image", { id: "bl-sharp", title: "Elevation", span: 12 });
  sharp.images = [ref("im-sharp")];
  const soft = createBlock("image", { id: "bl-soft", title: "Detail", span: 12 });
  soft.images = [{ id: "im-soft", name: "detail.jpg", width: 400, height: 300, crop: { x: 0, y: 0, w: 1, h: 1 } }];
  const library = addAsset(
    addAsset(createMediaLibrary(), imageAsset(ref("im-sharp"))),
    imageAsset({ id: "im-soft", name: "detail.jpg", width: 400, height: 300, crop: { x: 0, y: 0, w: 1, h: 1 } }),
  );
  const portfolio = createPortfolio({
    projects: [
      { id: "pr-p", name: "Tower", slides: [{ id: "sl-p", title: "Page", blocks: [block, sharp, soft] }] },
    ],
  });
  const pages = planPortfolio(portfolio, library);
  const noop = () => {};
  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);

  const mount = (selectedBlockId: string | null, selectedPadId: string | null) => {
    root.render(
      React.createElement(PortfolioInspector, {
        page: pages.find((entry) => entry.kind === "project") ?? pages[0],
        pages,
        selectedBlockId,
        selectedPadId,
        projectName: "Tower",
        selection: null,
        currentStyle: undefined,
        drawnAs: "title",
        activePad: null,
        edits: new Proxy({}, { get: () => noop }) as never,
        onTextStyle: noop,
        onLineStyle: noop,
        onPadStyle: noop,
        onChoose: noop,
        onSpan: noop,
        onColumns: noop,
        onSlots: noop,
        onShape: noop,
        onMoveBlock: noop,
        onMoveAcross: noop,
        onDeleteBlock: noop,
        onSelectBlock: noop,
        onSelectPad: noop,
        onAddSection: noop,
        onLayout: noop,
        onAddPad: noop,
        onFillPage: noop,
        onDeletePage: noop,
        onPreviewPage: noop,
        theme: undefined,
        onTheme: noop,
        contact: undefined,
        onContact: noop,
      }),
    );
  };

  try {
    let html = "";
    act(() => mount("bl-p", null));
    html = (container as unknown as { innerHTML: string }).innerHTML;
    const has = (needle: string) => html.includes(needle);
    const aside = () => dom.window.document.querySelector("aside");
    const asideClass = () => aside()?.className ?? "";
    const facts: [string, boolean][] = [
      // Pinned beside the pages, above them, scrolling inside itself. Without `sticky` it scrolls away;
      // without `z-30` the page cards' own positioned popovers paint over it; without the height limit a long
      // panel runs off the bottom of the window.
      ["panel pinned", asideClass().includes("sticky")],
      ["panel beside the pages, not over them", asideClass().includes("top-4")],
      ["panel above the pages", asideClass().includes("z-30")],
      ["panel scrolls in place", asideClass().includes("max-h-[calc(100vh-2rem)]")],
      ["text style", has("text style")],
      ["line style", has("line style")],
      ["pad style", has("pad style")],
      // What each dropdown says with nothing selected has to match what it acts on: the line dropdown used to
      // say "no pad selected", which is the pad dropdown's line, not its own.
      ["line style names a line", has("no line selected") && !has(">no pads selected<")],
      ["pad style names a pad", has("no pad selected")],
      ["section controls", has("frames across")],
      ["page: add", has("add to this page")],
      ["page: shape", has("shape and grouping")],
      ["page: spread", has("spread over the page")],
      ["page: delete", has("delete this page")],
      ["page: read", has("read this page")],
      ["section: delete", has("Delete section")],
      // One of the presentation options by name, which is what the section's presentation renders as.
      ["section: its presentation", has("Full bleed")],
      // The document's look, at the foot of the panel: three choices and a line naming what they are. This is
      // the control that makes the composer's look a decision rather than a constant.
      ["the look: a palette", has('aria-label="Palette"')],
      ["the look: a typeface", has('aria-label="Typeface"')],
      ["the look: a scale", has('aria-label="Type scale"')],
      [
        "the look says when it is the default",
        has("the look this composer has always drawn") && has("Harbour · Helvetica · Standard"),
      ],
      ["every palette is on offer", INK_SCHEME_ORDER.every((id) => has(INK_SCHEMES[id].name))],
      ["every pairing is on offer", TYPE_PAIRING_ORDER.every((id) => has(TYPE_PAIRINGS[id].name))],
      ["every scale is on offer", TYPE_SCALE_ORDER.every((id) => has(TYPE_SCALES[id].name))],
      // And the cover's contact block: what a hiring manager needs in order to act on the document at all.
      ["contact: what you do", has('aria-label="What you do"')],
      ["contact: a way to reply", has('aria-label="Email"') && has('aria-label="Phone"')],
      ["contact: where you are", has('aria-label="Where you are"')],
      ["contact: links", has('aria-label="Links"')],
      ["contact: the link format", has("one per line")],
      // And the print-size readout: the one screen that answers "will this print as sharp as it looks".
      ["print size: a good frame", has("229 DPI — sharp at this size.")],
      ["print size: a soft one", has("57 DPI — too tight a crop")],
      ["print size: the source size", has("1600×1000px source")],
      ["print size: the placed width", has("7.0 in wide")],
      ["print size: says so when a frame is whole", has(", whole frame")],
    ];

    // And it can be put away, the way the clipboard can: the pages get the whole width back, and the rail
    // brings it back.
    const click = (title: string) => {
      const target = dom.window.document.querySelector(`button[title="${title}"]`);
      if (target) {
        act(() => {
          target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
        });
      }
      return Boolean(target);
    };
    const collapsed = click("Collapse");
    const rail = () => asideClass();
    facts.push(
      ["collapse clicked", collapsed],
      // Closed, it is a rail down the side: a tab's worth of width and nothing above the pages.
      ["put away to a rail", rail().includes("w-9") && rail().includes("flex-col") && rail().includes("sticky")],
      ["rail still names the panel", (aside()?.textContent ?? "").includes("style & page")],
      ["rail hides the controls", !(aside()?.textContent ?? "").includes("frames across")],
    );
    const reopened = click("Show the style and page panel");
    facts.push(["brought back", reopened && (aside()?.textContent ?? "").includes("frames across")]);

    for (const [what, ok] of facts) if (!ok) console.log(`    … panel missing: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})(), "one panel, one target, one place to look");

check("the clipboard holds images and text, and offers to keep what you highlighted", (() => {
  // The complaint this answers: the panel arrived holding things nobody had saved — pairs, numbers, links,
  // saved sections — and offered to make more of them. It is a clipboard now: images and text go in, and
  // they come out again. Nothing appears because the app thought it might be useful.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    Node: g.Node,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  const html = () => (container as unknown as { innerHTML: string }).innerHTML;
  const byLabel = (label: string) =>
    Array.from(dom.window.document.querySelectorAll("button")).find((entry) =>
      (entry.textContent ?? "").includes(label),
    );

  const library = addAsset(
    addAsset(
      createMediaLibrary(),
      imageAsset({
        id: "im-1",
        name: "Fabrication",
        width: 200,
        height: 140,
        crop: { x: 0, y: 0, w: 1, h: 1 },
      }),
    ),
    textAsset("A paragraph that earns its place.", "A paragraph that earns its place"),
  );
  const mount = (selectionText?: string) =>
    React.createElement(MediaLibraryPanel, {
      library,
      onChange: () => {},
      onPlace: () => {},
      targetLabel: "Level by level",
      selectionText,
      onSaveSelection: () => {},
    });

  try {
    act(() => {
      root.render(mount());
    });
    const loaded = html();
    const beforeHighlight = byLabel("Save highlighted text");
    const facts: [string, boolean][] = [
      // Two ways in, and only two.
      ["import images", loaded.includes("Import images")],
      ["add snippet", loaded.includes("Add snippet")],
      // Two groups, named as what they are.
      ["images", loaded.includes(">Images<")],
      ["text modules", loaded.includes("Text modules")],
      // The things that used to be in it, and are not any more.
      ["no seeding from the profile", !loaded.includes("Seed text from Master Profile")],
      ["no pairs", !loaded.includes("Before / after pairs")],
      ["no numbers", !loaded.includes("Add metric")],
      ["no links", !loaded.includes("Add link")],
      ["no saved sections", !loaded.includes("Saved sections")],
      // Nothing highlighted means nothing to keep, so the button says as much by being unavailable.
      ["off with no highlight", Boolean(beforeHighlight) && beforeHighlight?.disabled === true],
    ];

    act(() => {
      root.render(mount("three little words"));
    });
    const afterHighlight = byLabel("Save highlighted text (3 words)");
    facts.push(
      ["counts the highlight", Boolean(afterHighlight)],
      ["ready to keep it", Boolean(afterHighlight) && afterHighlight?.disabled === false],
      // The count is the same function the label uses, so the button cannot promise a different number.
      ["counts words, not spaces", wordCount("three little words") === 3 && wordCount("  \n ") === 0],
    );

    // An empty clipboard says so, and offers nothing to place: no stray buttons, no empty groups.
    act(() => {
      root.render(
        React.createElement(MediaLibraryPanel, {
          library: createMediaLibrary(),
          onChange: () => {},
          onPlace: () => {},
        }),
      );
    });
    const empty = html();
    facts.push(
      ["empty clipboard says so", empty.includes("Nothing in the clipboard yet")],
      ["nothing to place", !empty.includes("Place</button>")],
      ["no empty groups", !empty.includes(">Images</p>")],
    );

    // The clipboard is a rail of the same kind as the panel on the left: pinned, above the pages, and closed
    // down to a tab rather than to a button that takes a line of the page.
    const clipboardAside = () => dom.window.document.querySelector("aside")?.className ?? "";
    const click = (title: string) => {
      const target = dom.window.document.querySelector(`button[title="${title}"]`);
      if (target) {
        act(() => {
          target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
        });
      }
      return Boolean(target);
    };
    facts.push(
      ["clipboard pinned", clipboardAside().includes("sticky") && clipboardAside().includes("top-4")],
      ["clipboard above the pages", clipboardAside().includes("z-30")],
      ["clipboard scrolls in place", clipboardAside().includes("max-h-[calc(100vh-2rem)]")],
    );
    const folded = click("Collapse");
    facts.push(
      ["clipboard collapses", folded],
      ["folded to a tab", clipboardAside().includes("w-9") && clipboardAside().includes("flex-col")],
      ["tab says what it is", (dom.window.document.querySelector("aside")?.textContent ?? "").includes("clipboard")],
      ["unfolds again", click("Show the clipboard") && html().includes("Import images")],
    );

    for (const [what, ok] of facts) if (!ok) console.log(`    … clipboard missing: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})(), "the clipboard holds what you put in it");

check("projects can be dragged into any position", (() => {
  const project = (id: string) => ({
    id,
    name: id,
    slides: [{ id: `${id}-s`, title: "P", blocks: [] }],
  });
  const portfolio = createPortfolio({
    projects: [project("pr-a"), project("pr-b"), project("pr-c")],
  });
  const order = (doc: Portfolio) => doc.projects.map((entry) => entry.id).join(",");
  return (
    order(moveProjectTo(portfolio, "pr-c", 0)) === "pr-c,pr-a,pr-b" &&
    order(moveProjectTo(portfolio, "pr-a", 2)) === "pr-b,pr-c,pr-a" &&
    // Out of range clamps, and a drop that changes nothing returns the same document.
    order(moveProjectTo(portfolio, "pr-b", 9)) === "pr-a,pr-c,pr-b" &&
    moveProjectTo(portfolio, "pr-b", 1) === portfolio &&
    moveProjectTo(portfolio, "pr-nope", 0) === portfolio
  );
})());

check("sections can be reordered, and stop at the ends", (() => {
  const project = applyTemplate(templateById("change")!, {
    name: "Order",
    library: createMediaLibrary(),
    id: "pr-e4",
  });
  const portfolio = createPortfolio({ projects: [project] });
  const down = moveSlide(portfolio, "pr-e4-s0", 1);
  const up = moveSlide(portfolio, "pr-e4-s0", -1);
  return (
    down.projects[0].slides[0].id === "pr-e4-s1" &&
    down.projects[0].slides[1].id === "pr-e4-s0" &&
    up.projects[0].slides.map((slide) => slide.id).join(",") === "pr-e4-s0,pr-e4-s1,pr-e4-s2,pr-e4-s3"
  );
})());

check("unplacing an asset removes it from that section only", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("un-1")));
  library = addAsset(library, imageAsset(ref("un-2")));
  const project = applyTemplate(templateById("one-pager")!, { name: "Unplace", library, id: "pr-e5" });
  const portfolio = createPortfolio({ projects: [project] });
  const after = unplaceAsset(portfolio, project.slides[0].blocks[0].id, "un-1");
  const ids = after.projects[0].slides[0].blocks[0].assetIds ?? [];
  return ids.length === 1 && ids[0] === "un-2";
})());

check("the macro step gives every unplaced asset a home, once", (() => {
  let library = createMediaLibrary();
  for (let index = 0; index < 9; index += 1) library = addAsset(library, imageAsset(ref(`u-${index}`)));
  library = addAsset(library, textAsset("A caption that has no section yet.", "Loose caption"));
  library = addAsset(library, metricAsset({ label: "hours saved", value: "180" }));

  const empty = createPortfolio({ title: "Empty" });
  const first = arrangeUnplaced(empty, library);
  const second = arrangeUnplaced(first.portfolio, library);
  return (
    first.placed === 11 &&
    // Nine frames in rows of four, plus a notes section and a numbers section.
    first.portfolio.projects[0].slides.length === 5 &&
    // Pressing it again does nothing, so it is safe to run twice.
    second.placed === 0 &&
    second.portfolio.projects[0].slides.length === 5 &&
    planPortfolio(first.portfolio, library).length > 5
  );
})(), "9 frames + caption + number");

check("a caption whose image is placed is not treated as stranded", (() => {
  // Otherwise tidying up would pull every caption away from its photograph and into a section of
  // its own, undoing the reason for tying them together.
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("tied-1")));
  library = addAsset(library, textAsset("Belongs to the frame above.", "Tied caption"));
  library = tieCompanion(library, "tied-1", library.assets.find((asset) => asset.text)!.id);

  const result = arrangeUnplaced(createPortfolio({ projects: [] }), library);
  const titles = result.portfolio.projects[0].slides.map((slide) => slide.title);
  return result.placed === 1 && !titles.includes("Unplaced notes");
})());

check("removing an asset from the store takes its ties with it", (() => {
  let library = createMediaLibrary();
  library = addAsset(library, imageAsset(ref("drop-1")));
  library = addAsset(library, textAsset("Attached text.", "Attached"));
  const textId = library.assets.find((asset) => asset.text)!.id;
  library = tieCompanion(library, "drop-1", textId);
  const after = dropTiesTo(library, textId);
  return companionsOf(library, "drop-1").length === 1 && companionsOf(after, "drop-1").length === 0;
})());

check("projects can be reordered, and stop at the ends", (() => {
  const project = (id: string) => ({ id, name: id, slides: [{ id: `${id}-s`, title: "P", blocks: [] }] });
  const portfolio = createPortfolio({ projects: [project("pr-a"), project("pr-b"), project("pr-c")] });
  const order = (value: typeof portfolio) => value.projects.map((entry) => entry.id).join(",");
  return (
    order(moveProject(portfolio, "pr-a", 1)) === "pr-b,pr-a,pr-c" &&
    order(moveProject(portfolio, "pr-c", 1)) === "pr-a,pr-b,pr-c" &&
    order(moveProject(portfolio, "pr-a", -1)) === "pr-a,pr-b,pr-c"
  );
})());

check("frame size is one table, read by both surfaces", (() => {
  // The PDF renderer and the on-screen workspace both ask this function, so "tall" cannot mean one
  // thing on screen and another in the file.
  return (
    frameAspect("wide") === FRAME_ASPECT.wide &&
    frameAspect("tall") === FRAME_ASPECT.tall &&
    frameAspect(undefined) === FRAME_ASPECT.standard &&
    FRAME_ASPECT.wide > FRAME_ASPECT.standard &&
    FRAME_ASPECT.standard > FRAME_ASPECT.tall
  );
})());

check("a page carries its fill setting onto the plan", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-fill",
        name: "Fill",
        slides: [
          {
            id: "sl-fill",
            title: "Page",
            blocks: [createBlock("image", { presentation: "full" })],
            fillPage: true,
          },
        ],
      },
    ],
  });
  const pageId = "pr-fill:sl-fill";
  return (
    planPortfolio(portfolio).find((page) => page.id === pageId)?.fillPage === true &&
    planPortfolio(setFillPage(portfolio, "sl-fill", false)).find((page) => page.id === pageId)
      ?.fillPage === false
  );
})());

check("a block remembers how much room its frames take", (() => {
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-sh",
        name: "Shape",
        slides: [
          { id: "sl-sh", title: "Page", blocks: [createBlock("image", { id: "bl-shape", presentation: "full" })] },
        ],
      },
    ],
  });
  const shaped = setBlockShape(portfolio, "bl-shape", "tall");
  return (
    shaped.projects[0].slides[0].blocks[0].shape === "tall" &&
    // The original is untouched: every edit returns a new document.
    portfolio.projects[0].slides[0].blocks[0].shape === undefined
  );
})());

check("a write-only difference is not a change, so a save cannot loop", (() => {
  // The stores rewrite `updatedAt` on every save, so the read-back always differs from the screen.
  // Comparing plainly therefore sees a change every time: reset state, write again, forever. That is
  // why edits appeared only after a reload.
  const onScreen = { id: "pf-1", title: "Work", updatedAt: "2026-01-01T00:00:00.000Z" };
  const justSaved = { ...onScreen, updatedAt: "2026-01-01T00:00:09.999Z" };
  const edited = { ...justSaved, title: "Work, revised" };
  return storeChangeIsReal(onScreen, justSaved) === false && storeChangeIsReal(onScreen, edited) === true;
})());

check("save → reread runs once, not forever", (() => {
  // The loop, modelled: write, read back, decide. With the stamp-aware guard it settles after one
  // write; without it, every round looks like a change.
  const start = { id: "pf-loop", title: "Loop", updatedAt: "2026-01-01T00:00:00.000Z" };
  let current = start;
  let writes = 0;
  for (let round = 0; round < 8; round += 1) {
    const stored = { ...current, updatedAt: new Date().toISOString() };
    writes += 1;
    if (!storeChangeIsReal(current, stored)) break;
    current = stored;
  }
  return writes === 1 && current === start;
})(), "one write, then quiet");

check("the portfolio subscriber asks the stamp-aware question", (() => {
  // A source check, because this is the second time this exact mistake has reached the app: the
  // subscriber is the one place where comparing plainly is guaranteed to be wrong.
  const source = readFileSync(join(process.cwd(), "components", "WorkspaceProvider.tsx"), "utf8");
  const at = source.indexOf("subscribe(STORAGE_KEYS.portfolio");
  const block = at === -1 ? "" : source.slice(at, at + 600);
  return block.length > 0 && block.includes("storeChangeIsReal") && !block.includes("sameJson(");
})(), "the one comparison that must be stamp-aware");

check("the pad guard is wired where the press actually begins", (() => {
  // A source check, because this is a DOM-behaviour bug and the suite renders no React. The rule is in
  // `clickClearsTools` and tested above; what this asserts is that the component asks it the right
  // question, which is the half that a refactor can quietly lose. Recording the press on the *capture*
  // phase at the page box is the part that matters: recording it on the pad's own handler leaves a stale
  // "true" behind whenever a real drag's click is swallowed, and the next click on the page then does
  // nothing at all — a worse bug than the one being fixed.
  const source = readFileSync(join(process.cwd(), "components", "PortfolioWorkspace.tsx"), "utf8");
  const click = source.indexOf("onClick={(event) => {", source.indexOf("data-page-box"));
  const block = click === -1 ? "" : source.slice(click, click + 700);
  const pad = source.indexOf("const beginPadDrag");
  const begin = pad === -1 ? "" : source.slice(pad, pad + 1600);
  return (
    block.includes("clickClearsTools") &&
    block.includes("startedOnPad") &&
    source.includes("onPointerDownCapture") &&
    begin.includes("captured: false") &&
    // Capture only after real travel — the guard that keeps a plain click on a pad.
    source.includes("travelled > 3") &&
    // And a press on the pad's own label types rather than dragging the pad out from under the caret.
    begin.includes("isContentEditable") &&
    // The press no longer sets the flag itself, which is what made it stale.
    !begin.includes("padPressRef.current = true")
  );
})(), "where a press began, recorded before it can go stale");

check("a dragged block takes the place it was dropped on", (() => {
  const block = (id: string) => createBlock("image", { id, presentation: "full" });
  const portfolio = createPortfolio({
    projects: [
      {
        id: "pr-drag",
        name: "Drag",
        slides: [{ id: "sl-drag", title: "Page", blocks: [block("bl-a"), block("bl-b"), block("bl-c")] }],
      },
    ],
  });
  const order = (value: typeof portfolio) =>
    value.projects[0].slides[0].blocks.map((entry) => entry.id).join(",");

  return (
    // Dragged to the top, a block takes that position and the others shuffle down.
    order(moveBlockTo(portfolio, "bl-c", 0)) === "bl-c,bl-a,bl-b" &&
    // Dropped on a block, it takes that block's place rather than landing beside it.
    order(moveBlockTo(portfolio, "bl-c", 1)) === "bl-a,bl-c,bl-b" &&
    // A drop past the end appends instead of throwing.
    order(moveBlockTo(portfolio, "bl-a", 9)) === "bl-b,bl-c,bl-a" &&
    // Dropping something where it already is changes nothing, so it costs no undo step: the same
    // document comes back, not merely an equal one.
    order(moveBlockTo(portfolio, "bl-a", 0)) === "bl-a,bl-b,bl-c" &&
    moveBlockTo(portfolio, "bl-a", 0) === portfolio
  );
})(), "one drag, one step");

check("the header tally counts page kinds in words", (() => {
  // The old header read `cover · project · project · project`, which is the renderer's vocabulary
  // leaking into the interface. This pins the wording a reader can act on.
  let library = createMediaLibrary();
  library = addAsset(library, pairAsset(ref("sum-a"), ref("sum-b")));
  for (let index = 0; index < 4; index += 1) library = addAsset(library, imageAsset(ref(`sum-${index}`)));

  const project = applyTemplate(templateById("case-study")!, { name: "Summary", library, id: "pr-sum" });
  const summary = pageSummary(planPortfolio(createPortfolio({ projects: [project] }), library));

  return (
    summary.startsWith("cover + ") &&
    /\d+ pages?/.test(summary) &&
    /flip pages?/.test(summary) &&
    /wide rows?/.test(summary) &&
    // The internal kind names never reach the reader.

/* -------------------------------------------------------------------------- */

    !/project|filmstrip/.test(summary)
  );
})(), "kinds in words, never `project`");


section("27. The map: where the work is, and how far");

/**
 * Distances against distances anybody can check.
 *
 * Portland to Seattle is about 145 miles; Portland to Hillsboro 15; Salem 43; Bend 121 straight across Mount
 * Hood (160 by road, and the map is a map, not a router); Boise 345. These are the numbers a real map gives.
 */
check("a distance is a real distance, not a guess", (() => {
  const portland = locatePlace("Portland, OR")!.point;
  const near = (place: string, expected: number, tolerance: number) =>
    Math.abs(milesBetween(portland, locatePlace(place)!.point) - expected) <= tolerance;
  return (
    near("Seattle, WA", 145, 6) &&
    near("Hillsboro, OR", 15, 3) &&
    near("Salem, OR", 43, 4) &&
    near("Bend, OR", 121, 5) &&
    near("Boise, ID", 345, 8) &&
    // The direction, because "145 mi" without a "N" is half an answer.
    compassBetween(portland, locatePlace("Seattle, WA")!.point) === "N" &&
    compassBetween(portland, locatePlace("Hillsboro, OR")!.point) === "W" &&
    compassBetween(portland, locatePlace("Bend, OR")!.point) === "SE" &&
    /^\d+(\.\d+)? mi [NSEW]{1,2}$/.test(describeTrip(portland, locatePlace("Salem, OR")!.point))
  );
})());

check("the projection the tiles are cut in puts every point where it belongs", (() => {
  const portland = locatePlace("Portland, OR")!.point;
  const seattle = locatePlace("Seattle, WA")!.point;
  const frame = { width: 720, height: 420 };
  const view = { lat: portland.lat, lng: portland.lng, zoom: 9 };
  const here = projectIntoView(portland, view, frame.width, frame.height);
  const north = projectIntoView(seattle, view, frame.width, frame.height);
  // Fifteen miles due west, worked out on the ground rather than on the map: 69.055 miles to a degree of
  // latitude, shrunk by the cosine at this latitude.
  const west = projectIntoView(
    { lat: portland.lat, lng: portland.lng - 15 / (69.055 * Math.cos((portland.lat * Math.PI) / 180)) },
    view,
    frame.width,
    frame.height,
  );
  // The zoom that holds both cities, and the frame it claims they fit in.
  const fitted = viewToFit([portland, seattle], frame.width, frame.height)!;
  const inFrame = (at: { x: number; y: number }) =>
    at.x >= 0 && at.y >= 0 && at.x <= frame.width && at.y <= frame.height;
  // A pin either side of the date line: the fit has to wrap the short way round, not the long way.
  const across = viewToFit([{ lat: 0, lng: 179 }, { lat: 0, lng: -179 }], frame.width, frame.height)!;
  const eastEnd = projectIntoView({ lat: 0, lng: 179 }, across, frame.width, frame.height);
  const westEnd = projectIntoView({ lat: 0, lng: -179 }, across, frame.width, frame.height);
  return (
    // At the widest zoom out a pixel is about 12 miles of equator — 97.17 at zoom 0, halved three times —
    // and every further zoom halves it again. The world stops there on purpose: zoom 0 is a fifth of a planet
    // in a postage stamp.
    Math.abs(milesPerPixel(0, MIN_ZOOM) - 97.17 / 2 ** MIN_ZOOM) < 0.01 &&
    Math.abs(milesPerPixel(0, MIN_ZOOM + 1) - milesPerPixel(0, MIN_ZOOM) / 2) < 0.001 &&
    // Mercator stretches longitude towards the poles; the cosine is what undoes it, so a pixel at 60° north
    // covers half the ground it does at the equator.
    Math.abs(milesPerPixel(60, MIN_ZOOM) - milesPerPixel(0, MIN_ZOOM) * 0.5) < 0.001 &&
    // The base is in the middle of a frame centred on it, and north is up.
    Math.abs(here.x - frame.width / 2) < 0.5 &&
    Math.abs(here.y - frame.height / 2) < 0.5 &&
    north.y < here.y &&
    // Fifteen miles west is fifteen miles' worth of pixels to the left: no clamping, no rim, no distortion.
    Math.abs(here.x - west.x - pixelsForMiles(15, portland.lat, view.zoom)) < 1 &&
    // A place projected and unprojected is the same place: the drag maths and the pin maths agree.
    Math.abs(unprojectMercator(projectMercator(portland, 15), 15).lat - portland.lat) < 1e-9 &&
    Math.abs(unprojectMercator(projectMercator(portland, 15), 15).lng - portland.lng) < 1e-9 &&
    // The fit really fits, and across the date line it fits the short way.
    inFrame(projectIntoView(portland, fitted, frame.width, frame.height)) &&
    inFrame(projectIntoView(seattle, fitted, frame.width, frame.height)) &&
    // The fit went the short way round: 179° and −179° are two degrees apart, and land mirrored about the
    // middle of the frame rather than at opposite ends of a 358° view.
    inFrame(eastEnd) &&
    inFrame(westEnd) &&
    Math.abs(eastEnd.x + westEnd.x - frame.width) < 1 &&
    Math.abs(Math.abs(westEnd.x - eastEnd.x) - (2 / 360) * worldSize(across.zoom)) < 1 &&
    // The whole country is reachable: even the widest zoom out is bigger than any frame.
    worldSize(MIN_ZOOM) > frame.width &&
    MAX_ZOOM > MIN_ZOOM &&
    // And a radius the frame cannot show never zooms in past the frame: the ring is sized to fit.
    pixelsForMiles(30 * 2, portland.lat, zoomForRadius(30, portland.lat, frame.width, frame.height)) <=
      Math.min(frame.width, frame.height)
  );
})());

check("the map asks for the tiles of the place it is showing", (() => {
  const portland = locatePlace("Portland, OR")!.point;
  const view = { lat: portland.lat, lng: portland.lng, zoom: 10 };
  const { tiles, zoom } = tilesForView(view, 720, 420);
  // The tile that contains Portland has to be among the tiles asked for, or the middle of the map would be
  // somewhere else.
  const at = projectMercator(portland, zoom);
  const wanted = `${Math.floor(at.x / TILE_SIZE)}/${Math.floor(at.y / TILE_SIZE)}`;
  const covers = tiles.some((tile) => `${tile.x}/${tile.y}` === wanted);
  const urls = tiles.map((tile) => fillTileUrl(DEFAULT_TILE_URL, tile.z, tile.x, tile.y));
  const uniform = urls.every((url) => /^https:\/\/tile\.openstreetmap\.org\/10\/\d+\/\d+\.png$/.test(url));
  // And they cover the frame edge to edge, with no two of them in the same place.
  const lefts = tiles.map((tile) => tile.left);
  const tops = tiles.map((tile) => tile.top);
  const coversFrame =
    Math.min(...lefts) <= 0 &&
    Math.max(...lefts) + TILE_SIZE >= 720 &&
    Math.min(...tops) <= 0 &&
    Math.max(...tops) + TILE_SIZE >= 420;
  const unique = new Set(tiles.map((tile) => `${Math.round(tile.left)}:${Math.round(tile.top)}`)).size === tiles.length;
  // North of the top of the world there is nothing to ask for: a view at the pole clips instead of requesting
  // tile rows that do not exist.
  const pole = tilesForView({ lat: 85.05, lng: 0, zoom: 3 }, 720, 420);
  const insideWorld = pole.tiles.every(
    (tile) => tile.x >= 0 && tile.x < 2 ** 3 && tile.y >= 0 && tile.y < 2 ** 3,
  );
  // A server other than the default is a matter of a URL: the placeholders are what makes it a setting.
  const other = fillTileUrl("https://{s}.example.com/{z}/{x}/{y}.png", 12, 654, 1583);
  return (
    covers &&
    uniform &&
    coversFrame &&
    unique &&
    insideWorld &&
    tiles.length >= 6 &&
    /^https:\/\/[abc]\.example\.com\/12\/654\/1583\.png$/.test(other)
  );
})());

check("the gazetteer places what postings actually say", (() => {
  const place = (text: string) => {
    const fix = locatePlace(text);
    return fix ? `${fix.label}|${fix.precision}` : "none";
  };
  return (
    // The ways a location line gets written, including mode words and a second option.
    place("Portland, OR") === "Portland, OR|city" &&
    place("Hillsboro, OR (Hybrid)") === "Hillsboro, OR|city" &&
    place("Portland, OR / Vancouver, WA") === "Portland, OR|city" &&
    place("Portland, OR · Hybrid") === "Portland, OR|city" &&
    place("Hillsboro OR") === "Hillsboro, OR|city" &&
    place("Beaverton, Oregon") === "Beaverton, OR|city" &&
    place("Kirkland, Washington") === "Kirkland, WA|city" &&
    place("St. Paul, MN") === "St. Paul, MN|city" &&
    // A bare city resolves to the one a person means; an unknown one is not invented.
    place("Portland") === "Portland, OR|city" &&
    place("Nowhereville, ZZ") === "none" &&
    // "Remote" is not a place: those are listed separately rather than dropped on a head office.
    place("Remote") === "none" &&
    place("Remote (US)") === "none" &&
    // A state alone is placed coarsely, and says so.
    place("Oregon") === "Oregon|state" &&
    place("OR") === "Oregon|state"
  );
})());

check("typed coordinates are read, including southern and western hemispheres", (() => {
  const north = parseLatLng("45.5152, -122.6784");
  const letters = parseLatLng("45.5152N 122.6784W");
  const south = parseLatLng("-33.8688, 151.2093");
  return (
    north?.lat === 45.5152 &&
    north.lng === -122.6784 &&
    letters?.lng === -122.6784 &&
    south?.lat === -33.8688 &&
    south.lng === 151.2093 &&
    // Rubbish is refused rather than turned into a dot in the sea.
    parseLatLng("nonsense") === null &&
    parseLatLng("95, 200") === null &&
    parseLatLng("45.5") === null
  );
})());
check("applications are plotted, sorted, and never invented", (() => {
  const base = locatePlace("Portland, OR")!.point;
  const entries = [
    appEntry({ id: "in-1", location: "Hillsboro, OR", company: "Nearby" }),
    appEntry({ id: "in-2", location: "Salem, OR", company: "Down the valley" }),
    appEntry({ id: "in-3", location: "Bend, OR", company: "Over the mountain" }),
    appEntry({ id: "remote", location: "Remote", workMode: "Remote", company: "Anywhere Inc" }),
    appEntry({ id: "remote-place", location: "Seattle, WA (Remote)", workMode: "Remote", company: "Seattle-ish" }),
    appEntry({ id: "unknown", location: "Nowhereville, ZZ", company: "Unplaceable" }),
    appEntry({ id: "pinned", location: "Nowhereville, ZZ", coords: { lat: 45.75, lng: -122.9 }, company: "Pinned" }),
  ];
  const { plotted, loose } = plotApplications(entries, base, 30);
  const ids = plotted.map((dot) => dot.entry.id);
  const find = (id: string) => plotted.find((dot) => dot.entry.id === id);

  return (
    // Sorted by distance, nearest first, so the top of the list is the easiest commute in play.
    ids[0] === "in-1" &&
    ids[1] === "pinned" &&
    ids[2] === "in-2" &&
    ids[3] === "in-3" &&
    ids[4] === "remote-place" &&
    // Inside the circle means inside it: Hillsboro (15 mi) yes, Salem (43) and Bend (121) no.
    find("in-1")?.inside === true &&
    find("in-2")?.inside === false &&
    // A place named on a remote posting still gets a dot — the *office* is somewhere — and the dot says remote.
    find("remote-place")?.inside === false &&
    // "Remote" with no place at all is not a dot: it has no commute, which is the point of it.
    loose.some((row) => row.entry.id === "remote" && row.why === "remote") &&
    // Names the book does not know are listed, not guessed…
    loose.some((row) => row.entry.id === "unknown" && row.why === "unknown") &&
    // …unless the author pinned them, which beats the book: about 19 miles northwest of Portland.
    find("pinned")?.pinned === true &&
    (find("pinned")?.miles ?? 0) > 15 &&
    (find("pinned")?.miles ?? 0) < 25
  );
})());

check("the map's settings survive storage, with the defaults for nonsense", (() => {
  const clean = migrateMapSettings({
    base: "Portland, OR",
    radiusMiles: 50,
    tiles: false,
    view: { lat: 45.5, lng: -122.6, zoom: 9.7 },
  });
  const broken = migrateMapSettings({
    base: 42,
    radiusMiles: -3,
    tiles: "yes",
    view: { lat: "north", lng: null, zoom: 4 },
  });
  const missing = migrateMapSettings(null);
  // The shape stored before the map had imagery and a view to remember: an old record must gain the new
  // defaults rather than be thrown away.
  const older = migrateMapSettings({ base: "Portland, OR", radiusMiles: 30 });
  return (
    clean.base === "Portland, OR" &&
    clean.radiusMiles === 50 &&
    clean.tiles === false &&
    // A zoom is a whole number of tile levels, whatever was stored.
    clean.view?.lat === 45.5 &&
    clean.view?.zoom === 10 &&
    // A bad base becomes no base, and a silly radius becomes the default rather than a map nobody can read.
    broken.base === "" &&
    broken.radiusMiles === DEFAULT_MAP_SETTINGS.radiusMiles &&
    // Only a stored `false` turns the imagery off; anything else means the real map, which is the default.
    broken.tiles === true &&
    broken.view === null &&
    missing.radiusMiles === DEFAULT_MAP_SETTINGS.radiusMiles &&
    missing.tiles === true &&
    missing.basePoint === null &&
    older.base === "Portland, OR" &&
    older.tiles === true &&
    older.view === null &&
    // A remembered point is kept, and a nonsense one is not.
    migrateMapSettings({ basePoint: { lat: 45.5152, lng: -122.6784 } }).basePoint?.lat === 45.5152 &&
    migrateMapSettings({ basePoint: { lat: 91, lng: 0 } }).basePoint === null &&
    migrateMapView({ lat: 45.5, lng: -122.6, zoom: 18 })?.zoom === 18 &&
    migrateMapView({ lat: 90.1, lng: 0, zoom: 12 }) === null &&
    RADIUS_CHOICES.includes(30) &&
    // Far enough out for "I would move for that one": the map zooms and the ring grows.
    RADIUS_CHOICES.includes(500) &&
    RADIUS_CHOICES.every((choice) => choice > 0)
  );
})());

check("the place lookup reads an answer, remembers it, and never asks twice", (() => {
  // The shape Nominatim really returns, trimmed to the fields that matter — the actual answer for 97201.
  const real = [
    {
      lat: "45.5088294",
      lon: "-122.6910870",
      display_name: "97201, Southwest Hills, Portland, Multnomah County, Oregon, United States",
      addresstype: "postcode",
      type: "postcode",
    },
  ];
  const parsed = parseNominatim(real)!;
  const street = parseNominatim([
    {
      lat: "45.52",
      lon: "-122.68",
      display_name: "1234 SW Main St, Portland, Oregon, United States",
      addresstype: "house",
    },
  ]);
  const junk = [
    parseNominatim([]),
    parseNominatim(null),
    parseNominatim([{ lat: "north", lon: "-122" }]),
    parseNominatim([{ lat: "95", lon: "200" }]),
  ];
  // A ZIP code is not a place the book knows, and coordinates typed by hand never need a lookup at all.
  const zip = localAnswer("97201");
  const typed = localAnswer("45.5152, -122.6784");
  const city = localAnswer("Portland, OR");
  const unknown = localAnswer("Nowhereville, ZZ");
  // The cache fills up and forgets the oldest, so a ZIP used once cannot push out the one used daily.
  let cache: Record<string, GeocodeHit> = rememberGeocode({}, { ...parsed, query: "97201", at: 1 });
  const stored = cache["97201"];
  for (let index = 0; index < GEOCODE_CACHE_LIMIT + 5; index += 1) {
    cache = rememberGeocode(cache, {
      query: `place ${index}`,
      label: `Place ${index}`,
      point: { lat: 1, lng: 1 },
      kind: "place",
      at: 100 + index,
    });
  }
  return (
    parsed.point.lat.toFixed(4) === "45.5088" &&
    parsed.point.lng.toFixed(4) === "-122.6911" &&
    parsed.kind === "postcode" &&
    // Three parts of a postal address is a label; the whole string is a mailing label.
    parsed.label === "97201, Southwest Hills, Portland" &&
    street?.kind === "address" &&
    junk.every((answer) => answer === null) &&
    looksLikePostcode("97201") &&
    looksLikePostcode("97201-1234") &&
    !looksLikePostcode("97201 1234") &&
    geocodeKey("  Portland,   OR ") === "portland, or" &&
    zip === null &&
    typed?.kind === "coordinates" &&
    typed.label === "45.5152, -122.6784" &&
    city?.kind === "place" &&
    city.point.lat > 45 &&
    unknown === null &&
    stored?.point.lng.toFixed(4) === "-122.6911" &&
    Object.keys(cache).length === GEOCODE_CACHE_LIMIT &&
    cache["97201"] === undefined &&
    cache[`place ${GEOCODE_CACHE_LIMIT + 4}`] !== undefined &&
    // A stored cache that has been corrupted is repaired rather than trusted.
    Object.keys(migrateGeocodeCache({ "97201": { point: { lat: "x", lng: "y" } } })).length === 0 &&
    Object.keys(migrateGeocodeCache({ "97201": { point: { lat: 45.5, lng: -122.6 }, label: "97201" } })).length === 1
  );
})());


check("the map draws a pin per application, on a real map, at the radius you choose", (() => {
  // Mounted with the real provider, because half of what is being tested is the round trip: the radius is a
  // *setting*, so choosing another one has to come back through the context and redraw the ring.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    HTMLFormElement: g.HTMLFormElement,
    CustomEvent: g.CustomEvent,
    Element: g.Element,
    Node: g.Node,
    localStorage: g.localStorage,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  // Radix's switch asks whether it is inside a form; without this the whole mount throws.
  g.HTMLFormElement = dom.window.HTMLFormElement;
  // The stores announce a write with a CustomEvent on the window, and dispatch it with the *global*
  // constructor: in a browser those are the same realm, in jsdom they are not.
  g.CustomEvent = dom.window.CustomEvent;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.localStorage = dom.window.localStorage;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  // Seeded in the shape stored *before* the map had imagery and a view to remember: it has to migrate rather
  // than be discarded, which is the difference between an upgrade and a reset.
  dom.window.localStorage.setItem("vdcm.map.v1", JSON.stringify({ base: "Portland, OR", radiusMiles: 30 }));

  const entries = [
    appEntry({ id: "m1", location: "Hillsboro, OR", company: "Nearby" }),
    appEntry({ id: "m2", location: "Salem, OR", company: "Down the valley" }),
    appEntry({ id: "m3", location: "Bend, OR", company: "Over the mountain" }),
    appEntry({ id: "m4", location: "Remote", workMode: "Remote", company: "Anywhere Inc" }),
    appEntry({ id: "m5", location: "Nowhereville, ZZ", company: "Unplaceable" }),
  ];

  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  const html = () => (container as unknown as { innerHTML: string }).innerHTML;
  const find = (selector: string) => dom.window.document.querySelector(selector);
  const click = (element: Element | null) => {
    if (element) {
      act(() => {
        element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      });
    }
    return Boolean(element);
  };
  const byText = (text: string) =>
    Array.from(dom.window.document.querySelectorAll("button")).find(
      (entry) => (entry.textContent ?? "").trim() === text,
    );
  const attribute = (selector: string, name: string) => Number(find(selector)?.getAttribute(name));
  const pins = () => dom.window.document.querySelectorAll("[data-pin]");
  const tiles = () => dom.window.document.querySelectorAll("[data-tile]");

  try {
    act(() => {
      root.render(
        React.createElement(
          WorkspaceProvider,
          null,
          React.createElement(JobMap, { applications: entries }),
        ),
      );
    });
    // The provider hydrates from storage in an effect; the map is read after that has run.
    act(() => {});

    // The frame's own idea of its size, taken from the component rather than assumed: jsdom never lays
    // anything out, so the map draws at the size it falls back to and the check uses those same numbers.
    const frame = (() => {
      const size = (find("[data-map]")?.getAttribute("data-size") ?? "720x384").split("x").map(Number);
      return { width: size[0] ?? 720, height: size[1] ?? 384 };
    })();

    const base = locatePlace("Portland, OR")!.point;
    const expected = plotApplications(entries, base, 30);
    const inside = expected.plotted.filter((dot) => dot.inside).length;
    // The frame measures itself with a ResizeObserver; in jsdom there is nothing to measure, so it draws at
    // the size it assumes before a measure — which is what these numbers are.
    const zoom = attribute("[data-map]", "data-zoom");
    const hillsboro = {
      x: attribute('[data-pin="m1"]', "data-pin-x"),
      y: attribute('[data-pin="m1"]', "data-pin-y"),
    };
    const hills = expected.plotted.find((dot) => dot.entry.id === "m1")!;
    const away = Math.hypot(hillsboro.x - frame.width / 2, hillsboro.y - frame.height / 2);

    const facts: [string, boolean][] = [
      ["the centre is named", html().includes("Portland, OR")],
      ["a pin per placed application", pins().length === expected.plotted.length],
      // The ring is 30 miles of pixels, at Portland's latitude, on the zoom the frame chose.
      [
        "the ring is the radius you chose",
        attribute('[data-ring-miles="30"]', "data-ring-px") === Math.round(pixelsForMiles(30, base.lat, zoom)),
      ],
      [
        "the ring is labelled, and halved and quartered for scale",
        html().includes('data-ring-miles="30"') &&
          html().includes('data-ring-miles="15"') &&
          html().includes('data-ring-miles="7.5"') &&
          html().includes(">30 mi<"),
      ],
      // Imagery, from the default server, at the zoom being shown — and enough of it to cover the frame.
      [
        "the tiles are the ones for this place",
        tiles().length >= 6 &&
          Array.from(tiles()).every((tile) => {
            const src = tile.getAttribute("src") ?? "";
            return src.startsWith("https://tile.openstreetmap.org/") && src.endsWith(".png");
          }),
      ],
      [
        "at the zoom the frame is showing",
        Array.from(tiles()).every((tile) => (tile.getAttribute("src") ?? "").includes(`/${zoom}/`)),
      ],
      ["and they are credited", html().includes("OpenStreetMap contributors")],
      // A pin is where the place is: Hillsboro's own distance — fifteen-odd miles west — is that many miles of
      // pixels to the left of the middle, not clamped to a rim and not invented.
      [
        "a pin sits at its own distance and direction",
        Math.abs(away - pixelsForMiles(hills.miles, base.lat, zoom)) < 1 &&
          hillsboro.x < frame.width / 2 &&
          hills.miles > 14 &&
          hills.miles < 17,
      ],
      [
        "the count is said out loud",
        html().includes("inside 30 miles of Portland, OR") &&
          html().includes(`${inside} of ${expected.plotted.length}`),
      ],
      ["inside and outside are apart", html().includes("Inside 30 miles") && html().includes("Further out")],
      ["remote is listed, not plotted", html().includes("Remote, so no commute") && html().includes("Anywhere Inc")],
      ["an unplaceable name is not invented", html().includes("Not on the map") && html().includes("Unplaceable")],
      [
        "it offers a ZIP code or coordinates instead",
        Boolean(byText("pin it")) && html().includes("45.5152, -122.6784"),
      ],
      // What every application is doing, read off the pins: one colour per stage, in the legend as on the map.
      [
        "the stages in play are in the legend",
        [...new Set(expected.plotted.map((dot) => dot.entry.stage))].every((stage) =>
          html().includes(`data-stage="${stage}"`),
        ),
      ],
    ];

    // A pin can be picked, and picking it says how far away it is.
    const picked = click(find('[data-pin="m1"]'));
    facts.push(["a pin can be picked", picked && html().includes("15 mi W")]);

    // And a picked pin offers the record itself: a distance means little without the notes behind it.
    facts.push([
      "a picked pin links to its record",
      find('[data-open-record="m1"]')?.getAttribute("href") === "/saved?open=m1",
    ]);

    // The legend is also the filter: hiding a stage takes its pins off the map and says so.
    const applied = expected.plotted.filter((dot) => dot.entry.stage === "Applied").length;
    const hidOne = click(find('[data-stage="Applied"]'));
    const filtered = html();
    facts.push(
      [
        "a stage can be hidden",
        hidOne &&
          pins().length === expected.plotted.length - applied &&
          filtered.includes('data-hidden="yes"') &&
          filtered.includes("1 stage hidden") &&
          Boolean(find('[data-show-all="yes"]')),
      ],
      [
        "and every stage can be brought back",
        click(find('[data-show-all="yes"]')) &&
          pins().length === expected.plotted.length &&
          !html().includes("1 stage hidden"),
      ],
    );

    // Zooming is a map control, not a setting: the frame redraws a level in, over the tiles of that level.
    const zoomed = click(find('button[aria-label="Zoom in"]'));
    facts.push([
      "the map zooms in, and asks for the tiles of the new level",
      zoomed &&
        attribute("[data-map]", "data-zoom") === zoom + 1 &&
        tiles().length > 0 &&
        Array.from(tiles()).every((tile) => (tile.getAttribute("src") ?? "").includes(`/${zoom + 1}/`)),
    ]);

    // And the radius is a setting: at 10 miles, Hillsboro at 15 has to fall outside the ring.
    const tenMiles = click(byText("10 mi") ?? null);
    const after = html();
    const insideAtTen = plotApplications(entries, base, 10).plotted.filter((dot) => dot.inside).length;
    facts.push(
      ["the radius is a setting", tenMiles && after.includes("inside 10 miles of Portland, OR")],
      [
        "a nearer ring redraws",
        after.includes('data-ring-miles="10"') &&
          after.includes('data-ring-miles="5"') &&
          after.includes('data-ring-miles="2.5"'),
      ],
      [
        "and what is inside changes with it",
        insideAtTen < inside && after.includes(`${insideAtTen} of ${expected.plotted.length}`),
      ],
    );

    // Imagery is a switch, not a dependency: with it off the ring, the pins and every list are still drawn,
    // because none of them were ever fetched.
    const off = click(find('button[role="switch"]'));
    facts.push([
      "the imagery can be turned off, and the map still works",
      off &&
        tiles().length === 0 &&
        pins().length === expected.plotted.length &&
        Boolean(find('[data-grid="drawn"]')) &&
        !html().includes("OpenStreetMap contributors"),
    ]);

    for (const [what, ok] of facts) if (!ok) console.log(`    … map wrong: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})());

/* -------------------------------------------------------------------------- */
/* 28. The pipeline numbers                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What the saved records add up to, checked against a pipeline with a shape worked out by hand.
 *
 * The dates are relative to today rather than fixed, so the thresholds the board uses — three weeks without a
 * reply, a fortnight without a chase — are exercised on every run instead of only in the weeks when the fixture
 * happened to be the right age.
 */
section("28. The pipeline numbers");

const dayAgo = (days: number) => addDays(todayIso(), -days);

const pipelineEntries: SavedApplication[] = [
  // Replied and interviewing, chased once.
  appEntry({
    id: "q1",
    stage: "Interview",
    appliedAt: dayAgo(40),
    matchScore: 88,
    workMode: "Hybrid",
    followUpHistory: [dayAgo(35)],
  }),
  // An offer, chased twice.
  appEntry({
    id: "q2",
    stage: "Offer",
    appliedAt: dayAgo(30),
    matchScore: 82,
    workMode: "Remote",
    followUpHistory: [dayAgo(28), dayAgo(24)],
  }),
  // Screened, with a follow-up two days overdue.
  appEntry({
    id: "q3",
    stage: "Screen",
    appliedAt: dayAgo(25),
    matchScore: 71,
    workMode: "Hybrid",
    followUpAt: dayAgo(2),
  }),
  // Out 24 days at Applied with nothing after it: quiet, and never chased.
  appEntry({ id: "q4", stage: "Applied", appliedAt: dayAgo(24), matchScore: 64, workMode: "In-Office" }),
  // 19 days: not yet "quiet", but past the point of never having been chased.
  appEntry({ id: "q5", stage: "Applied", appliedAt: dayAgo(19), matchScore: 58, workMode: "Hybrid" }),
  // Five days out: too recent to be either.
  appEntry({ id: "q6", stage: "Applied", appliedAt: dayAgo(5), matchScore: 50, workMode: "In-Office" }),
  // Saved a month ago and never sent.
  appEntry({ id: "q7", stage: "Saved", savedAt: dayAgo(30), matchScore: 45 }),
  // Archived: counted in the totals, and kept out of every rate.
  appEntry({ id: "q8", stage: "Archived", appliedAt: dayAgo(60), matchScore: 90, workMode: "Remote" }),
];

const report = pipelineReport(pipelineEntries, todayIso());

check("the funnel counts everyone who got at least that far", (() => {
  const at = (stage: string) => report.funnel.find((step) => step.stage === stage)?.count ?? -1;
  return (
    // Eight records, one of them archived: seven in play. Six went out, three were answered, two reached an
    // interview, one is an offer — and every step can only be smaller than the one before it.
    report.total === 8 &&
    report.live === 7 &&
    report.closed === 1 &&
    report.sent === 6 &&
    report.replied === 3 &&
    report.interviewed === 2 &&
    report.offers === 1 &&
    at("Saved") === 7 &&
    at("Applied") === 6 &&
    at("Screen") === 3 &&
    at("Interview") === 2 &&
    at("Offer") === 1 &&
    report.funnel.length === 5 &&
    report.funnel.every((step, index) => index === 0 || step.count <= report.funnel[index - 1].count)
  );
})());

check("a rate divides what went out by what was answered", (() => {
  const empty = pipelineReport([], todayIso());
  const allSaved = pipelineReport([appEntry({ id: "s1", stage: "Saved" })], todayIso());
  return (
    report.replyRate === 0.5 &&
    Math.abs((report.interviewRate ?? 0) - 2 / 6) < 1e-9 &&
    Math.abs((report.offerRate ?? 0) - 1 / 6) < 1e-9 &&
    // Accepted from Applied onwards, so a record still at "Saved" is not counted as a silent rejection.
    report.sent === 6 &&
    // Nothing sent means no rate at all, rather than a zero that reads like a failure.
    allSaved.sent === 0 &&
    allSaved.replyRate === null &&
    empty.total === 0 &&
    empty.replyRate === null &&
    empty.medianDaysOut === null &&
    // And a rate with no base reads as a dash rather than as 0%.
    describeRate(0, 0) === "—" &&
    describeRate(1, 2) === "1 of 2 (50%)" &&
    percentLabel(null) === "—" &&
    percentLabel(0) === "0%"
  );
})());

check("what has gone quiet is what is actually quiet", (() => {
  const quiet = report.waiting.map((row) => row.entry.id);
  const unchased = report.neverChased.map((row) => row.entry.id);
  const unsent = report.unsent.map((row) => row.entry.id);
  const days = report.waiting.map((row) => row.days);
  return (
    // Out 24 days at Applied with no reply: quiet. Nineteen days is not yet, and a Screen is not silence.
    quiet.includes("q4") &&
    !quiet.includes("q5") &&
    !quiet.includes("q3") &&
    !quiet.includes("q1") &&
    // Never chased: out a fortnight or more with no follow-up ever recorded.
    unchased.includes("q4") &&
    unchased.includes("q5") &&
    !unchased.includes("q1") &&
    !unchased.includes("q2") &&
    !unchased.includes("q3") &&
    // Saved a month ago and never sent.
    unsent.includes("q7") &&
    !unsent.includes("q6") &&
    // Longest first, because the longest is the one to look at.
    days.join(",") === [...days].sort((left, right) => right - left).join(",") &&
    // The overdue follow-up is counted, and the record that has none is not.
    report.overdueFollowUps === 1 &&
    // A record with no applied date is not "out", so it cannot be quiet either.
    pipelineReport([appEntry({ id: "z1", stage: "Applied", appliedAt: undefined })], todayIso()).waiting
      .length === 0
  );
})());

check("the median is the middle, and nothing has none", (() => {
  // Only the ones still waiting to hear are timed: q4 (24), q5 (19) and q6 (5) — interviewed and offered
  // applications are not "out", they are somewhere.
  return (
    report.medianDaysOut === 19 &&
    median([5, 19, 24]) === 19 &&
    // An even count takes the mean of the two middles, rather than picking one and calling it typical.
    median([5, 19, 24, 40]) === 21.5 &&
    median([]) === null &&
    median([7]) === 7 &&
    // A record with no applied date is not part of the timing at all.
    daysOut({ appliedAt: undefined }) === null &&
    daysOut({ appliedAt: dayAgo(3) }) === 3
  );
})());


check("a link names a record, and only a record", (() => (
  // The shape the map's pins and the pipeline's rows write into a URL.
  recordIdFromSearch("?open=abc123") === "abc123" &&
  recordIdFromSearch("open=abc123") === "abc123" &&
  recordIdFromSearch("?open=%20abc123%20") === "abc123" &&
  recordIdFromSearch("?open=a%2Fb") === "a/b" &&
  // Anything else leaves the list alone rather than emptying it.
  recordIdFromSearch("") === null &&
  recordIdFromSearch("?") === null &&
  recordIdFromSearch("?open=") === null &&
  recordIdFromSearch("?open=%20") === null &&
  recordIdFromSearch("?stage=Interview") === null &&
  // What a hand-edited URL contains is read as text and never as anything more.
  recordIdFromSearch("?open=%3Cscript%3E") === "<script>"
))());


check("the bands say whether the matching converts", (() => {
  const band = (label: string) => report.bands.find((row) => row.label === label)!;
  const mode = (name: string) => report.byMode.find((row) => row.mode === name)!;
  return (
    // 88, 82 and 71 were answered; 64, 58 and 50 were not.
    band("85+").sent === 1 &&
    band("85+").replied === 1 &&
    band("85+").rate === 1 &&
    band("75–84").sent === 1 &&
    band("75–84").replied === 1 &&
    band("60–74").sent === 2 &&
    band("60–74").replied === 1 &&
    band("60–74").rate === 0.5 &&
    band("under 60").sent === 2 &&
    band("under 60").replied === 0 &&
    band("under 60").rate === 0 &&
    // Every band adds up to the same total the tiles show: no record lost between the two views.
    report.bands.reduce((sum, row) => sum + row.sent, 0) === report.sent &&
    // Nobody is counted as replied in a band they were never sent in.
    report.bands.every((row) => row.replied <= row.sent) &&
    mode("Remote").sent === 1 &&
    mode("Remote").replied === 1 &&
    mode("Hybrid").sent === 3 &&
    mode("Hybrid").replied === 2 &&
    mode("In-Office").sent === 2 &&
    mode("In-Office").replied === 0 &&
    report.byMode.reduce((sum, row) => sum + row.sent, 0) === report.sent
  );
})());

check("the board says it in numbers a person can check", (() => {
  // Mounted with the real provider, because that is where the page gets its records — and rendered twice, so
  // the empty state is checked as well as the populated one.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    Element: g.Element,
    Node: g.Node,
    localStorage: g.localStorage,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.localStorage = dom.window.localStorage;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  const html = () => (container as unknown as { innerHTML: string }).innerHTML;
  const find = (selector: string) => dom.window.document.querySelector(selector);
  const stat = (name: string) => Number(find(`[data-stat="${name}"] [data-stat-value]`)?.textContent);
  const rate = (name: string) => find(`[data-stat="${name}"] [data-stat-rate]`)?.textContent ?? "";
  const at = (stage: string) => Number(find(`[data-funnel="${stage}"]`)?.getAttribute("data-funnel-count"));
  const board = (applications: SavedApplication[]) =>
    React.createElement(
      WorkspaceProvider,
      null,
      React.createElement(PipelineBoard, { applications }),
    );

  try {
    act(() => {
      root.render(board(pipelineEntries));
    });
    act(() => {});

    const facts: [string, boolean][] = [
      [
        "the four numbers are the four numbers",
        stat("sent") === 6 && stat("replied") === 3 && stat("interviewed") === 2 && stat("offers") === 1,
      ],
      [
        "the share sits beside each of them",
        rate("replied") === "50%" && rate("offers") === "17%",
      ],
      [
        "the funnel counts everyone who got that far",
        at("Saved") === 7 &&
          at("Applied") === 6 &&
          at("Screen") === 3 &&
          at("Interview") === 2 &&
          at("Offer") === 1,
      ],
      [
        "the median is said out loud",
        Number(find("[data-median-days]")?.getAttribute("data-median-days")) === 19 &&
          html().includes("still waiting to hear"),
      ],
      [
        "archived is called out rather than quietly dropped",
        html().includes('data-archived="1"') && html().includes("not how far that application got"),
      ],
      [
        "the quiet one is named, and the merely recent one is not",
        Boolean(find('[data-kind="quiet"][data-entry="q4"]')) &&
          !find('[data-kind="quiet"][data-entry="q5"]'),
      ],
      ["never chased is listed", Boolean(find('[data-kind="unchased"][data-entry="q5"]'))],
      ["saved and never sent is listed", Boolean(find('[data-kind="unsent"][data-entry="q7"]'))],
      [
        "every row in those lists is a link to its record",
        find('[data-kind="quiet"][data-entry="q4"]')?.getAttribute("href") === "/saved?open=q4" &&
          find('[data-kind="unchased"][data-entry="q5"]')?.getAttribute("href") === "/saved?open=q5" &&
          find('[data-kind="unsent"][data-entry="q7"]')?.getAttribute("href") === "/saved?open=q7",
      ],
      ["the overdue follow-up is flagged", html().includes('data-overdue="1"')],
      [
        "the bands are shown with their rate",
        html().includes('data-band="85+"') &&
          html().includes("1 of 1 (100%)") &&
          html().includes('data-band="under 60"') &&
          html().includes("0 of 2 (0%)"),
      ],
      [
        "and the work modes beside them",
        html().includes('data-mode="Remote"') && html().includes('data-mode="Hybrid"'),
      ],
      ["it does not claim a timing it was never told", html().includes("no “days per stage”")],
    ];

    act(() => {
      root.render(board([]));
    });
    act(() => {});
    facts.push([
      "an empty pipeline says so rather than showing zeroes",
      Boolean(find('[data-empty="yes"]')) && html().includes("Nothing to measure yet"),
    ]);

    for (const [what, ok] of facts) if (!ok) console.log(`    … board wrong: ${what}`);
    return facts.every(([, ok]) => ok);
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
  }
})());

/* ------------------- the place lookup, and the ZIP code -------------------- */

/**
 * The one thing in this app that talks to a network, checked without one.
 *
 * The lookup is stubbed rather than called — for the usual reason, and a better one: a suite that needs a
 * third party to be up fails for reasons that have nothing to do with this code. What is checked here is the
 * part that is ours: that the book of places answers first and alone, that a ZIP code is the case the lookup
 * exists for, and that a service which cannot be reached is a state rather than a crash.
 */
const asyncSuite = (async () => {
  section("29. The place lookup, and a ZIP code on the map");

  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  const nominatim = [
    {
      lat: "45.5088294",
      lon: "-122.6910870",
      display_name: "97201, Southwest Hills, Portland, Multnomah County, Oregon, United States",
      addresstype: "postcode",
      type: "postcode",
    },
  ];
  const stub = (async (input: RequestInfo | URL) => {
    asked.push(String(input));
    return new Response(JSON.stringify(nominatim), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const ask = async (query: string) => {
    const response = await geocodeRoute(
      new Request(`http://localhost/api/geocode?q=${encodeURIComponent(query)}`),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  const latOf = (body: Record<string, unknown>) => (body.point as { lat: number }).lat;

  globalThis.fetch = stub;
  try {
    const typed = await ask("45.5152, -122.6784");
    const city = await ask("Portland, OR");
    const askedNothing = asked.length;
    const zip = await ask("97201");
    const again = await ask("97201");
    const tooShort = await ask("x");

    check(
      "what the book knows is answered without asking anybody",
      typed.status === 200 &&
        typed.body.kind === "coordinates" &&
        latOf(typed.body) === 45.5152 &&
        city.status === 200 &&
        city.body.kind === "place" &&
        city.body.label === "Portland, OR" &&
        // Two questions the book could answer, and not one request made.
        askedNothing === 0,
      JSON.stringify([typed.body, city.body, asked]),
    );
    check(
      "a ZIP code is the case the lookup exists for",
      zip.status === 200 &&
        zip.body.kind === "postcode" &&
        latOf(zip.body).toFixed(4) === "45.5088" &&
        zip.body.label === "97201, Southwest Hills, Portland" &&
        asked.length === 1 &&
        asked[0].startsWith("https://nominatim.openstreetmap.org/search?") &&
        asked[0].includes("q=97201"),
      JSON.stringify([zip.body, asked]),
    );
    check(
      "and it is asked once, then answered from memory",
      again.status === 200 && asked.length === 1,
      `${asked.length} requests`,
    );
    check(
      "junk is refused rather than sent on",
      tooShort.status === 400 && asked.length === 1,
      `${tooShort.status} ${JSON.stringify(tooShort.body)}`,
    );

    // A lookup service that is down is a state, not an exception: the book of places still answers.
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const offline = await ask("Gotham City, ZZ");
    const stillFine = await ask("Salem, OR");
    globalThis.fetch = stub;
    check(
      "a lookup service that cannot be reached is not a crash",
      offline.status === 502 && stillFine.status === 200 && latOf(stillFine.body) > 44,
      `${offline.status} then ${stillFine.status}`,
    );

    // One request at a time, a beat apart: the service's rule, and the reason the queue exists.
    const order: string[] = [];
    await Promise.all([
      queuedLookup(async () => {
        order.push("first");
        return 1;
      }),
      queuedLookup(async () => {
        order.push("second");
        return 2;
      }),
    ]);
    check(
      "the lookups queue rather than arriving in a burst",
      order.join(",") === "first,second",
      order.join(","),
    );

    // And the search itself reads only what it can use: a place, or nothing at all.
    const empty = (async () => new Response(JSON.stringify([]), { status: 200 })) as typeof fetch;
    const broken = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    check(
      "the search reads a place out of an answer, and never invents one",
      (await searchNominatim("97201", stub))?.point.lat.toFixed(4) === "45.5088" &&
        (await searchNominatim("nowhere", empty)) === null &&
        (await searchNominatim("nowhere", broken)) === null,
    );
  } finally {
    globalThis.fetch = realFetch;
  }


  /* ------------------------- a ZIP code, end to end -------------------------- */

  // The feature as it is used: the centre field holds a ZIP code, the button is pressed, and the map goes
  // there — and the answer is kept, so the next time needs no lookup at all.
  //
  // The field is fed by seeding what was stored rather than by faking keystrokes: this suite's jsdom never
  // delivers React's synthetic `input` event, and a check that depends on that machinery would be testing
  // jsdom. What is being checked here is the part that matters — the words the author typed, the lookup, and
  // what is remembered afterwards.
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost/",
  });
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = {
    window: g.window,
    document: g.document,
    HTMLElement: g.HTMLElement,
    HTMLFormElement: g.HTMLFormElement,
    HTMLInputElement: g.HTMLInputElement,
    CustomEvent: g.CustomEvent,
    Element: g.Element,
    Node: g.Node,
    localStorage: g.localStorage,
  };
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLFormElement = dom.window.HTMLFormElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.CustomEvent = dom.window.CustomEvent;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.localStorage = dom.window.localStorage;
  g.IS_REACT_ACT_ENVIRONMENT = true;

  dom.window.localStorage.setItem("vdcm.map.v1", JSON.stringify({ base: "97201", radiusMiles: 30 }));
  const container = dom.window.document.getElementById("root") as unknown as Element;
  const root = createRoot(container);
  const html = () => (container as unknown as { innerHTML: string }).innerHTML;
  const find = (selector: string) => dom.window.document.querySelector(selector);
  const attribute = (selector: string, name: string) => Number(find(selector)?.getAttribute(name));
  const pins = () => dom.window.document.querySelectorAll("[data-pin]");

  // What the page's own route would answer, as the browser would receive it.
  const clientCalls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    clientCalls.push(String(input));
    return new Response(
      JSON.stringify({
        query: "97201",
        label: "97201, Southwest Hills, Portland",
        point: { lat: 45.5088294, lng: -122.691087 },
        kind: "postcode",
        at: 1,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    act(() => {
      root.render(
        React.createElement(
          WorkspaceProvider,
          null,
          React.createElement(JobMap, {
            applications: [appEntry({ id: "zip-1", location: "Hillsboro, OR", company: "Nearby" })],
          }),
        ),
      );
    });
    act(() => {});
    // A ZIP code is not a place anything here knows, so before the button is pressed there is nowhere to
    // draw: the map says so rather than guessing, and the field is holding what the author typed.
    const field = dom.window.document.querySelector(
      'input[aria-label="Centre of the map"]',
    ) as HTMLInputElement;
    const beforeLookup = {
      pins: pins().length,
      map: Boolean(find("[data-map]")),
      saysSo: html().includes("Say where you would work from"),
      field: field.value,
      calls: clientCalls.length,
    };

    const button = Array.from(dom.window.document.querySelectorAll("button")).find(
      (entry) => (entry.textContent ?? "").trim() === "use this",
    );
    await act(async () => {
      button?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    const stored = JSON.parse(dom.window.localStorage.getItem("vdcm.map.v1") ?? "{}") as {
      base?: string;
      basePoint?: { lat: number };
      view?: unknown;
    };
    const cache = JSON.parse(dom.window.localStorage.getItem("vdcm.geocode.v1") ?? "{}") as Record<
      string,
      { point: { lng: number }; label: string }
    >;
    const pin = {
      x: attribute('[data-pin="zip-1"]', "data-pin-x"),
      y: attribute('[data-pin="zip-1"]', "data-pin-y"),
    };
    // The frame's own size, as the component declares it, rather than a number assumed here.
    const frameSize = (find("[data-map]")?.getAttribute("data-size") ?? "720x384").split("x").map(Number);

    check(
      "a ZIP code is not guessed at until the button is pressed",
      beforeLookup.field === "97201" &&
        beforeLookup.pins === 0 &&
        !beforeLookup.map &&
        beforeLookup.saysSo &&
        // Nothing has been asked of anybody yet.
        beforeLookup.calls === 0,
      JSON.stringify(beforeLookup),
    );
    check(
      "and pressing it puts the map on that ZIP code",
      stored.base === "97201" &&
        // The point is stored with the words, so the next reload draws before any lookup has a chance to.
        Math.abs((stored.basePoint?.lat ?? 0) - 45.5088294) < 1e-6 &&
        stored.view === null &&
        html().includes('data-centre="97201"') &&
        pins().length === 1 &&
        // And the question went to this app's own route, not straight out to a third party.
        clientCalls.length === 1 &&
        clientCalls[0].includes("/api/geocode?q=97201"),
      JSON.stringify([stored, clientCalls, pin]),
    );
    check(
      "and the answer is kept, so the next time needs no lookup",
      Math.abs((cache["97201"]?.point.lng ?? 0) + 122.691087) < 1e-6 &&
        cache["97201"]?.label === "97201, Southwest Hills, Portland",
      JSON.stringify(cache),
    );
    check(
      "the pin is measured from the new centre",
      Number.isFinite(pin.x) &&
        Number.isFinite(pin.y) &&
        // Hillsboro is about fourteen miles west of 97201, so its pin is west of the middle of the frame.
        pin.x < (frameSize[0] ?? 720) / 2 &&
        Math.hypot(pin.x - (frameSize[0] ?? 720) / 2, pin.y - (frameSize[1] ?? 384) / 2) > 1,
      JSON.stringify({ pin, frameSize }),
    );
  } finally {
    act(() => root.unmount());
    Object.assign(g, saved);
    globalThis.fetch = realFetch;
  }

})();

Promise.all([docxSuite, asyncSuite]).then(() => {
  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks passed` +
      (failures ? ` (${failures} failing)` : ""),
  );
  process.exit(failures === 0 ? 0 : 1);
});
