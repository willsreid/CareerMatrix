/**
 * The media and text store.
 *
 * The portfolio document says *what goes where*; this library says *what exists*. Keeping
 * them apart is what lets one photo appear in three projects, one metric be reused, and a
 * caption be improved once rather than retyped. It plays the same role the Master Profile
 * plays for the resume: a single source of truth the document is composed from.
 *
 * Only pixels are heavy, and those live in IndexedDB (`imageStore`) keyed by id. The library
 * holds metadata and text, so it stays small enough for `localStorage` alongside the rest of
 * the workspace.
 */

import type { PortfolioImageRef, PortfolioMetric } from "./portfolioTypes";

/**
 * What an asset can be.
 *
 * The clipboard — the panel you drag material from — deals in two of these, `image` and `text`: a picture, or
 * a piece of writing (see `CLIPBOARD_KINDS`). The rest exist because *documents* resolve them: a before/after
 * pair, a number, a link and a video poster are still read out of the store by `resolveBlock` for any section
 * that references them, and the fixtures build them. They are simply not things the clipboard makes.
 */
export type MediaAssetKind = "image" | "poster" | "pair" | "text" | "metric" | "link";

/**
 * What the clipboard holds, and the only two ways material gets in: an imported picture, or a snippet of
 * text.
 *
 * Deliberately short. The clipboard is meant to behave like one — you put something in it, you take it out —
 * so everything in it is something the author put there: an image they imported, or words they typed, pasted
 * or saved off a page. Nothing appears because the app thought it might be useful.
 */
export const CLIPBOARD_KINDS: MediaAssetKind[] = ["image", "text"];

export const MEDIA_KIND_LABELS: Record<MediaAssetKind, string> = {
  image: "Images",
  text: "Text modules",
  poster: "Video posters",
  pair: "Before / after pairs",
  metric: "Metrics",
  link: "Links",
};

/** Panel order, so the groups do not shuffle around as assets are added. */
export const MEDIA_KIND_ORDER: MediaAssetKind[] = [
  "image",
  "text",
  "pair",
  "poster",
  "metric",
  "link",
];

export interface MediaPair {
  beforeId: string;
  afterId: string;
  beforeLabel: string;
  afterLabel: string;
}

export interface MediaAsset {
  id: string;
  kind: MediaAssetKind;
  name: string;
  /** Free-text tags, matched case-insensitively. Used for filtering in the panel. */
  tags: string[];
  createdAt: string;
  /** The images: `image`, `poster`, and both halves of a `pair`. */
  images: PortfolioImageRef[];
  /** `text`. */
  text?: string;
  /**
   * A one-line description of this asset, typed in the store.
   *
   * Separate from `text` on purpose: `text` marks an asset *as* a piece of writing that template
   * slots fill from, whereas this annotates something else — the caption under a photograph in a
   * cards layout is the obvious use.
   */
  description?: string;
  /** `metric`. */
  metric?: PortfolioMetric;
  /** `link`, and where a `poster` sends a reader who wants the video. */
  link?: { url: string; label: string };
  /** `pair`, holding its halves by image id so a re-crop propagates to every use. */
  pair?: MediaPair;
  /**
   * Text and numbers that belong to this asset.
   *
   * This is what makes the media the anchor: a caption or a metric tied to a photograph travels
   * with it wherever it is placed, and keeps travelling if the section is moved, re-templated or
   * rebuilt. The tie is stored once, on the media, rather than repeated per placement.
   */
  companionIds?: string[];
}

export interface MediaLibrary {
  version: number;
  assets: MediaAsset[];
  updatedAt: string;
}

export const MEDIA_LIBRARY_VERSION = 1;

export function createMediaLibrary(): MediaLibrary {
  return { version: MEDIA_LIBRARY_VERSION, assets: [], updatedAt: new Date().toISOString() };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export function assetById(library: MediaLibrary, id: string): MediaAsset | undefined {
  return library.assets.find((asset) => asset.id === id);
}

export function assetsOfKind(library: MediaLibrary, kind: MediaAssetKind): MediaAsset[] {
  return library.assets.filter((asset) => asset.kind === kind);
}

/**
 * Resolves asset ids to the images they hold, skipping anything that has gone missing.
 *
 * A pair contributes its halves in before/after order, which is the order every pair
 * presentation expects, so the store decides the sequence rather than whichever order the
 * author happened to click in.
 */
export function imagesForAssets(library: MediaLibrary, ids: string[]): PortfolioImageRef[] {
  const references: PortfolioImageRef[] = [];
  for (const id of ids) {
    const asset = assetById(library, id);
    if (!asset) continue;
    if (asset.pair) {
      const before = asset.images.find((image) => image.id === asset.pair?.beforeId);
      const after = asset.images.find((image) => image.id === asset.pair?.afterId);
      if (before) references.push(before);
      if (after) references.push(after);
      continue;
    }
    references.push(...asset.images);
  }
  return references;
}

export function metricsForAssets(library: MediaLibrary, ids: string[]): PortfolioMetric[] {
  return ids
    .map((id) => assetById(library, id)?.metric)
    .filter((metric): metric is PortfolioMetric => Boolean(metric));
}

/** The first text found among the assets, used to fill a section's body. */
export function textForAssets(library: MediaLibrary, ids: string[]): string | undefined {
  for (const id of ids) {
    const text = assetById(library, id)?.text;
    if (text) return text;
  }
  return undefined;
}

export function linkForAssets(
  library: MediaLibrary,
  ids: string[],
): { url: string; label: string } | undefined {
  for (const id of ids) {
    const link = assetById(library, id)?.link;
    if (link) return link;
  }
  return undefined;
}

/**
 * Every image id the library knows about.
 *
 * Used for the storage summary and for sweeping orphans: an image in IndexedDB that no asset
 * mentions is taking up quota for nothing.
 */
export function libraryImageIds(library: MediaLibrary): string[] {
  return library.assets.flatMap((asset) => asset.images.map((image) => image.id));
}

export function libraryTags(library: MediaLibrary): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const asset of library.assets) {
    for (const tag of asset.tags) {
      const key = tag.trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface MediaFilter {
  kind?: MediaAssetKind | "all";
  tag?: string | null;
  query?: string;
}

/** Filtering for the panel: kind, then tag, then a free-text match on name, tags and text. */
export function filterAssets(library: MediaLibrary, filter: MediaFilter = {}): MediaAsset[] {
  const query = (filter.query ?? "").trim().toLowerCase();
  const tag = filter.tag?.trim().toLowerCase();

  return library.assets.filter((asset) => {
    if (filter.kind && filter.kind !== "all" && asset.kind !== filter.kind) return false;
    if (tag && !asset.tags.some((value) => value.trim().toLowerCase() === tag)) return false;
    if (!query) return true;
    const haystack = [
      asset.name,
      asset.text ?? "",
      asset.metric?.label ?? "",
      asset.metric?.value ?? "",
      ...asset.tags,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export interface LibraryStats {
  total: number;
  byKind: Record<MediaAssetKind, number>;
  images: number;
}

export function libraryStats(library: MediaLibrary): LibraryStats {
  const byKind: Record<MediaAssetKind, number> = {
    image: 0,
    poster: 0,
    pair: 0,
    text: 0,
    metric: 0,
    link: 0,
  };
  let images = 0;
  for (const asset of library.assets) {
    byKind[asset.kind] += 1;
    images += asset.images.length;
  }
  return { total: library.assets.length, byKind, images };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

function touch(library: MediaLibrary, assets: MediaAsset[]): MediaLibrary {
  return { ...library, assets, updatedAt: new Date().toISOString() };
}

/** Adds an asset, replacing any existing one with the same id so imports stay idempotent. */
export function addAsset(library: MediaLibrary, asset: MediaAsset): MediaLibrary {
  const existing = library.assets.findIndex((candidate) => candidate.id === asset.id);
  if (existing === -1) return touch(library, [asset, ...library.assets]);
  const assets = [...library.assets];
  assets[existing] = asset;
  return touch(library, assets);
}

export function updateAsset(
  library: MediaLibrary,
  id: string,
  patch: Partial<Omit<MediaAsset, "id">>,
): MediaLibrary {
  return touch(
    library,
    library.assets.map((asset) => (asset.id === id ? { ...asset, ...patch } : asset)),
  );
}

export function removeAsset(library: MediaLibrary, id: string): MediaLibrary {
  return touch(
    library,
    library.assets.filter((asset) => asset.id !== id),
  );
}

/**
 * Replaces an image everywhere it is used.
 *
 * Re-cropping or re-importing should not mean touching every section that shows the shot:
 * one edit in the store updates all of them, which is the whole reason content lives here
 * instead of inside the document.
 */
export function replaceImage(
  library: MediaLibrary,
  id: string,
  next: PortfolioImageRef,
): MediaLibrary {
  return touch(
    library,
    library.assets.map((asset) =>
      asset.images.some((image) => image.id === id)
        ? { ...asset, images: asset.images.map((image) => (image.id === id ? next : image)) }
        : asset,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

export function imageAsset(
  reference: PortfolioImageRef,
  options: { tags?: string[]; name?: string } = {},
): MediaAsset {
  return {
    id: reference.id,
    kind: "image",
    name: options.name ?? reference.name,
    tags: options.tags ?? [],
    createdAt: new Date().toISOString(),
    images: [reference],
  };
}

export function pairAsset(
  before: PortfolioImageRef,
  after: PortfolioImageRef,
  options: { name?: string; beforeLabel?: string; afterLabel?: string; tags?: string[] } = {},
): MediaAsset {
  return {
    id: `pair-${before.id}-${after.id}`,
    kind: "pair",
    name: options.name ?? `${before.name} → ${after.name}`,
    tags: options.tags ?? [],
    createdAt: new Date().toISOString(),
    images: [before, after],
    pair: {
      beforeId: before.id,
      afterId: after.id,
      beforeLabel: options.beforeLabel ?? "Before",
      afterLabel: options.afterLabel ?? "After",
    },
  };
}

export function textAsset(text: string, name: string, tags: string[] = []): MediaAsset {
  return {
    id: `text-${Math.random().toString(36).slice(2, 10)}`,
    kind: "text",
    name,
    tags,
    createdAt: new Date().toISOString(),
    images: [],
    text,
  };
}

export function metricAsset(metric: PortfolioMetric, tags: string[] = []): MediaAsset {
  return {
    id: `metric-${Math.random().toString(36).slice(2, 10)}`,
    kind: "metric",
    name: `${metric.value} ${metric.label}`,
    tags,
    createdAt: new Date().toISOString(),
    images: [],
    metric,
  };
}

export function linkAsset(link: { url: string; label: string }, tags: string[] = []): MediaAsset {
  return {
    id: `link-${Math.random().toString(36).slice(2, 10)}`,
    kind: "link",
    name: link.label || link.url,
    tags,
    createdAt: new Date().toISOString(),
    images: [],
    link,
  };
}

export function posterAsset(
  reference: PortfolioImageRef,
  link: { url: string; label: string },
  options: { tags?: string[]; name?: string } = {},
): MediaAsset {
  return {
    id: `poster-${reference.id}`,
    kind: "poster",
    name: options.name ?? reference.name,
    tags: options.tags ?? [],
    createdAt: new Date().toISOString(),
    images: [reference],
    link,
  };
}

/**
 * Seeds the store from the Master Profile, so a new portfolio starts from work that already
 * exists rather than an empty shelf.
 *
 * Text comes across because the profile already holds it. Images cannot: the profile stores
 * no pixels, so they are imported deliberately and tagged where they belong.
 */
export function seedFromProfile(projects: {
  name: string;
  summary?: string;
  bullets?: string[];
}[]): MediaAsset[] {
  const assets: MediaAsset[] = [];
  for (const project of projects) {
    const tag = project.name.trim().toLowerCase();
    const tags = tag ? [tag] : [];
    if (project.summary?.trim()) {
      assets.push(textAsset(project.summary.trim(), `${project.name} — summary`, tags));
    }
    for (const bullet of project.bullets ?? []) {
      const text = bullet.trim();
      if (text) assets.push(textAsset(text, `${project.name} — detail`, tags));
    }
  }
  return assets;
}

/* -------------------------------------------------------------------------- */
/* Companions: text and numbers tied to a piece of media                      */
/* -------------------------------------------------------------------------- */

export function companionsOf(library: MediaLibrary, assetId: string): MediaAsset[] {
  const host = assetById(library, assetId);
  if (!host?.companionIds?.length) return [];
  return host.companionIds
    .map((id) => assetById(library, id))
    .filter((asset): asset is MediaAsset => Boolean(asset));
}

/**
 * Expands a set of placed assets with whatever is tied to them.
 *
 * Resolution runs through this, so a section that holds a photograph automatically holds the
 * caption and metric that belong to it. Companions are deduplicated: a photograph placed in three
 * sections brings its caption to all three, once each.
 */
export function expandWithCompanions(library: MediaLibrary, ids: string[]): string[] {
  const expanded: string[] = [];
  for (const id of ids) {
    expanded.push(id);
    for (const companion of companionsOf(library, id)) expanded.push(companion.id);
  }
  return [...new Set(expanded)];
}

/** Ties a caption or metric to a piece of media. Idempotent, so repeat clicks are harmless. */
export function tieCompanion(library: MediaLibrary, hostId: string, companionId: string): MediaLibrary {
  if (hostId === companionId) return library;
  const host = assetById(library, hostId);
  if (!host) return library;
  const existing = host.companionIds ?? [];
  if (existing.includes(companionId)) return library;
  return updateAsset(library, hostId, { companionIds: [...existing, companionId] });
}

export function untieCompanion(library: MediaLibrary, hostId: string, companionId: string): MediaLibrary {
  const host = assetById(library, hostId);
  if (!host?.companionIds) return library;
  return updateAsset(library, hostId, {
    companionIds: host.companionIds.filter((id) => id !== companionId),
  });
}

/** What a piece of media is tied to, for the panel: the reverse of `companionsOf`. */
export function hostOfCompanion(library: MediaLibrary, companionId: string): MediaAsset | undefined {
  return library.assets.find((asset) => asset.companionIds?.includes(companionId));
}

/**
 * The line that belongs under a photograph, from wherever it was written.
 *
 * In order of specificity: text tied to the image, then the image's own description, then a caption
 * set on the image reference itself. The first is what "attach text to image" produces, the second
 * is the one-line field in the store, and both are things the user typed about *this* frame.
 */
export function descriptionForImage(
  library: MediaLibrary,
  imageId: string,
): string | undefined {
  const tied = textForAssets(library, expandWithCompanions(library, [imageId]));
  if (tied) return tied;
  const asset = assetById(library, imageId);
  if (!asset) return undefined;
  return asset.description ?? asset.images.find((image) => image.id === imageId)?.caption;
}

/** Removes a deleted asset from the ties that pointed at it, so nothing dangles. */
export function dropTiesTo(library: MediaLibrary, assetId: string): MediaLibrary {
  let next = library;
  for (const asset of library.assets) {
    if (asset.companionIds?.includes(assetId)) next = untieCompanion(next, asset.id, assetId);
  }
  return next;
}
