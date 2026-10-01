/**
 * What changing a detail on an application means.
 *
 * The details dialog is a form, and a form that owns its own rules is a form nobody can check. So the rules live
 * here — which field a blank value clears, where a lookup should be sent, and what storing the answer looks like —
 * and the dialog only draws them. Two of the three are not obvious and were worth writing down:
 *
 * - An empty *optional* field means "remove it", while an empty notes field means "no notes". They are different
 *   states and the record stores them differently.
 * - Placing an address keeps the address you typed (or the one already on the record if you cleared the box) and
 *   stores the point beside it, because the map prefers a stored point to anything the gazetteer guessed.
 */

import { formatLatLng, type GeoPoint } from "./geo";
import type { SavedApplication } from "./types";

/** The free-text details a person edits after applying. */
export type DetailField = "address" | "contact" | "notes" | "source";

/** The patch for one edited field. */
export function detailPatch(field: DetailField, value: string): Partial<SavedApplication> {
  const clean = value.trim();
  if (field === "notes") return { notes: clean };
  if (field === "address") return { address: clean || undefined };
  if (field === "contact") return { contact: clean || undefined };
  return { source: clean || undefined };
}

/**
 * Where a lookup for this application's office should be sent.
 *
 * The address you typed first, because that is the specific building; the posting's own location line as the
 * fallback, so pressing the button on a record with no address yet still does something useful.
 */
export function addressToPlace(
  entry: Pick<SavedApplication, "location">,
  draft: string,
): string {
  return (draft.trim() || entry.location || "").trim();
}

/** What to write once a lookup has answered. */
export function placedAddress(
  entry: Pick<SavedApplication, "address">,
  draft: string,
  point: GeoPoint,
): Partial<SavedApplication> {
  return { address: draft.trim() || entry.address, coords: point };
}

/** How the pin reads in the dialog: "pinned at 45.5161, -122.6787". */
export function pinnedLabel(point: GeoPoint): string {
  return `pinned at ${formatLatLng(point)}`;
}
