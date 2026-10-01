import type {
  JobDraft,
  MasterProfile,
  ProfileBullet,
  SavedApplication,
  SkillGroup,
  VersionSnapshot,
} from "./types";
import { normalizeEmphasis } from "./types";
import { normalizeSaveDetails } from "./applications";
import { isIsoDate } from "./dates";
import { MASTER_PROFILE_SEED } from "./masterProfileSeed";
import { PAGE_SIZES, createPortfolio } from "./portfolio";
import { MEDIA_LIBRARY_VERSION, type MediaAsset, type MediaLibrary } from "./mediaLibrary";
import { migrateMapSettings, type MapSettings } from "./geo";
import { migrateGeocodeCache, type GeocodeCache } from "./geocode";
import type { Portfolio, PortfolioBlock, PortfolioPageSize } from "./portfolioTypes";
import { cleanTheme } from "./portfolioTheme";
import { cleanContact } from "./portfolioContact";

/**
 * LocalStorage helpers.
 *
 * This app is local-first: no server, no accounts, and no network — with one deliberate exception, the map's
 * imagery and its place lookups, which `lib/geo.ts` and `lib/geocode.ts` explain at length. Every store is
 * versioned in its key so a future schema change can migrate instead of
 * clobbering the user's data.
 *
 * The `vdcm.` prefix is deliberately kept even though the app is no longer called
 * VDC Career Matrix: these keys *are* the user's profile, drafts, applications and
 * history. Renaming them would look tidier and silently empty the workspace.
 */
export const STORAGE_KEYS = {
  profile: "vdcm.profile.v1",
  draft: "vdcm.draft.v1",
  applications: "vdcm.applications.v1",
  history: "vdcm.history.v1",
  theme: "vdcm.theme.v1",
  /** The portfolio document: which sections exist and how they are presented. */
  portfolio: "vdcm.portfolio.v1",
  /**
   * The media and text store. Kept in its own key rather than inside the document, because
   * assets outlive any single portfolio and the pixels live separately in IndexedDB.
   */
  mediaLibrary: "vdcm.mediaLibrary.v1",
  /**
   * The map's own settings: where the commute is measured from, and how far out to show.
   *
   * Small and separate rather than inside the profile: it is about the *calendar's* view of the pipeline, and
   * a base of "Portland, OR" means nothing to a resume.
   */
  map: "vdcm.map.v1",
  /**
   * Places the lookup service has already found, so each one is looked up once and works offline after.
   *
   * It is not part of the map's settings: it is a cache with its own lifetime, it can be thrown away with no
   * consequence but a second lookup, and the author's real data is nowhere in it — only place names they typed.
   */
  geocode: "vdcm.geocode.v1",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const DEFAULT_DRAFT: JobDraft = {
  rawText: "",
  intensity: 60,
  emphasis: "balanced",
  fontPt: 9.3,
  showKeywordMarks: true,
  layout: "page",
  overrides: {},
  edits: {},
  revision: 0,
};

const CHANGE_EVENT = "vdcm:store-change";

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/* -------------------------------------------------------------------------- */
/* Raw read / write                                                           */
/* -------------------------------------------------------------------------- */

export function readJson<T>(key: StorageKey, fallback: T): T {
  if (!hasWindow()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[storage] could not parse ${key}`, error);
    return fallback;
  }
}

export function writeJson<T>(key: StorageKey, value: T): boolean {
  if (!hasWindow()) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    emitChange(key);
    return true;
  } catch (error) {
    console.error(`[storage] could not write ${key}`, error);
    return false;
  }
}

export function removeKey(key: StorageKey) {
  if (!hasWindow()) return;
  window.localStorage.removeItem(key);
  emitChange(key);
}

/** Notify every mounted hook that a key changed (same-tab writes don't fire `storage`). */
export function emitChange(key: StorageKey) {
  if (!hasWindow()) return;
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }));
}

/** Subscribe to both same-tab writes and cross-tab `storage` events. */
export function subscribe(key: StorageKey, listener: () => void): () => void {
  if (!hasWindow()) return () => {};
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ key: string }>).detail;
    if (!detail || detail.key === key) listener();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) listener();
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/* -------------------------------------------------------------------------- */
/* Same-tab sync without a feedback loop                                      */
/* -------------------------------------------------------------------------- */

/** Structural comparison, used only to decide whether a re-read changed anything. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Fields a store stamps when it writes, which are therefore never what is on screen. */
const WRITE_STAMPED_FIELDS = ["updatedAt"] as const;

/** Strips the write-time stamps, for comparison only: nothing is mutated or persisted. */
function withoutWriteStamps(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const copy = { ...(value as Record<string, unknown>) };
  for (const field of WRITE_STAMPED_FIELDS) delete copy[field];
  return copy;
}

/**
 * True when a re-read differs from what is on screen in a way the user would notice.
 *
 * The stores stamp `updatedAt` on every write, so a plain comparison reports "changed" every single
 * time. A subscriber that resets its state on that basis — as this one did — resets forever: write →
 * broadcast → read (new stamp) → state change → write. That is the loop that pinned the app and made
 * edits appear only after a reload, and it cost the undo history on every keystroke as well, because
 * the reset cleared it. This is the one question a subscriber actually needs to ask.
 */
export function storeChangeIsReal<T>(current: T, next: T): boolean {
  return syncedValue(current, next) !== current;
}

/**
 * Decides what a subscriber should keep on screen after re-reading a store.
 *
 * Reads always hand back a *new* object — `JSON.parse` cannot do anything else — so a subscriber
 * that simply sets whatever it reads will always change state, and since that state is written
 * back the two feed each other: write → broadcast → read → state change → write, forever. Two
 * guards stop it:
 *
 *  - identical content keeps the current reference, which lets React bail out entirely;
 *  - content that differs *only* by a write-time stamp is treated as unchanged too, because the
 *    store stamps a fresh `updatedAt` on every write and would otherwise look new every time.
 *
 * A genuine change still lands, so a screen showing shared data updates when another screen
 * changes it.
 */
export function syncedValue<T>(current: T, next: T): T {
  if (sameJson(current, next)) return current;
  if (sameJson(withoutWriteStamps(current), withoutWriteStamps(next))) return current;
  return next;
}

/* -------------------------------------------------------------------------- */
/* Migration + validation                                                     */
/* -------------------------------------------------------------------------- */

export function migrateProfile(raw: unknown): MasterProfile {
  const seed = MASTER_PROFILE_SEED;
  if (!raw || typeof raw !== "object") return structuredClone(seed);
  const candidate = raw as Partial<MasterProfile>;

  // Emphasis ids were renamed when the facets were generalised
  // (automation -> technical, field -> delivery). Rebuild the pitch variants
  // under the new keys instead of merging, or a stored profile would end up
  // carrying both the legacy and the current keys side by side.
  const pitchVariants = { ...seed.pitchVariants };
  for (const [key, value] of Object.entries(candidate.pitchVariants ?? {})) {
    if (typeof value !== "string" || !value.trim()) continue;
    pitchVariants[normalizeEmphasis(key)] = value;
  }

  const migrateBullets = (bullets: ProfileBullet[] | undefined) =>
    (bullets ?? []).map((bullet) =>
      Array.isArray(bullet.emphasis) && bullet.emphasis.length
        ? { ...bullet, emphasis: [...new Set(bullet.emphasis.map(normalizeEmphasis))] }
        : bullet,
    );

  const migrateGroups = (groups: SkillGroup[]) =>
    groups.map((group) =>
      Array.isArray(group.emphasis) && group.emphasis.length
        ? { ...group, emphasis: [...new Set(group.emphasis.map(normalizeEmphasis))] }
        : group,
    );

  return {
    version: candidate.version ?? seed.version,
    updatedAt: candidate.updatedAt ?? new Date().toISOString(),
    header: { ...seed.header, ...(candidate.header ?? {}) },
    pitch: candidate.pitch || seed.pitch,
    pitchVariants,
    targetMarket: {
      ...seed.targetMarket,
      ...(candidate.targetMarket ?? {}),
      locations: candidate.targetMarket?.locations ?? seed.targetMarket.locations,
      workModes: candidate.targetMarket?.workModes ?? seed.targetMarket.workModes,
      titles: candidate.targetMarket?.titles ?? seed.targetMarket.titles,
    },
    skillGroups:
      Array.isArray(candidate.skillGroups) && candidate.skillGroups.length
        ? migrateGroups(candidate.skillGroups)
        : structuredClone(seed.skillGroups),
    roles: Array.isArray(candidate.roles)
      ? candidate.roles.map((role) => ({ ...role, bullets: migrateBullets(role.bullets) }))
      : structuredClone(seed.roles),
    projects: Array.isArray(candidate.projects)
      ? candidate.projects.map((project) => ({ ...project, bullets: migrateBullets(project.bullets) }))
      : structuredClone(seed.projects),
    education: Array.isArray(candidate.education) ? candidate.education : seed.education,
    certifications: Array.isArray(candidate.certifications) ? candidate.certifications : [],
    background: Array.isArray(candidate.background) ? candidate.background : seed.background,
  };
}

export function migrateDraft(raw: unknown): JobDraft {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_DRAFT };
  const candidate = raw as Partial<JobDraft>;
  return {
    rawText: typeof candidate.rawText === "string" ? candidate.rawText : "",
    intensity:
      typeof candidate.intensity === "number" ? candidate.intensity : DEFAULT_DRAFT.intensity,
    emphasis: normalizeEmphasis(candidate.emphasis ?? DEFAULT_DRAFT.emphasis),
    fontPt: typeof candidate.fontPt === "number" ? candidate.fontPt : DEFAULT_DRAFT.fontPt,
    showKeywordMarks:
      typeof candidate.showKeywordMarks === "boolean"
        ? candidate.showKeywordMarks
        : DEFAULT_DRAFT.showKeywordMarks,
    layout: candidate.layout === "continuous" ? "continuous" : "page",
    overrides: candidate.overrides ?? {},
    edits: candidate.edits ?? {},
    revision: typeof candidate.revision === "number" ? candidate.revision : 0,
  };
}

export function migrateApplications(raw: unknown): SavedApplication[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is SavedApplication =>
        !!entry && typeof entry === "object" && "id" in entry && "resume" in entry,
    )
    .map((entry) => {
      // Applications saved before the pipeline fields existed hold their dates as
      // free text in `notes` at best, so those fields simply stay absent. A
      // non-date in a date field would put a wrong day on the calendar, so it is
      // dropped rather than rendered.
      const details = normalizeSaveDetails({
        appliedAt: entry.appliedAt,
        followUpAt: entry.followUpAt,
        contact: entry.contact,
        source: entry.source,
        address: entry.address,
        stage: entry.stage,
      });
      return {
        ...entry,
        emphasis: normalizeEmphasis(entry.emphasis),
        notes: typeof entry.notes === "string" ? entry.notes : "",
        stage: entry.stage ?? "Saved",
        appliedAt: details.appliedAt,
        followUpAt: details.followUpAt,
        contact: details.contact,
        source: details.source,
        // Free text, so anything that is not a string is dropped rather than rendered as "[object Object]".
        address: details.address,
        // The chase log is display data, but a stray non-date in it would render as
        // a blank row, so only real dates survive — deduped and bounded.
        followUpHistory: Array.isArray(entry.followUpHistory)
          ? [...new Set(entry.followUpHistory.filter(isIsoDate))].slice(-20)
          : undefined,
      };
    });
}

export function migrateVersions(raw: unknown): VersionSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (entry): entry is VersionSnapshot =>
        !!entry && typeof entry === "object" && "id" in entry && "resume" in entry,
    )
    .map((entry) => ({
      ...entry,
      emphasis: normalizeEmphasis(entry.emphasis),
      pinned: Boolean(entry.pinned),
      changes: Array.isArray(entry.changes) ? entry.changes : [],
      edits: entry.edits ?? {},
    }));
}

/* -------------------------------------------------------------------------- */
/* Typed convenience wrappers                                                 */
/* -------------------------------------------------------------------------- */

export const profileStore = {
  read: () => migrateProfile(readJson<unknown>(STORAGE_KEYS.profile, null)),
  write: (profile: MasterProfile) =>
    writeJson(STORAGE_KEYS.profile, { ...profile, updatedAt: new Date().toISOString() }),
  reset: () => {
    removeKey(STORAGE_KEYS.profile);
    return structuredClone(MASTER_PROFILE_SEED);
  },
};

export const draftStore = {
  read: () => migrateDraft(readJson<unknown>(STORAGE_KEYS.draft, null)),
  write: (draft: JobDraft) => writeJson(STORAGE_KEYS.draft, draft),
};

export const applicationStore = {
  read: () => migrateApplications(readJson<unknown>(STORAGE_KEYS.applications, [])),
  write: (applications: SavedApplication[]) => writeJson(STORAGE_KEYS.applications, applications),
};

export const historyStore = {
  read: () => migrateVersions(readJson<unknown>(STORAGE_KEYS.history, [])),
  write: (versions: VersionSnapshot[]) => writeJson(STORAGE_KEYS.history, versions),
};

/**
 * Reads the media store, dropping anything that is not an asset rather than the whole file.
 *
 * A store is the one thing a user cannot easily retype, so a single corrupt entry should cost
 * that entry, not the library. Images missing from IndexedDB still resolve to nothing, which
 * the resolver tolerates.
 */
export function migrateMediaLibrary(raw: unknown): MediaLibrary {
  const empty: MediaLibrary = {
    version: MEDIA_LIBRARY_VERSION,
    assets: [],
    updatedAt: new Date().toISOString(),
  };
  if (!raw || typeof raw !== "object") return empty;
  const candidate = raw as Partial<MediaLibrary>;
  if (!Array.isArray(candidate.assets)) return empty;

  const assets: MediaAsset[] = [];
  for (const value of candidate.assets) {
    if (!value || typeof value !== "object") continue;
    const asset = value as Partial<MediaAsset>;
    if (typeof asset.id !== "string" || typeof asset.kind !== "string") continue;
    assets.push({
      ...(asset as MediaAsset),
      images: Array.isArray(asset.images) ? asset.images : [],
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      createdAt: typeof asset.createdAt === "string" ? asset.createdAt : new Date().toISOString(),
    });
  }

  return {
    version: MEDIA_LIBRARY_VERSION,
    assets,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : empty.updatedAt,
  };
}

/**
 * Reads the portfolio document, or returns null when there is not one yet.
 *
 * Null rather than an empty document on purpose: "no portfolio" is a state the page has to be
 * able to show, with a button to start one, and inventing an empty document would hide it.
 */
export function migratePortfolio(raw: unknown): Portfolio | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<Portfolio>;
  if (!Array.isArray(candidate.projects)) return null;

  const defaults = createPortfolio();
  const pageSize: PortfolioPageSize =
    candidate.pageSize && candidate.pageSize in PAGE_SIZES ? candidate.pageSize : "letter";

  // Blocks are widened rather than validated field by field: the planner already tolerates a
  // block with no presentation and no assets, so the only thing worth enforcing here is that
  // `blocks` is a list.
  const projects = candidate.projects.map((project) => ({
    ...project,
    slides: (project.slides ?? []).map((slide) => ({
      ...slide,
      blocks: (slide.blocks ?? []).filter(Boolean) as PortfolioBlock[],
    })),
  }));

  return {
    ...defaults,
    ...candidate,
    id: typeof candidate.id === "string" ? candidate.id : defaults.id,
    title: typeof candidate.title === "string" && candidate.title ? candidate.title : defaults.title,
    pageSize,
    projects,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : defaults.updatedAt,
    transitions: candidate.transitions ?? defaults.transitions,
    annotate: candidate.annotate ?? defaults.annotate,
    navigable: candidate.navigable ?? defaults.navigable,
    // A look that is not one of the looks is no look at all, and "no look" is the default one.
    theme: cleanTheme(candidate.theme),
    // Same door for the contact block: recognised fields kept, a `javascript:` link dropped.
    contact: cleanContact(candidate.contact),
  };
}

export const portfolioStore = {
  read: () => migratePortfolio(readJson<unknown>(STORAGE_KEYS.portfolio, null)),
  write: (portfolio: Portfolio) =>
    writeJson(STORAGE_KEYS.portfolio, { ...portfolio, updatedAt: new Date().toISOString() }),
  clear: () => removeKey(STORAGE_KEYS.portfolio),
};

export const mediaLibraryStore = {
  read: () => migrateMediaLibrary(readJson<unknown>(STORAGE_KEYS.mediaLibrary, null)),
  write: (library: MediaLibrary) => writeJson(STORAGE_KEYS.mediaLibrary, library),
  clear: () => removeKey(STORAGE_KEYS.mediaLibrary),
};

export const mapStore = {
  read: () => migrateMapSettings(readJson<unknown>(STORAGE_KEYS.map, null)),
  write: (settings: MapSettings) => writeJson(STORAGE_KEYS.map, settings),
  clear: () => removeKey(STORAGE_KEYS.map),
};

export const geocodeStore = {
  read: () => migrateGeocodeCache(readJson<unknown>(STORAGE_KEYS.geocode, null)),
  write: (cache: GeocodeCache) => writeJson(STORAGE_KEYS.geocode, cache),
  clear: () => removeKey(STORAGE_KEYS.geocode),
};

/* -------------------------------------------------------------------------- */
/* JSON import / export                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Identifiers written into exported JSON. `vdc-career-matrix` is still accepted on
 * import so backups taken before the app was retitled keep working.
 */
export const BACKUP_APP_ID = "career-matrix";
const LEGACY_BACKUP_APP_IDS = ["vdc-career-matrix"];

export interface BackupBundle {
  app: string;
  version: number;
  exportedAt: string;
  profile: MasterProfile;
  draft: JobDraft;
  applications: SavedApplication[];
  /**
   * Added after the first release, so both are optional and an older backup still imports.
   * Image bytes stay out of the bundle — the pixels live in IndexedDB and can be re-imported,
   * and a JSON file carrying several phone photos would be useless to anyone.
   */
  portfolio?: Portfolio | null;
  mediaLibrary?: MediaLibrary;
}

export function buildBackup(): BackupBundle {
  return {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profileStore.read(),
    draft: draftStore.read(),
    applications: applicationStore.read(),
    portfolio: portfolioStore.read(),
    mediaLibrary: mediaLibraryStore.read(),
  };
}

export type ImportResult =
  | { ok: true; kind: "profile"; profile: MasterProfile }
  | { ok: true; kind: "bundle"; bundle: BackupBundle }
  | { ok: false; error: string };

/**
 * Accepts either a full backup bundle or a bare Master Profile object, so a
 * profile exported from /profile can be pasted straight back in.
 */
export function parseImport(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Expected a JSON object." };
  }
  const record = parsed as Record<string, unknown>;
  const appId = typeof record.app === "string" ? record.app : "";
  if ((appId === BACKUP_APP_ID || LEGACY_BACKUP_APP_IDS.includes(appId)) && record.profile) {
    const bundle = record as unknown as BackupBundle;
    return {
      ok: true,
      kind: "bundle",
      bundle: {
        ...bundle,
        profile: migrateProfile(bundle.profile),
        draft: migrateDraft(bundle.draft),
        applications: migrateApplications(bundle.applications),
        // A backup from before the portfolio existed simply has none, which reads as null.
        portfolio: migratePortfolio(bundle.portfolio),
        mediaLibrary: migrateMediaLibrary(bundle.mediaLibrary),
      },
    };
  }
  if (record.header || record.roles || record.skillGroups) {
    return { ok: true, kind: "profile", profile: migrateProfile(record) };
  }
  return {
    ok: false,
    error: "Unrecognised file. Expected an exported profile or a full backup.",
  };
}


