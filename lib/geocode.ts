/**
 * Where a place is, when the book of places cannot say.
 *
 * The gazetteer in `lib/geo.ts` covers the cities a posting is likely to name, which is most of the time and
 * needs no network at all. The rest of the time the author knows exactly where they are applying — a ZIP
 * code, a street address, a suburb the book has never heard of — and guessing is not an option: a dot in the
 * wrong county is worse than no dot.
 *
 * So there is one lookup, and using it is the author's decision. A ZIP code or an address typed into the
 * map's centre field, or into a row's "not on the map" field, asks OpenStreetMap's Nominatim where it is. The
 * answer is cached in its own storage key and works with the network off from then on. Nothing about an
 * *application* is ever sent: the query is the place the author typed, and the pins are drawn on this machine.
 */

import { formatLatLng, locatePlace, parseLatLng, type GeoPoint } from "@/lib/geo";

/** Where a lookup says a place is, and what it called it. */
export interface GeocodeHit {
  /** The query, normalised: what the cache is keyed by. */
  query: string;
  /** What to show on the row: "97201, Southwest Hills, Portland". */
  label: string;
  point: GeoPoint;
  kind: GeocodeKind;
  /** When it was found, so the cache knows what to forget first. */
  at: number;
}

/** How a place was placed: typed by hand, known to the book, or looked up — and looked up as what. */
export type GeocodeKind = "coordinates" | "place" | "postcode" | "address";

export type GeocodeCache = Record<string, GeocodeHit>;

export const GEOCODE_KINDS: GeocodeKind[] = ["coordinates", "place", "postcode", "address"];

/** Nominatim, the lookup behind OpenStreetMap. No key, no account, and a policy worth respecting. */
export const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";
/** The service asks to be told who is calling. A personal, low-volume app can answer that honestly. */
export const GEOCODE_CONTACT = "vdc-career-matrix/1.0 (personal job-application map)";
/** One request a second is the rule; a beat more than that is politeness, not slowness. */
export const NOMINATIM_SPACING_MS = 1100;
/** Small on purpose: this is a person's own places, not a gazetteer. */
export const GEOCODE_CACHE_LIMIT = 200;

/** The query as a cache key: case and spacing do not make a different place. */
export function geocodeKey(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A ZIP code, with or without its +4. */
export function looksLikePostcode(text: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(text.trim());
}

/** What the lookup calls a street: enough of a hint to label it, and no more. */
const ADDRESS_TYPES = /house|building|road|street|residential|commercial|industrial|retail|amenity|shop/;

/**
 * Nominatim's answer, narrowed to the two things the map needs: a point and something to call it.
 *
 * Pure and separate from the request, so the parsing can be tested without a network — which is the only kind
 * of test of it that keeps passing.
 */
export function parseNominatim(
  payload: unknown,
): { label: string; point: GeoPoint; kind: GeocodeKind } | null {
  const first = Array.isArray(payload) ? (payload[0] as Record<string, unknown> | undefined) : undefined;
  if (!first) return null;
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const display = typeof first.display_name === "string" ? first.display_name : "";
  const type = [first.addresstype, first.type].find((value) => typeof value === "string") as
    | string
    | undefined;
  const kind: GeocodeKind =
    type === "postcode" ? "postcode" : ADDRESS_TYPES.test(type ?? "") ? "address" : "place";
  // "97201, Southwest Hills, Portland, Multnomah County, Oregon, United States" is a mouthful. The first three
  // parts are the ones a person reads; the rest is what a mailing label wants.
  const label = display.split(",").slice(0, 3).join(",").trim() || display;
  return { label, point: { lat, lng }, kind };
}

/** Reads a stored cache, dropping anything that is not a point. */
export function migrateGeocodeCache(raw: unknown): GeocodeCache {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const cache: GeocodeCache = {};
  for (const [key, entry] of Object.entries(value)) {
    const candidate = (entry ?? {}) as Partial<GeocodeHit>;
    const point = (candidate.point ?? {}) as Partial<GeoPoint>;
    const lat = Number(point.lat);
    const lng = Number(point.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    cache[key] = {
      query: typeof candidate.query === "string" ? candidate.query : key,
      label: typeof candidate.label === "string" ? candidate.label : key,
      point: { lat, lng },
      kind: GEOCODE_KINDS.includes(candidate.kind as GeocodeKind)
        ? (candidate.kind as GeocodeKind)
        : "place",
      at: Number.isFinite(Number(candidate.at)) ? Number(candidate.at) : 0,
    };
  }
  return cache;
}

/** Adds a hit, forgetting the least recently found one when the cache is full. */
export function rememberGeocode(cache: GeocodeCache, hit: GeocodeHit): GeocodeCache {
  const query = geocodeKey(hit.query);
  const next: GeocodeCache = { ...cache, [query]: { ...hit, query } };
  const entries = Object.entries(next);
  if (entries.length <= GEOCODE_CACHE_LIMIT) return next;
  entries.sort((left, right) => left[1].at - right[1].at);
  return Object.fromEntries(entries.slice(entries.length - GEOCODE_CACHE_LIMIT)) as GeocodeCache;
}

/**
 * Places the map can answer for itself, in the order that keeps the network out of the common case.
 *
 * Coordinates first (exact, instant), then the book of places (instant, offline). Everything else — a ZIP
 * code, an address, a suburb the book has never heard of — is a question for the lookup and its cache.
 */
export function localAnswer(text: string): GeocodeHit | null {
  const query = geocodeKey(text);
  if (!query) return null;
  const typed = parseLatLng(text);
  if (typed) {
    return { query, label: formatLatLng(typed), point: typed, kind: "coordinates", at: Date.now() };
  }
  const book = locatePlace(text);
  if (book) return { query, label: book.label, point: book.point, kind: "place", at: Date.now() };
  return null;
}

/** One outbound lookup at a time, a beat apart: the service asks for it, and this app never needs otherwise. */
let queue: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

export function queuedLookup<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + NOMINATIM_SPACING_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCallAt = Date.now();
    return work();
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Asks the lookup service, and hands back only what the map can use. */
export async function searchNominatim(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ label: string; point: GeoPoint; kind: GeocodeKind } | null> {
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1" });
  const answer = await fetchImpl(`${NOMINATIM_SEARCH}?${params.toString()}`, {
    headers: { "User-Agent": GEOCODE_CONTACT, Accept: "application/json" },
  });
  if (!answer.ok) return null;
  return parseNominatim(await answer.json());
}

