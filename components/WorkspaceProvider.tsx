"use client";

import * as React from "react";

import type {
  ApplicationStage,
  CoverLetter,
  JobAnalysis,
  JobDraft,
  MasterProfile,
  ResumeEdits,
  SaveVariantDetails,
  SavedApplication,
  TailoredResume,
  VersionSnapshot,
} from "@/lib/types";
import { normalizeSaveDetails, resolveStage } from "@/lib/applications";
import {
  DEFAULT_DRAFT,
  STORAGE_KEYS,
  applicationStore,
  draftStore,
  historyStore,
  mediaLibraryStore,
  mapStore,
  geocodeStore,
  portfolioStore,
  profileStore,
  storeChangeIsReal,
  subscribe,
  syncedValue,
  type StorageKey,
} from "@/lib/storage";
import { createMediaLibrary, type MediaLibrary } from "@/lib/mediaLibrary";
import { DEFAULT_MAP_SETTINGS, migrateMapSettings, type MapSettings } from "@/lib/geo";
import {
  geocodeKey,
  localAnswer,
  rememberGeocode,
  type GeocodeCache,
  type GeocodeHit,
} from "@/lib/geocode";
import { createPortfolio } from "@/lib/portfolio";
import type { Portfolio } from "@/lib/portfolioTypes";
import { analyzeJobPosting } from "@/lib/keywordAnalyzer";
import { tailorResume, type TailorOptions } from "@/lib/resumeTailorer";
import { EMPTY_EDITS, applyEdits } from "@/lib/resumeEdits";
import { createVersion, isDuplicateOfLatest, pruneVersions } from "@/lib/versions";
import { generateCoverLetter } from "@/lib/coverLetterGenerator";
import { createSeedProfile } from "@/lib/masterProfileSeed";
import { isWholesaleTextChange, makeId } from "@/lib/utils";

/**
 * Single source of truth for the whole app.
 *
 * State is seeded from the Master Profile seed so the first render is stable on
 * both server and client, then hydrated from localStorage in an effect. Every
 * mutation writes straight back to localStorage — there is no server round trip
 * anywhere in this app.
 */

interface WorkspaceValue {
  ready: boolean;
  profile: MasterProfile;
  updateProfile: (updater: (profile: MasterProfile) => MasterProfile) => void;
  replaceProfile: (profile: MasterProfile) => void;
  resetProfile: () => void;

  draft: JobDraft;
  patchDraft: (patch: Partial<JobDraft>) => void;
  /** Replaces the posting text; drops parser corrections if the posting changed. */
  patchJobText: (text: string) => void;
  clearJob: () => void;

  analysis: JobAnalysis | null;
  resume: TailoredResume;
  tailorOptions: TailorOptions;

  /** True while a manual re-analysis is in flight. */
  processing: boolean;
  lastProcessedAt: string | null;
  lastProcessMs: number | null;
  refreshAnalysis: () => Promise<void>;

  /** Hand edits applied over the tailored sheet. */
  edits: ResumeEdits;
  patchEdits: (updater: (edits: ResumeEdits) => ResumeEdits) => void;
  resetEdits: () => void;

  /** Draft version history for the loaded posting. */
  versions: VersionSnapshot[];
  snapshotVersion: (label?: string) => VersionSnapshot | null;
  restoreVersion: (id: string) => void;
  deleteVersion: (id: string) => void;
  togglePinVersion: (id: string) => void;
  canSnapshot: boolean;

  /** Cover letter for the loaded posting. */
  coverLetter: CoverLetter | null;
  generateLetter: () => CoverLetter;
  /** Regenerates with different letter options, preserving manual edits' intent. */
  setCoverLetterOptions: (patch: { nameGaps?: boolean; toName?: string }) => void;
  patchLetter: (updater: (letter: CoverLetter) => CoverLetter) => void;
  clearLetter: () => void;

  /** Freeze a stored version as a saved application variant. */
  saveVersionAsApplication: (versionId: string, details?: string | SaveVariantDetails) => SavedApplication | null;

  applications: SavedApplication[];
  saveApplication: (details?: string | SaveVariantDetails) => SavedApplication;
  updateApplication: (id: string, patch: Partial<SavedApplication>) => void;
  setApplicationStage: (id: string, stage: ApplicationStage) => void;
  deleteApplication: (id: string) => void;
  loadApplication: (id: string) => void;
  replaceApplications: (applications: SavedApplication[]) => void;

  theme: "light" | "dark";
  toggleTheme: () => void;

  /* ------------------------------- portfolio ------------------------------ */
  /** Null until a portfolio is started, which the page shows as a first step. */
  portfolio: Portfolio | null;
  updatePortfolio: (updater: (portfolio: Portfolio) => Portfolio) => void;
  replacePortfolio: (portfolio: Portfolio | null) => void;
  /** Step back and forward through portfolio edits, so a mistake costs a keystroke, not the work. */
  undoPortfolio: () => void;
  redoPortfolio: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** The media and text store every section draws from. */
  mediaLibrary: MediaLibrary;
  updateMediaLibrary: (updater: (library: MediaLibrary) => MediaLibrary) => void;
  /**
   * The calendar map's own settings: the place a commute is measured from, and how far out to show.
   *
   * Here rather than in the profile because it belongs to the *pipeline* view — "Portland, OR" is where you
   * would work, not something a resume says — and because it has to survive a reload like everything else.
   */
  mapSettings: MapSettings;
  updateMapSettings: (updater: (settings: MapSettings) => MapSettings) => void;
  /**
   * Where a typed place is: a city, a ZIP code, an address, or coordinates.
   *
   * The order it works in is what keeps the map quick and private — coordinates typed by hand, then the book
   * of places, then what has been looked up before, and only then the network. It never throws: a lookup that
   * cannot answer returns null and the map carries on with what it knows.
   */
  geocode: (text: string) => Promise<GeocodeHit | null>;
}

const WorkspaceContext = React.createContext<WorkspaceValue | null>(null);

/** How many steps of portfolio editing can be walked back. */
const HISTORY_LIMIT = 60;

/**
 * The document with its undo stacks.
 *
 * All three live in one state object so every updater stays pure: React may call an updater twice
 * in development, and a history push hidden inside one would record the same step twice.
 */
interface PortfolioHistory {
  present: Portfolio | null;
  past: Portfolio[];
  future: Portfolio[];
}

/**
 * Keeps state true to a store, wherever the change came from.
 *
 * The store broadcasts same-tab writes, which is how one screen notices something another screen
 * changed. That broadcast and this provider's own write-back effects would otherwise feed each
 * other — see `syncedValue` for why the comparison is what stops it.
 */
function useStoreSync<T>(
  key: StorageKey,
  read: () => T,
  set: React.Dispatch<React.SetStateAction<T>>,
) {
  React.useEffect(
    () => subscribe(key, () => set((current) => syncedValue(current, read()))),
    [key, read, set],
  );
}

/** Minimum characters before the analyzer bothers to run. */
const MIN_JOB_CHARS = 60;

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [profile, setProfile] = React.useState<MasterProfile>(() => createSeedProfile());
  const [draft, setDraft] = React.useState<JobDraft>(DEFAULT_DRAFT);
  const [applications, setApplications] = React.useState<SavedApplication[]>([]);
  const [versions, setVersions] = React.useState<VersionSnapshot[]>([]);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [processing, setProcessing] = React.useState(false);
  const [lastProcessedAt, setLastProcessedAt] = React.useState<string | null>(null);
  const [lastProcessMs, setLastProcessMs] = React.useState<number | null>(null);
  const [coverLetter, setCoverLetter] = React.useState<CoverLetter | null>(null);
  /** The portfolio document. Null means "not started", which the page shows as an invitation. */
  const [portfolioHistory, setPortfolioHistory] = React.useState<PortfolioHistory>({
    present: null,
    past: [],
    future: [],
  });
  const portfolio = portfolioHistory.present;
  const [mediaLibrary, setMediaLibrary] = React.useState<MediaLibrary>(() => createMediaLibrary());
  const [mapSettings, setMapSettings] = React.useState<MapSettings>(() => ({ ...DEFAULT_MAP_SETTINGS }));
  const [geocodeCache, setGeocodeCache] = React.useState<GeocodeCache>({});

  /* ------------------------------ hydration ------------------------------ */
  React.useEffect(() => {
    setProfile(profileStore.read());
    setDraft(draftStore.read());
    setApplications(applicationStore.read());
    setVersions(historyStore.read());
    setPortfolioHistory({ present: portfolioStore.read(), past: [], future: [] });
    setMediaLibrary(mediaLibraryStore.read());
    setMapSettings(mapStore.read());
    setGeocodeCache(geocodeStore.read());
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    setReady(true);
  }, []);

  /* --------------------------- cross-tab sync ---------------------------- */
  useStoreSync(STORAGE_KEYS.profile, profileStore.read, setProfile);
  useStoreSync(STORAGE_KEYS.applications, applicationStore.read, setApplications);
  useStoreSync(STORAGE_KEYS.history, historyStore.read, setVersions);
  React.useEffect(
    () => subscribe(STORAGE_KEYS.portfolio, () => setPortfolioHistory((history) => {
      const next = portfolioStore.read();
      // Stamp-aware on purpose: the store rewrites `updatedAt` on every save, so a plain comparison
      // would call this a change every time, reset the history, and write again — the loop that made
      // edits only appear after a reload. A change made in another tab does become the new baseline,
      // because keeping this tab's history would let undo resurrect a document that is gone.
      if (!storeChangeIsReal(history.present, next)) return history;
      return { present: next, past: [], future: [] };
    })),
    [],
  );
  useStoreSync(STORAGE_KEYS.mediaLibrary, mediaLibraryStore.read, setMediaLibrary);
  useStoreSync(STORAGE_KEYS.map, mapStore.read, setMapSettings);
  useStoreSync(STORAGE_KEYS.geocode, geocodeStore.read, setGeocodeCache);

  /* ------------------------------ persistence ---------------------------- */
  const firstProfileWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstProfileWrite.current) {
      firstProfileWrite.current = false;
      return;
    }
    profileStore.write(profile);
  }, [profile, ready]);

  const firstDraftWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstDraftWrite.current) {
      firstDraftWrite.current = false;
      return;
    }
    const timer = window.setTimeout(() => draftStore.write(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, ready]);

  const firstApplicationWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstApplicationWrite.current) {
      firstApplicationWrite.current = false;
      return;
    }
    applicationStore.write(applications);
  }, [applications, ready]);

  const firstVersionWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstVersionWrite.current) {
      firstVersionWrite.current = false;
      return;
    }
    historyStore.write(pruneVersions(versions));
  }, [versions, ready]);

  const firstPortfolioWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstPortfolioWrite.current) {
      firstPortfolioWrite.current = false;
      return;
    }
    // Clearing the key is meaningful here: removing the portfolio should stay removed across a
    // reload, not come back as an empty document on the next visit.
    if (portfolio) portfolioStore.write(portfolio);
    else portfolioStore.clear();
  }, [portfolio, ready]);

  const firstLibraryWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstLibraryWrite.current) {
      firstLibraryWrite.current = false;
      return;
    }
    mediaLibraryStore.write(mediaLibrary);
  }, [mediaLibrary, ready]);

  const firstMapWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstMapWrite.current) {
      firstMapWrite.current = false;
      return;
    }
    mapStore.write(mapSettings);
  }, [mapSettings, ready]);

  const firstGeocodeWrite = React.useRef(true);
  React.useEffect(() => {
    if (!ready) return;
    if (firstGeocodeWrite.current) {
      firstGeocodeWrite.current = false;
      return;
    }
    geocodeStore.write(geocodeCache);
  }, [geocodeCache, ready]);

  /* -------------------------------- analysis ----------------------------- */
  const analysis = React.useMemo<JobAnalysis | null>(() => {
    const text = draft.rawText.trim();
    if (text.length < MIN_JOB_CHARS) return null;
    const result = analyzeJobPosting(text, profile);
    // User corrections always win over the heuristics.
    if (draft.overrides.title) result.meta.title = draft.overrides.title;
    if (draft.overrides.company) result.meta.company = draft.overrides.company;
    if (draft.overrides.location) result.meta.location = draft.overrides.location;
    if (draft.overrides.workMode) result.meta.workMode = draft.overrides.workMode;
    return result;
    // `revision` is a deliberate dependency: bumping it re-runs the analysis for
    // the Re-analyse button, so the user gets a visible "yes, it processed the
    // posting I just loaded" moment even though the work is synchronous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.rawText, draft.overrides, profile, draft.revision]);

  const tailorOptions = React.useMemo<TailorOptions>(
    () => ({
      intensity: draft.intensity,
      emphasis: draft.emphasis,
      fontPt: draft.fontPt,
      showKeywordMarks: draft.showKeywordMarks,
      layout: draft.layout,
    }),
    [draft.intensity, draft.emphasis, draft.fontPt, draft.showKeywordMarks, draft.layout],
  );

  const tailored = React.useMemo(
    () => tailorResume(profile, analysis, tailorOptions),
    [profile, analysis, tailorOptions],
  );

  /** The tailored sheet with the hand-edit layer applied over it. */
  const resume = React.useMemo(
    () => applyEdits(tailored, draft.edits, { profile, analysis }),
    [tailored, draft.edits, profile, analysis],
  );

  /* -------------------------------- actions ------------------------------ */
  const updateProfile = React.useCallback((updater: (p: MasterProfile) => MasterProfile) => {
    setProfile((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }));
  }, []);

  const replaceProfile = React.useCallback((next: MasterProfile) => setProfile(next), []);

  const resetProfile = React.useCallback(() => setProfile(profileStore.reset()), []);

  const patchDraft = React.useCallback((patch: Partial<JobDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  /**
   * Manual corrections to the parser output (title, company, location, work
   * mode) belong to the posting that was in the box at the time. Replacing the
   * posting drops them, so a stale company name can never end up on a resume
   * tailored for a different job.
   */
  const patchJobText = React.useCallback((text: string) => {
    setDraft((current) => {
      const replaced = isWholesaleTextChange(current.rawText, text);
      return {
        ...current,
        rawText: text,
        overrides: replaced ? {} : current.overrides,
      };
    });
  }, []);

  const clearJob = React.useCallback(() => {
    setDraft((current) => ({ ...current, rawText: "", overrides: {}, edits: {} }));
    setCoverLetter(null);
  }, []);

  /* ------------------------------ edit layer ----------------------------- */
  const patchEdits = React.useCallback((updater: (edits: ResumeEdits) => ResumeEdits) => {
    setDraft((current) => ({ ...current, edits: updater(current.edits ?? EMPTY_EDITS) }));
  }, []);

  const resetEdits = React.useCallback(() => {
    setDraft((current) => ({ ...current, edits: {} }));
  }, []);

  /* --------------------------- re-analysis control ----------------------- */
  const refreshAnalysis = React.useCallback(async () => {
    setProcessing(true);
    const started = performance.now();
    // Yield twice so the spinner actually paints before the synchronous
    // analysis blocks the main thread.
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    setDraft((current) => ({ ...current, revision: (current.revision ?? 0) + 1 }));
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)));
    setLastProcessMs(Math.round(performance.now() - started));
    setLastProcessedAt(new Date().toISOString());
    setProcessing(false);
  }, []);

  const saveApplication = React.useCallback(
    (input?: string | SaveVariantDetails) => {
      const details = normalizeSaveDetails(input);
      const entry: SavedApplication = {
        id: makeId("app"),
        savedAt: new Date().toISOString(),
        jobTitle: analysis?.meta.title ?? "Untitled role",
        company: analysis?.meta.company ?? "Unknown company",
        location: analysis?.meta.location ?? "Unspecified",
        workMode: analysis?.meta.workMode ?? "Unspecified",
        matchScore: analysis?.matchScore ?? 0,
        intensity: draft.intensity,
        emphasis: draft.emphasis,
        rawJobText: draft.rawText,
        resume,
        edits: draft.edits ?? {},
        coverLetter: coverLetter ?? undefined,
        notes: details.notes ?? "",
        stage: resolveStage(details, "Saved"),
        appliedAt: details.appliedAt,
        followUpAt: details.followUpAt,
        contact: details.contact,
        source: details.source,
        address: details.address,
      };
      setApplications((current) => [entry, ...current]);
      return entry;
    },
    [analysis, coverLetter, draft.edits, draft.emphasis, draft.intensity, draft.rawText, resume],
  );

  const updateApplication = React.useCallback((id: string, patch: Partial<SavedApplication>) => {
    setApplications((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }, []);

  const setApplicationStage = React.useCallback(
    (id: string, stage: ApplicationStage) => updateApplication(id, { stage }),
    [updateApplication],
  );

  const deleteApplication = React.useCallback((id: string) => {
    setApplications((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const loadApplication = React.useCallback(
    (id: string) => {
      const entry = applications.find((candidate) => candidate.id === id);
      if (!entry) return;
      setDraft((current) => ({
        ...current,
        rawText: entry.rawJobText,
        intensity: entry.intensity,
        emphasis: entry.emphasis,
        edits: entry.edits ?? {},
        overrides: {},
      }));
      setCoverLetter(entry.coverLetter ?? null);
    },
    [applications],
  );

  /* ------------------------ version history actions ---------------------- */
  const canSnapshot = Boolean(analysis) || draft.rawText.trim().length > 0;

  const snapshotVersion = React.useCallback(
    (label?: string) => {
      if (!canSnapshot) return null;
      if (!label?.trim() && isDuplicateOfLatest(versions, resume, draft.edits ?? EMPTY_EDITS)) {
        return null;
      }
      const entry = createVersion({
        resume,
        edits: draft.edits ?? {},
        rawText: draft.rawText,
        jobTitle: analysis?.meta.title ?? "Untitled role",
        company: analysis?.meta.company ?? "Unknown company",
        previous: versions[0],
        index: versions.length + 1,
        label,
      });
      setVersions((current) => pruneVersions([entry, ...current]));
      return entry;
    },
    [analysis, canSnapshot, draft.edits, draft.rawText, resume, versions],
  );

  const restoreVersion = React.useCallback(
    (id: string) => {
      const version = versions.find((candidate) => candidate.id === id);
      if (!version) return;
      setDraft((current) => ({
        ...current,
        // Restoring the posting too, so a version can never be shown against
        // the wrong job's analysis.
        rawText: version.rawText,
        intensity: version.intensity,
        emphasis: version.emphasis,
        fontPt: version.fontPt,
        edits: version.edits,
        overrides: {},
        revision: (current.revision ?? 0) + 1,
      }));
    },
    [versions],
  );

  const deleteVersion = React.useCallback((id: string) => {
    setVersions((current) => current.filter((version) => version.id !== id));
  }, []);

  const togglePinVersion = React.useCallback((id: string) => {
    setVersions((current) =>
      current.map((version) =>
        version.id === id ? { ...version, pinned: !version.pinned } : version,
      ),
    );
  }, []);

  /* --------------------------- cover letter actions ---------------------- */
  const generateLetter = React.useCallback(() => {
    const letter = generateCoverLetter(profile, analysis, {
      emphasis: draft.emphasis,
      intensity: draft.intensity,
      toName: coverLetter?.toName,
      nameGaps: coverLetter?.options.nameGaps,
    });
    setCoverLetter(letter);
    return letter;
  }, [analysis, coverLetter?.options.nameGaps, coverLetter?.toName, draft.emphasis, draft.intensity, profile]);

  const setCoverLetterOptions = React.useCallback(
    (patch: { nameGaps?: boolean; toName?: string }) => {
      setCoverLetter(
        generateCoverLetter(profile, analysis, {
          emphasis: draft.emphasis,
          intensity: draft.intensity,
          toName: patch.toName ?? coverLetter?.toName,
          nameGaps: patch.nameGaps ?? coverLetter?.options.nameGaps,
        }),
      );
    },
    [analysis, coverLetter?.options.nameGaps, coverLetter?.toName, draft.emphasis, draft.intensity, profile],
  );

  const patchLetter = React.useCallback((updater: (letter: CoverLetter) => CoverLetter) => {
    setCoverLetter((current) => (current ? updater(current) : current));
  }, []);

  const clearLetter = React.useCallback(() => setCoverLetter(null), []);

  const saveVersionAsApplication = React.useCallback(
    (versionId: string, input?: string | SaveVariantDetails) => {
      const details = normalizeSaveDetails(input);
      const version = versions.find((candidate) => candidate.id === versionId);
      if (!version) return null;
      const analysisForJob = analyzeJobPosting(version.rawText, profile);
      const entry: SavedApplication = {
        id: makeId("app"),
        savedAt: new Date().toISOString(),
        jobTitle: analysisForJob.meta.title,
        company: analysisForJob.meta.company,
        location: analysisForJob.meta.location,
        workMode: analysisForJob.meta.workMode,
        matchScore: analysisForJob.matchScore,
        intensity: version.intensity,
        emphasis: version.emphasis,
        rawJobText: version.rawText,
        resume: version.resume,
        edits: version.edits,
        coverLetter: coverLetter ?? undefined,
        notes: details.notes || `Saved from ${version.label}`,
        stage: resolveStage(details, "Saved"),
        appliedAt: details.appliedAt,
        followUpAt: details.followUpAt,
        contact: details.contact,
        source: details.source,
        address: details.address,
      };
      setApplications((current) => [entry, ...current]);
      return entry;
    },
    [coverLetter, profile, versions],
  );

  /* --------------------------- auto versioning --------------------------- */
  const autoSnapshotReady = React.useRef(false);
  React.useEffect(() => {
    if (!ready) return;
    if (!autoSnapshotReady.current) {
      autoSnapshotReady.current = true;
      return;
    }
    if (draft.rawText.trim().length < MIN_JOB_CHARS) return;
    const timer = window.setTimeout(() => {
      if (isDuplicateOfLatest(versions, resume, draft.edits ?? EMPTY_EDITS)) return;
      snapshotVersion();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [ready, draft.rawText, draft.edits, resume, versions, snapshotVersion]);

  const replaceApplications = React.useCallback((next: SavedApplication[]) => {
    setApplications(next);
  }, []);

  /* ------------------------------- portfolio ------------------------------ */

  const updatePortfolio = React.useCallback((updater: (portfolio: Portfolio) => Portfolio) => {
    // One state object holding all three stacks, so the updater stays pure: React may invoke it
    // twice in development, and side effects inside it would record the same step twice.
    setPortfolioHistory((history) => {
      const base = history.present ?? createPortfolio();
      const next = updater(base);
      // An updater that changed nothing should not cost an undo step, or undo would look broken.
      if (next === base) return history;
      return {
        present: next,
        past: [...history.past, base].slice(-HISTORY_LIMIT),
        future: [],
      };
    });
  }, []);

  /** Replaces the document and clears history: an import is a new baseline, not an edit. */
  const replacePortfolio = React.useCallback((next: Portfolio | null) => {
    setPortfolioHistory({ present: next, past: [], future: [] });
  }, []);

  const undoPortfolio = React.useCallback(() => {
    setPortfolioHistory((history) => {
      if (!history.past.length) return history;
      const previous = history.past[history.past.length - 1];
      return {
        present: previous,
        past: history.past.slice(0, -1),
        future: history.present
          ? [history.present, ...history.future].slice(0, HISTORY_LIMIT)
          : history.future,
      };
    });
  }, []);

  const redoPortfolio = React.useCallback(() => {
    setPortfolioHistory((history) => {
      if (!history.future.length) return history;
      const [next, ...rest] = history.future;
      return {
        present: next,
        past: history.present
          ? [...history.past, history.present].slice(-HISTORY_LIMIT)
          : history.past,
        future: rest,
      };
    });
  }, []);

  const updateMediaLibrary = React.useCallback((updater: (library: MediaLibrary) => MediaLibrary) => {
    setMediaLibrary((current) => updater(current));
  }, []);

  const updateMapSettings = React.useCallback((updater: (settings: MapSettings) => MapSettings) => {
    setMapSettings((current) => migrateMapSettings(updater(current)));
  }, []);

  /**
   * Where a typed place is.
   *
   * The order is the design: coordinates typed by hand are exact and instant; the book of places needs no
   * network at all; a place looked up before is already on this machine. Only a genuinely new name — a ZIP
   * code, an address, a suburb the book has never heard of — becomes a request, and it is a request for the
   * place and nothing else. Failure returns null rather than throwing: the map keeps the dots it has.
   */
  const geocode = React.useCallback(
    async (text: string): Promise<GeocodeHit | null> => {
      const local = localAnswer(text);
      if (local) return local;
      const key = geocodeKey(text);
      const known = geocodeCache[key];
      if (known) return known;
      try {
        const answer = await fetch(`/api/geocode?q=${encodeURIComponent(text)}`);
        if (!answer.ok) return null;
        const found = (await answer.json()) as Partial<GeocodeHit>;
        const lat = Number(found?.point?.lat);
        const lng = Number(found?.point?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const hit: GeocodeHit = {
          query: key,
          label: typeof found.label === "string" ? found.label : text,
          point: { lat, lng },
          kind: found.kind ?? "place",
          at: Date.now(),
        };
        setGeocodeCache((current) => rememberGeocode(current, hit));
        return hit;
      } catch {
        // Offline, or the route is not there. The book of places still is, and that is the resting state.
        return null;
      }
    },
    [geocodeCache],
  );

  const toggleTheme = React.useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      try {
        window.localStorage.setItem(STORAGE_KEYS.theme, next);
      } catch {
        /* storage can be unavailable in private windows */
      }
      return next;
    });
  }, []);

  const value = React.useMemo<WorkspaceValue>(
    () => ({
      ready,
      profile,
      updateProfile,
      replaceProfile,
      resetProfile,
      draft,
      patchDraft,
      patchJobText,
      clearJob,
      analysis,
      resume,
      tailorOptions,
      processing,
      lastProcessedAt,
      lastProcessMs,
      refreshAnalysis,
      edits: draft.edits ?? EMPTY_EDITS,
      patchEdits,
      resetEdits,
      versions,
      snapshotVersion,
      restoreVersion,
      deleteVersion,
      togglePinVersion,
      canSnapshot,
      coverLetter,
      generateLetter,
      setCoverLetterOptions,
      patchLetter,
      clearLetter,
      saveVersionAsApplication,
      applications,
      saveApplication,
      updateApplication,
      setApplicationStage,
      deleteApplication,
      loadApplication,
      replaceApplications,
      portfolio,
      updatePortfolio,
      replacePortfolio,
      mediaLibrary,
      updateMediaLibrary,
      mapSettings,
      updateMapSettings,
      geocode,
      undoPortfolio,
      redoPortfolio,
      canUndo: portfolioHistory.past.length > 0,
      canRedo: portfolioHistory.future.length > 0,
      theme,
      toggleTheme,
    }),
    [
      ready,
      profile,
      updateProfile,
      replaceProfile,
      resetProfile,
      draft,
      patchDraft,
      patchJobText,
      clearJob,
      analysis,
      resume,
      tailorOptions,
      processing,
      lastProcessedAt,
      lastProcessMs,
      refreshAnalysis,
      patchEdits,
      resetEdits,
      versions,
      snapshotVersion,
      restoreVersion,
      deleteVersion,
      togglePinVersion,
      canSnapshot,
      coverLetter,
      generateLetter,
      setCoverLetterOptions,
      patchLetter,
      clearLetter,
      saveVersionAsApplication,
      applications,
      saveApplication,
      updateApplication,
      setApplicationStage,
      deleteApplication,
      loadApplication,
      replaceApplications,
      portfolio,
      updatePortfolio,
      replacePortfolio,
      undoPortfolio,
      redoPortfolio,
      portfolioHistory.past.length > 0,
      portfolioHistory.future.length > 0,
      mediaLibrary,
      updateMediaLibrary,
      mapSettings,
      updateMapSettings,
      geocode,
      theme,
      toggleTheme,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const context = React.useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  }
  return context;
}
