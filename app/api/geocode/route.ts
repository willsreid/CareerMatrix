/**
 * Where a place is — the one thing the map ever asks the network for.
 *
 * A route rather than a call straight from the browser, for two reasons: the lookup service asks to be told
 * who is calling and a browser is not allowed to say (it cannot set its own User-Agent), and keeping the
 * request here means the page never depends on a third party's CORS headers.
 *
 * The order is the point. Typed coordinates and the local book of places are answered with no request at all,
 * so "Portland, OR" and "45.5152, -122.6784" are instant and private; a ZIP code, an address, or a suburb the
 * book has never heard of is the case this route exists for. What comes back is a point and a label, and
 * nothing about an application is ever part of the question.
 */

import { type GeoPoint } from "@/lib/geo";
import {
  geocodeKey,
  localAnswer,
  looksLikePostcode,
  queuedLookup,
  searchNominatim,
  type GeocodeHit,
  type GeocodeKind,
} from "@/lib/geocode";

/** A query string is never build-time cacheable, whatever it says. */
export const dynamic = "force-dynamic";

/** Long enough for a street address, short enough that this cannot be used as a search engine. */
const MAX_QUERY = 120;

/**
 * Answers already given during this run of the server.
 *
 * Deliberately in memory and deliberately small: the durable cache belongs to the author, in their own
 * localStorage, and this only spares the lookup service a repeat while the server happens to be up.
 */
const answered = new Map<string, GeocodeHit>();
const ANSWERED_LIMIT = 50;

const hit = (query: string, label: string, point: GeoPoint, kind: GeocodeKind): GeocodeHit => ({
  query: geocodeKey(query),
  label,
  point,
  kind,
  at: Date.now(),
});

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < 2 || query.length > MAX_QUERY) {
    return Response.json({ error: "Type a place, a ZIP code, or an address." }, { status: 400 });
  }

  // Everything the map can answer by itself: coordinates typed by hand, then the book of places.
  const local = localAnswer(query);
  if (local) return Response.json(local);

  const key = geocodeKey(query);
  const remembered = answered.get(key);
  if (remembered) return Response.json(remembered);

  let found: Awaited<ReturnType<typeof searchNominatim>>;
  try {
    found = await queuedLookup(() => searchNominatim(query));
  } catch {
    // Offline, or the service is down. The map says so and carries on with the book it already has.
    return Response.json({ error: "The place lookup is unreachable." }, { status: 502 });
  }
  if (!found) return Response.json({ error: `Nothing found for “${query}”.` }, { status: 404 });

  const answer = hit(
    query,
    found.label,
    found.point,
    looksLikePostcode(query) && found.kind === "place" ? "postcode" : found.kind,
  );
  answered.set(key, answer);
  while (answered.size > ANSWERED_LIMIT) {
    const oldest = answered.keys().next().value;
    if (oldest === undefined) break;
    answered.delete(oldest);
  }
  return Response.json(answer);
}
