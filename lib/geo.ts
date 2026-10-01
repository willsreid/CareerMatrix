/**
 * Where things are.
 *
 * The calendar knows each application's `location` — the line the posting parser read off the ad, "Portland,
 * OR" or "Hillsboro, OR (Hybrid)" — and its work mode. This module turns those words into points on a map:
 * a gazetteer of places, the great-circle maths to say how far apart two of them are, and a projection that
 * suits a *local* map (a thirty-mile radius, not a continent).
 *
 * **The map is a real one, and it is drawn locally.** The tiles come from OpenStreetMap — the one imagery
 * source that needs no key and no account — so the *area you are looking at* is visible to a tile server,
 * exactly as it would be in any browser map. What never goes anywhere is your applications: the pins are
 * drawn on this machine from `location` lines that are already here, and no request contains a company name.
 * Tiles can be switched off, and the section still works: that is what the projections below are for.
 *
 * The gazetteer is deliberately small and honest about itself. City coordinates are a city's own centre, to
 * about a mile; when only a state is recognised the point is the state's centre and the distance is a rough
 * one, which `PlaceFix.precision` says out loud so the map can label it. A name the book does not know is not
 * guessed at: coordinates typed by hand (`parseLatLng`) always win, and anything else can be looked up by ZIP
 * code or address through `lib/geocode.ts`.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Mean earth radius in statute miles. */
const EARTH_MILES = 3958.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/**
 * Miles between two points, along the surface.
 *
 * A haversine rather than the flat-earth approximation: at thirty miles the difference is a few feet, but the
 * same function is used for cross-country distances in the list ("1,700 mi away"), where it is not.
 */
export function milesBetween(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The eight-point compass direction from one place to another, for "12 mi NW". */
export function compassBetween(from: GeoPoint, to: GeoPoint): string {
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (toDegrees(Math.atan2(y, x)) + 360) % 360;
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(bearing / 45) % 8];
}

/** "12 mi NW", "0.4 mi E", "1,720 mi SW" — the sort of line a map label wants. */
export function describeTrip(from: GeoPoint, to: GeoPoint): string {
  const miles = milesBetween(from, to);
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  const shown = rounded >= 1000 ? rounded.toLocaleString("en-US") : String(rounded);
  return `${shown} mi ${compassBetween(from, to)}`;
}

/**
 * Reads "45.5152, -122.6784" — or with a space, a degree sign, or a hemisphere letter — as a point.
 *
 * Here for the one case the gazetteer cannot serve: a site three miles outside a town it has never heard of,
 * where typing the coordinates off a phone is a minute's work and guessing would put a dot in the wrong
 * county.
 */
export function parseLatLng(text: string): GeoPoint | null {
  const parts = text
    .trim()
    .replace(/°/g, " ")
    .split(/[,\s]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  /** A hemisphere letter is a sign, not decoration: "45.5 S" is not "45.5, 0". */
  const signed = (token: string, positive: RegExp, negative: RegExp) => {
    const value = Number(token.replace(/[NSEWnsew]/g, ""));
    if (!Number.isFinite(value)) return NaN;
    if (negative.test(token)) return -Math.abs(value);
    if (positive.test(token)) return Math.abs(value);
    return value;
  };
  const lat = signed(parts[0], /N/, /S/);
  const lng = signed(parts[1], /E/, /W/);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** "45.5152, -122.6784" — what to show in the field once a point is stored. */
export function formatLatLng(point: GeoPoint): string {
  return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
}

/* -------------------------------------------------------------------------- */
/* Web Mercator, for a map you can drag                                       */
/* -------------------------------------------------------------------------- */

/**
 * The projection tiles are cut in, and therefore the one a map you can pan has to be drawn in.
 *
 * The projection in the second half of this file is the one a tile map needs: it answers "which pixels of the
 * world am I looking at", so a person can drag the map, zoom it, and see a pin *where the pin actually is*
 * rather than at a fraction of some fixed frame.
 *
 * Mercator is conformal: a small circle stays a circle, so a ring sized by `pixelsForMiles` is honest at any
 * zoom — which is the whole reason the ring can be trusted next to real roads.
 */

/** Tiles are 256px squares, in every server that matters. */
export const TILE_SIZE = 256;
/** Mercator runs to infinity at the poles; this is the latitude at which the world becomes square. */
export const MERCATOR_MAX_LAT = 85.05112878;
/** How far out and in the map goes: a continent at 3, a city block at 18. */
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

/** A view: the point in the middle of the frame, and how far in. */
export interface MapView {
  lat: number;
  lng: number;
  zoom: number;
}

export function clampLat(lat: number): number {
  return Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
}

/** Longitude is a circle: past the date line the world starts again rather than stopping. */
export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Whole numbers only: tiles are cut per level, and a half level means blurry tiles for no gain. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));
}

/** The world in pixels at a zoom: one 256px tile at 0, doubling every level. */
export function worldSize(zoom: number): number {
  return TILE_SIZE * 2 ** clampZoom(zoom);
}

/** A point as pixels in the world at that zoom: x east from −180°, y south from the top. */
export function projectMercator(point: GeoPoint, zoom: number): { x: number; y: number } {
  const size = worldSize(zoom);
  const sin = Math.sin(toRadians(clampLat(point.lat)));
  return {
    x: ((wrapLng(point.lng) + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size,
  };
}

/** The inverse, for turning a drag back into a place. */
export function unprojectMercator(pixel: { x: number; y: number }, zoom: number): GeoPoint {
  const size = worldSize(zoom);
  const n = Math.PI - (2 * Math.PI * pixel.y) / size;
  return {
    lat: clampLat(toDegrees(Math.atan(Math.sinh(n)))),
    lng: wrapLng((pixel.x / size) * 360 - 180),
  };
}

/**
 * How much ground a pixel covers, in miles.
 *
 * The cosine is Mercator's doing: the projection stretches longitude as it goes north, so a pixel at Portland
 * covers less ground than the same pixel at the equator — which is exactly why the radius ring is sized at
 * the *base's* latitude and not at the equator's.
 */
export function milesPerPixel(lat: number, zoom: number): number {
  const circumference = 2 * Math.PI * EARTH_MILES;
  return (circumference * Math.cos(toRadians(clampLat(lat)))) / worldSize(zoom);
}

/** The pixels a distance is worth on screen — the radius ring's radius. */
export function pixelsForMiles(miles: number, lat: number, zoom: number): number {
  return miles / milesPerPixel(lat, zoom);
}

/** Where a point falls inside a frame, in CSS pixels from its top-left corner. */
export function projectIntoView(
  point: GeoPoint,
  view: MapView,
  width: number,
  height: number,
): { x: number; y: number; zoom: number } {
  const zoom = clampZoom(view.zoom);
  const size = worldSize(zoom);
  const centre = projectMercator({ lat: view.lat, lng: view.lng }, zoom);
  const raw = projectMercator(point, zoom);
  // The world repeats every 360°: take the copy nearest the middle of the frame, so a pin near the date line
  // lands on the right side of it.
  let x = raw.x;
  while (x - centre.x > size / 2) x -= size;
  while (centre.x - x > size / 2) x += size;
  return { x: x - (centre.x - width / 2), y: raw.y - (centre.y - height / 2), zoom };
}

/** One tile of imagery, and where it goes. */
export interface PlacedTile {
  /** "z/x/y" — stable, and shared when the world wraps around. */
  key: string;
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
}

/** Every tile that covers the frame, with its top-left corner relative to it. */
export function tilesForView(
  view: MapView,
  width: number,
  height: number,
): { zoom: number; tiles: PlacedTile[] } {
  const zoom = clampZoom(view.zoom);
  const count = 2 ** zoom;
  const centre = projectMercator({ lat: view.lat, lng: view.lng }, zoom);
  const originX = centre.x - width / 2;
  const originY = centre.y - height / 2;
  const tiles: PlacedTile[] = [];
  for (
    let y = Math.max(0, Math.floor(originY / TILE_SIZE));
    y <= Math.min(count - 1, Math.floor((originY + height) / TILE_SIZE));
    y += 1
  ) {
    for (let x = Math.floor(originX / TILE_SIZE); x <= Math.floor((originX + width) / TILE_SIZE); x += 1) {
      tiles.push({
        key: `${zoom}/${((x % count) + count) % count}/${y}`,
        z: zoom,
        x: ((x % count) + count) % count,
        y,
        left: x * TILE_SIZE - originX,
        top: y * TILE_SIZE - originY,
      });
    }
  }
  return { zoom, tiles };
}

/** The spread of a set of points in pixels at a zoom, measured around their own middle. */
function spreadIn(centre: GeoPoint, points: GeoPoint[], zoom: number): { width: number; height: number } {
  const size = worldSize(zoom);
  const origin = projectMercator(centre, zoom);
  const xs = points.map((point) => {
    let x = projectMercator(point, zoom).x;
    while (x - origin.x > size / 2) x -= size;
    while (origin.x - x > size / 2) x += size;
    return x;
  });
  const ys = points.map((point) => projectMercator(point, zoom).y);
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/**
 * A view that holds every point, for the "all of them" button.
 *
 * The zoom is found by asking the projection directly at each level rather than by a formula, which costs
 * nothing at sixteen levels and cannot be subtly wrong at a latitude the formula forgot about. Longitudes are
 * unwrapped around the first point first, so two pins either side of the date line do not drag the frame the
 * whole way round the world to hold them.
 */
export function viewToFit(points: GeoPoint[], width: number, height: number, padding = 56): MapView | null {
  if (!points.length) return null;
  const usable = { width: Math.max(40, width - padding), height: Math.max(40, height - padding) };
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => {
    let lng = point.lng;
    while (lng - points[0].lng > 180) lng -= 360;
    while (points[0].lng - lng > 180) lng += 360;
    return lng;
  });
  const centre: GeoPoint = {
    lat: clampLat((Math.max(...lats) + Math.min(...lats)) / 2),
    lng: wrapLng((Math.max(...lngs) + Math.min(...lngs)) / 2),
  };
  let best = MIN_ZOOM;
  for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += 1) {
    const spread = spreadIn(centre, points, zoom);
    if (spread.width <= usable.width && spread.height <= usable.height) best = zoom;
    else break;
  }
  // Everything in one block fits at any zoom, and eighteen is one house: twelve is the neighbourhood, which
  // is the real answer to "which part of town is this?".
  if (best === MAX_ZOOM) best = 12;
  return { lat: centre.lat, lng: centre.lng, zoom: best };
}

/** The closest zoom at which a circle of this radius still fits the frame. */
export function zoomForRadius(
  radiusMiles: number,
  lat: number,
  width: number,
  height: number,
  padding = 48,
): number {
  const usable = Math.max(60, Math.min(width, height) - padding);
  let best = MIN_ZOOM;
  for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += 1) {
    if (pixelsForMiles(radiusMiles * 2, lat, zoom) <= usable) best = zoom;
    else break;
  }
  return best;
}

/** An imagery server's URL with its placeholders filled in. */
export function fillTileUrl(template: string, z: number, x: number, y: number): string {
  const subdomains = ["a", "b", "c"];
  return template
    .replace(/\{s\}/g, subdomains[(x + y) % subdomains.length])
    .replace(/\{z\}/g, String(z))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y));
}

/** The default imagery: OpenStreetMap's own tiles, which need no key and no account. */
export const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** ODbL requires the credit to travel with the tiles. */
export const TILE_ATTRIBUTION = {
  text: "© OpenStreetMap contributors",
  href: "https://www.openstreetmap.org/copyright",
};

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export interface MapSettings {
  /**
   * Where the map is centred: the place you would work from. Whatever the author typed — "Portland, OR",
   * "Hillsboro", "97201", "45.5152, -122.6784" — kept as words, because that is what they will edit.
   */
  base: string;
  /** What those words resolved to, remembered so the map draws before any lookup has a chance to answer. */
  basePoint: GeoPoint | null;
  /** How far out to show, in miles. */
  radiusMiles: number;
  /** Real imagery from a tile server. Off means the drawn rings, which need no network at all. */
  tiles: boolean;
  /** Where the map was left: a pan or zoom the author made. Null means "centre on the base, sized to the radius". */
  view: MapView | null;
}

export const RADIUS_CHOICES = [10, 30, 50, 100, 250, 500];

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  base: "",
  basePoint: null,
  radiusMiles: 30,
  tiles: true,
  view: null,
};

/** A stored point, if it is one: a bad memory is worse than none. */
function storedPoint(raw: unknown): GeoPoint | null {
  const value = (raw ?? {}) as Partial<GeoPoint>;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** A stored view, if it is one. */
export function migrateMapView(raw: unknown): MapView | null {
  const value = (raw ?? {}) as Partial<MapView>;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const zoom = Number(value.zoom);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(zoom)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: clampLat(lat), lng: wrapLng(lng), zoom: clampZoom(zoom) };
}

/**
 * Reads whatever was stored, with the defaults for anything missing or silly.
 *
 * This also carries the *old* shape — `{ base, radiusMiles }`, from before the map had imagery and a view to
 * remember — because a settings record is the one thing in this app that outlives a release.
 */
export function migrateMapSettings(raw: unknown): MapSettings {
  const value = (raw ?? {}) as Partial<MapSettings>;
  const radius = Number(value.radiusMiles);
  return {
    base: typeof value.base === "string" ? value.base : "",
    basePoint: storedPoint(value.basePoint),
    radiusMiles:
      Number.isFinite(radius) && radius > 0 && radius <= 2000
        ? radius
        : DEFAULT_MAP_SETTINGS.radiusMiles,
    // Absent means yes: the whole point of the section is the real map, and the switch is one click away.
    tiles: value.tiles !== false,
    view: migrateMapView(value.view),
  };
}


/* -------------------------------------------------------------------------- */
/* The gazetteer                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A state's centre, for the times a posting says only "Oregon" or "OR".
 *
 * Enough to say which part of the country a job is in and how far away it is to the nearest hundred miles,
 * which is the honest answer to "where?". `precision: "state"` is what stops the map pretending otherwise.
 */
const STATE_POINTS: Record<string, GeoPoint> = {
  AL: { lat: 32.8, lng: -86.8 },
  AK: { lat: 64.2, lng: -149.5 },
  AZ: { lat: 34.3, lng: -111.7 },
  AR: { lat: 34.9, lng: -92.4 },
  CA: { lat: 37.2, lng: -119.3 },
  CO: { lat: 39.0, lng: -105.5 },
  CT: { lat: 41.6, lng: -72.7 },
  DE: { lat: 39.0, lng: -75.5 },
  DC: { lat: 38.9, lng: -77.0 },
  FL: { lat: 28.6, lng: -82.4 },
  GA: { lat: 32.6, lng: -83.4 },
  HI: { lat: 20.3, lng: -156.4 },
  ID: { lat: 44.4, lng: -114.6 },
  IL: { lat: 40.0, lng: -89.2 },
  IN: { lat: 39.9, lng: -86.3 },
  IA: { lat: 42.1, lng: -93.5 },
  KS: { lat: 38.5, lng: -98.4 },
  KY: { lat: 37.5, lng: -85.3 },
  LA: { lat: 31.1, lng: -92.0 },
  ME: { lat: 45.4, lng: -69.2 },
  MD: { lat: 39.0, lng: -76.8 },
  MA: { lat: 42.3, lng: -71.8 },
  MI: { lat: 44.3, lng: -85.4 },
  MN: { lat: 46.3, lng: -94.3 },
  MS: { lat: 32.7, lng: -89.7 },
  MO: { lat: 38.4, lng: -92.5 },
  MT: { lat: 47.0, lng: -109.6 },
  NE: { lat: 41.5, lng: -99.8 },
  NV: { lat: 39.3, lng: -116.6 },
  NH: { lat: 43.7, lng: -71.6 },
  NJ: { lat: 40.2, lng: -74.7 },
  NM: { lat: 34.4, lng: -106.1 },
  NY: { lat: 42.9, lng: -75.5 },
  NC: { lat: 35.5, lng: -79.4 },
  ND: { lat: 47.4, lng: -100.5 },
  OH: { lat: 40.3, lng: -82.8 },
  OK: { lat: 35.6, lng: -97.5 },
  OR: { lat: 43.9, lng: -120.6 },
  PA: { lat: 40.9, lng: -77.8 },
  RI: { lat: 41.7, lng: -71.6 },
  SC: { lat: 33.9, lng: -80.9 },
  SD: { lat: 44.4, lng: -100.2 },
  TN: { lat: 35.9, lng: -86.4 },
  TX: { lat: 31.5, lng: -99.3 },
  UT: { lat: 39.3, lng: -111.7 },
  VT: { lat: 44.1, lng: -72.7 },
  VA: { lat: 37.5, lng: -78.9 },
  WA: { lat: 47.4, lng: -120.5 },
  WV: { lat: 38.6, lng: -80.6 },
  WI: { lat: 44.6, lng: -89.7 },
  WY: { lat: 43.0, lng: -107.6 },
};

/** Spelled-out state names, so "Hillsboro, Oregon" places as well as "Hillsboro, OR". */
const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};


/** [city, state, lat, lng, `true` when a bare city name should mean this one]. */
type CityRow = [string, string, number, number, true?];

/**
 * The cities the map knows, in more detail near home than far away.
 *
 * Ordered by usefulness rather than alphabetically: the Pacific Northwest first, because a thirty-mile circle
 * around Portland is the question this map exists to answer, then the metros a US applicant is most likely to
 * see in a posting. Every coordinate is the city's own centre to about a mile — close enough that a dot inside
 * or outside a thirty-mile ring is really inside or outside it, which is the only claim being made.
 */
const CITY_POINTS: CityRow[] = [
  // Oregon and Washington — the home market.
  ["Portland", "OR", 45.5152, -122.6784, true],
  ["Beaverton", "OR", 45.4871, -122.8037],
  ["Hillsboro", "OR", 45.5229, -122.9898],
  ["Tigard", "OR", 45.4312, -122.7715],
  ["Lake Oswego", "OR", 45.4207, -122.6706],
  ["Tualatin", "OR", 45.3842, -122.7637],
  ["Wilsonville", "OR", 45.2998, -122.7737],
  ["Gresham", "OR", 45.5001, -122.4302],
  ["Oregon City", "OR", 45.3573, -122.6068],
  ["Milwaukie", "OR", 45.4462, -122.6393],
  ["Clackamas", "OR", 45.4076, -122.5704],
  ["Troutdale", "OR", 45.5393, -122.3872],
  ["Forest Grove", "OR", 45.5198, -123.1107],
  ["McMinnville", "OR", 45.2101, -123.1987],
  ["Salem", "OR", 44.9429, -123.0351, true],
  ["Albany", "OR", 44.6365, -123.1059],
  ["Corvallis", "OR", 44.5646, -123.262],
  ["Eugene", "OR", 44.0521, -123.0868],
  ["Springfield", "OR", 44.0462, -123.022],
  ["Bend", "OR", 44.0582, -121.3153],
  ["Redmond", "OR", 44.2726, -121.1739],
  ["Medford", "OR", 42.3265, -122.8756],
  ["Grants Pass", "OR", 42.439, -123.3284],
  ["Roseburg", "OR", 43.2165, -123.3417],
  ["Klamath Falls", "OR", 42.2249, -121.7817],
  ["The Dalles", "OR", 45.5946, -121.1787],
  ["Hood River", "OR", 45.7054, -121.5215],
  ["Pendleton", "OR", 45.6721, -118.7886],
  ["Astoria", "OR", 46.1879, -123.8313],
  ["Newport", "OR", 44.6368, -124.0535],
  ["Coos Bay", "OR", 43.3665, -124.2179],
  ["Vancouver", "WA", 45.6387, -122.6615, true],
  ["Camas", "WA", 45.5871, -122.3995],
  ["Washougal", "WA", 45.5826, -122.3534],
  ["Longview", "WA", 46.1382, -122.9382],
  ["Kelso", "WA", 46.1468, -122.9084],
  ["Seattle", "WA", 47.6062, -122.3321, true],
  ["Bellevue", "WA", 47.6101, -122.2015],
  ["Redmond", "WA", 47.674, -122.1215],
  ["Kirkland", "WA", 47.6769, -122.206],
  ["Bothell", "WA", 47.7601, -122.2054],
  ["Renton", "WA", 47.4829, -122.2171],
  ["Auburn", "WA", 47.3073, -122.2285],
  ["Federal Way", "WA", 47.3223, -122.3126],
  ["Tacoma", "WA", 47.2529, -122.4443],
  ["Puyallup", "WA", 47.1854, -122.2929],
  ["Olympia", "WA", 47.0379, -122.9007],
  ["Everett", "WA", 47.979, -122.2021],
  ["Marysville", "WA", 48.0518, -122.1771],
  ["Bellingham", "WA", 48.7519, -122.4787],
  ["Bremerton", "WA", 47.5673, -122.6329],
  ["Spokane", "WA", 47.6588, -117.426],
  ["Spokane Valley", "WA", 47.6732, -117.2394],
  ["Richland", "WA", 46.2857, -119.2845],
  ["Kennewick", "WA", 46.2112, -119.1372],
  ["Pasco", "WA", 46.2396, -119.1006],
  ["Yakima", "WA", 46.6021, -120.5059],
  ["Wenatchee", "WA", 47.4235, -120.3103],
  ["Boise", "ID", 43.615, -116.2023, true],
  ["Meridian", "ID", 43.6121, -116.3915],
  ["Nampa", "ID", 43.5407, -116.5635],
  ["Idaho Falls", "ID", 43.4917, -112.0341],
  ["Coeur d'Alene", "ID", 47.6777, -116.7805],

  // The metros a US posting is most likely to name: every one of these is the anchor city of its market.
  ["Sacramento", "CA", 38.5816, -121.4944],
  ["San Francisco", "CA", 37.7749, -122.4194, true],
  ["Oakland", "CA", 37.8044, -122.2712],
  ["San Jose", "CA", 37.3382, -121.8863],
  ["Fresno", "CA", 36.7378, -119.7871],
  ["Bakersfield", "CA", 35.3733, -119.0187],
  ["Los Angeles", "CA", 34.0522, -118.2437, true],
  ["Long Beach", "CA", 33.7701, -118.1937],
  ["Anaheim", "CA", 33.8366, -117.9143],
  ["Irvine", "CA", 33.6846, -117.8265],
  ["Riverside", "CA", 33.9806, -117.3755],
  ["San Bernardino", "CA", 34.1083, -117.2898],
  ["San Diego", "CA", 32.7157, -117.1611],
  ["Las Vegas", "NV", 36.1699, -115.1398, true],
  ["Reno", "NV", 39.5296, -119.8138],
  ["Phoenix", "AZ", 33.4484, -112.074, true],
  ["Tempe", "AZ", 33.4255, -111.94],
  ["Mesa", "AZ", 33.4152, -111.8315],
  ["Tucson", "AZ", 32.2226, -110.9747],
  ["Salt Lake City", "UT", 40.7608, -111.891, true],
  ["Provo", "UT", 40.2338, -111.6585],
  ["Denver", "CO", 39.7392, -104.9903, true],
  ["Boulder", "CO", 40.015, -105.2705],
  ["Colorado Springs", "CO", 38.8339, -104.8214],
  ["Fort Collins", "CO", 40.5853, -105.0844],
  ["Albuquerque", "NM", 35.0844, -106.6504],
  ["Dallas", "TX", 32.7767, -96.797, true],
  ["Fort Worth", "TX", 32.7555, -97.3308],
  ["Arlington", "TX", 32.7357, -97.1081],
  ["Austin", "TX", 30.2672, -97.7431],
  ["San Antonio", "TX", 29.4241, -98.4936],
  ["Houston", "TX", 29.7604, -95.3698],
  ["El Paso", "TX", 31.7619, -106.485],
  ["Oklahoma City", "OK", 35.4676, -97.5164],
  ["Tulsa", "OK", 36.154, -95.9928],
  ["Kansas City", "MO", 39.0997, -94.5786, true],
  ["St. Louis", "MO", 38.627, -90.1994],
  ["Springfield", "MO", 37.2089, -93.2923],
  ["Omaha", "NE", 41.2565, -95.9345],
  ["Lincoln", "NE", 40.8136, -96.7026],
  ["Des Moines", "IA", 41.5868, -93.625],
  ["Cedar Rapids", "IA", 41.9779, -91.6656],
  ["Minneapolis", "MN", 44.9778, -93.265, true],
  ["St. Paul", "MN", 44.9537, -93.09],
  ["Milwaukee", "WI", 43.0389, -87.9065],
  ["Madison", "WI", 43.0731, -89.4012],
  ["Chicago", "IL", 41.8781, -87.6298, true],
  ["Naperville", "IL", 41.7508, -88.1535],
  ["Indianapolis", "IN", 39.7684, -86.1581],
  ["Columbus", "OH", 39.9612, -82.9988],
  ["Cleveland", "OH", 41.4993, -81.6944],
  ["Cincinnati", "OH", 39.1031, -84.512],
  ["Dayton", "OH", 39.7589, -84.1916],
  ["Detroit", "MI", 42.3314, -83.0458],
  ["Grand Rapids", "MI", 42.9634, -85.6681],
  ["Pittsburgh", "PA", 40.4406, -79.9959],
  ["Philadelphia", "PA", 39.9526, -75.1652, true],
  ["Baltimore", "MD", 39.2904, -76.6122],
  ["Washington", "DC", 38.9072, -77.0369, true],
  ["Richmond", "VA", 37.5407, -77.436],
  ["Norfolk", "VA", 36.8508, -76.2859],
  ["Virginia Beach", "VA", 36.8529, -75.978],
  ["Raleigh", "NC", 35.7796, -78.6382],
  ["Charlotte", "NC", 35.2271, -80.8431],
  ["Atlanta", "GA", 33.749, -84.388, true],
  ["Savannah", "GA", 32.0809, -81.0912],
  ["Nashville", "TN", 36.1627, -86.7816],
  ["Knoxville", "TN", 35.9606, -83.9207],
  ["Memphis", "TN", 35.1495, -90.049],
  ["Birmingham", "AL", 33.5186, -86.8104],
  ["Jacksonville", "FL", 30.3322, -81.6557],
  ["Orlando", "FL", 28.5383, -81.3792],
  ["Tampa", "FL", 27.9506, -82.4572],
  ["Miami", "FL", 25.7617, -80.1918],
  ["Boston", "MA", 42.3601, -71.0589],
  ["Cambridge", "MA", 42.3736, -71.1097],
  ["New York", "NY", 40.7128, -74.006, true],
  ["Brooklyn", "NY", 40.6782, -73.9442],
  ["Queens", "NY", 40.7282, -73.7949],
  ["Albany", "NY", 42.6526, -73.7562],
  ["Buffalo", "NY", 42.8864, -78.8784],
  ["Rochester", "NY", 43.1566, -77.6088],
  ["Syracuse", "NY", 43.0481, -76.1474],
  ["Newark", "NJ", 40.7357, -74.1724],
  ["Jersey City", "NJ", 40.7178, -74.0431],
  ["Hartford", "CT", 41.7658, -72.6734],
  ["Providence", "RI", 41.824, -71.4128],
  ["Portland", "ME", 43.6591, -70.2568],
  ["Manchester", "NH", 42.9956, -71.4548],
  ["New Orleans", "LA", 29.9511, -90.0715],
  ["Baton Rouge", "LA", 30.4515, -91.1871],
  ["Little Rock", "AR", 34.7465, -92.2896],
  ["Louisville", "KY", 38.2527, -85.7585],
  ["Lexington", "KY", 38.0406, -84.5037],
  ["Charleston", "SC", 32.7765, -79.9311],
  ["Columbia", "SC", 34.0007, -81.0348],
  ["Greenville", "SC", 34.8526, -82.394],
  ["Jackson", "MS", 32.2988, -90.1848],
  ["Wichita", "KS", 37.6872, -97.3301],
  ["Honolulu", "HI", 21.3069, -157.8583],
  ["Anchorage", "AK", 61.2181, -149.9003],
  ["Wilmington", "DE", 39.7391, -75.5398],
  ["Billings", "MT", 45.7833, -108.5007],
  ["Cheyenne", "WY", 41.14, -104.8202],
  ["Fargo", "ND", 46.8772, -96.7898],
  ["Sioux Falls", "SD", 43.546, -96.7313],
  ["Charleston", "WV", 38.3498, -81.6326],
];


/** How well a place was placed. "city" is good to about a mile; "state" only says which part of the country. */
export type PlacePrecision = "city" | "state";

export interface PlaceFix {
  point: GeoPoint;
  /** What was matched, spelled out: "Portland, OR", or "Oregon" when only the state was recognised. */
  label: string;
  precision: PlacePrecision;
}

/** Lower case, no full stops, single spaces — so "St. Paul" and "st paul" are the same key. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CITY_BY_KEY = new Map<string, CityRow>();
const CITY_BY_NAME = new Map<string, CityRow[]>();
for (const row of CITY_POINTS) {
  const [city, state] = row;
  CITY_BY_KEY.set(`${normalise(city)}|${state}`, row);
  const list = CITY_BY_NAME.get(normalise(city)) ?? [];
  list.push(row);
  CITY_BY_NAME.set(normalise(city), list);
}

/** The state code a token names, if it names one: "OR", "or", "Oregon". */
function stateCode(token: string): string | undefined {
  const clean = token.trim();
  if (/^[A-Za-z]{2}$/.test(clean)) {
    const upper = clean.toUpperCase();
    return STATE_POINTS[upper] ? upper : undefined;
  }
  return STATE_NAMES[normalise(clean)];
}

/**
 * The first place named in a posting's location line, as a point.
 *
 * Postings write this field every way there is — "Portland, OR", "Hillsboro, OR (Hybrid)", "Portland, OR /
 * Vancouver, WA", "Oregon", "Remote (US)" — so the work is in the stripping rather than in the lookup: the
 * parenthetical is a work mode, the slash is a second option, and the mode words are not places. What comes
 * out is either a city (the good case), a state (honest but coarse) or nothing at all, and the caller decides
 * what to do about the third.
 */
export function locatePlace(text: string): PlaceFix | null {
  const cleaned = text
    .replace(/\([^)]*\)/g, " ")
    .replace(/[·•]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  // "Portland, OR / Vancouver, WA" is a choice, not a place: the first one is the one on the map.
  const first = cleaned.split(/\s*\/\s*/)[0]?.trim() ?? "";
  if (!first) return null;

  const withoutModes = first
    .replace(
      /\b(remote|hybrid|on[- ]?site|in[- ]?office|anywhere|nationwide|united states|usa|u\.s\.|us)\b/gi,
      " ",
    )
    .replace(/[,\s]+$/g, "")
    .trim();
  if (!withoutModes) return null;

  const words = withoutModes.split(/\s+/);
  // A trailing state: "Portland, OR", "Portland OR", "Portland, Oregon". Two words are tried first, because
  // "New York" is one place and "New" is not.
  for (let take = 2; take >= 1; take -= 1) {
    if (words.length <= take) continue;
    const tail = words.slice(words.length - take).join(" ");
    const code = stateCode(tail);
    if (!code) continue;
    const city = words.slice(0, words.length - take).join(" ").replace(/[,\s]+$/g, "").trim();
    const row = CITY_BY_KEY.get(`${normalise(city)}|${code}`);
    if (row) {
      return { point: { lat: row[2], lng: row[3] }, label: `${row[0]}, ${row[1]}`, precision: "city" };
    }
    // The city is not in the book, but the state is: better a coarsely-placed dot than none, and the label
    // says which it is.
    if (city) {
      return { point: STATE_POINTS[code], label: STATE_NAMES_INVERSE[code] ?? code, precision: "state" };
    }
  }

  const alone = stateCode(withoutModes);
  if (alone) {
    return { point: STATE_POINTS[alone], label: STATE_NAMES_INVERSE[alone] ?? alone, precision: "state" };
  }

  // No state named: the city on its own, if the book knows exactly one of that name — or knows which one a
  // bare "Portland" means.
  const matches = CITY_BY_NAME.get(normalise(withoutModes));
  if (matches?.length) {
    const row = matches.find((entry) => entry[4]) ?? matches[0];
    return { point: { lat: row[2], lng: row[3] }, label: `${row[0]}, ${row[1]}`, precision: "city" };
  }
  return null;
}

/** "OR" → "Oregon", for a label a person reads. */
const STATE_NAMES_INVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([name, code]) => [
    code,
    name.replace(/\b\w/g, (letter) => letter.toUpperCase()),
  ]),
);

