"use client";

import * as React from "react";
import { Loader2, Locate, MapPin, Maximize2, Minus, Navigation, Plus } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/WorkspaceProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { APPLICATION_STAGES, STAGE_INK, type ApplicationStage, type SavedApplication } from "@/lib/types";
import {
  DEFAULT_TILE_URL,
  MAX_ZOOM,
  MIN_ZOOM,
  RADIUS_CHOICES,
  TILE_ATTRIBUTION,
  TILE_SIZE,
  clampZoom,
  describeTrip,
  fillTileUrl,
  locatePlace,
  milesBetween,
  pixelsForMiles,
  projectIntoView,
  projectMercator,
  tilesForView,
  unprojectMercator,
  viewToFit,
  zoomForRadius,
  type GeoPoint,
  type MapView,
  type PlacePrecision,
} from "@/lib/geo";
import { cn } from "@/lib/utils";

/**
 * Where you are applying, and how far it is — on a real map.
 *
 * The calendar already knows two things about every application: the `location` line the posting parser read
 * off the ad, and the work mode. This puts the first on a map and the second to work: a pin per application on
 * the streets it is actually on, a ring at the radius you choose, and a list of what falls inside it. "Should
 * I apply to this?" is often really "is that a two-hour commute?", and that question has a number for an
 * answer.
 *
 * The imagery comes from OpenStreetMap — the one tile source with no key, no account and no bill — so the
 * *area you are looking at* is visible to a tile server, exactly as it would be in any browser map. Your
 * applications never are: the pins are drawn here, from location lines that are already here. The only
 * question that leaves this machine is a place *you* typed — a ZIP code, a suburb, a street address — and only
 * when the book of places does not already know it. Switch the imagery off and everything but the roads still
 * works, because the ring and the pins are drawn from the numbers.
 *
 * A place nothing can place is not guessed at: it goes in the "not on the map" list with a field to type a ZIP
 * code or coordinates into, because a confident pin in the wrong county is worse than an honest gap.
 */

/** A placed application, ready to draw. */
export interface Plotted {
  entry: SavedApplication;
  point: GeoPoint;
  /** What placed it, for the row: "Hillsboro, OR". */
  label: string;
  /** "state" means the pin is the middle of a state, not a site. */
  precision: PlacePrecision;
  /** True when the author typed the coordinates, which beats anything the book knows. */
  pinned: boolean;
  miles: number;
  /** The line from the base: "15 mi W". */
  trip: string;
  inside: boolean;
}

/** Something the map cannot draw honestly: it is remote, or nothing knows the name. */
export interface Loose {
  entry: SavedApplication;
  why: "remote" | "unknown";
}

/** "30 mi" / "15 mi" / "7.5 mi" — short, because it is written against a ring. */
export function ringLabel(miles: number): string {
  return `${miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles)} mi`;
}

/**
 * Sorts every application into a pin, a remote no-op, or something nothing can place.
 *
 * A posting that names a place gets a pin even when it is remote — the *office* is somewhere, and a hybrid
 * role two hours away is worth seeing. Only a location that says nothing at all ("Remote", "Anywhere") is
 * treated as remote, and only a name neither the book nor a pinned coordinate can place is "not placed".
 */
export function plotApplications(
  applications: SavedApplication[],
  base: GeoPoint | null,
  radius: number,
): { plotted: Plotted[]; loose: Loose[] } {
  const plotted: Plotted[] = [];
  const loose: Loose[] = [];
  for (const entry of applications) {
    // A pin the author typed beats the book: it is exact, and it is the only way to place a name the book has
    // never heard of.
    const fix = entry.coords
      ? {
          point: entry.coords,
          label: entry.location || "pinned",
          precision: "city" as const,
          pinned: true,
        }
      : locatePlace(entry.location);
    if (!fix || !base) {
      loose.push({ entry, why: entry.workMode === "Remote" ? "remote" : "unknown" });
      continue;
    }
    const miles = milesBetween(base, fix.point);
    plotted.push({
      entry,
      point: fix.point,
      label: fix.label,
      precision: fix.precision,
      pinned: "pinned" in fix,
      miles,
      trip: describeTrip(base, fix.point),
      inside: miles <= radius,
    });
  }
  plotted.sort((left, right) => left.miles - right.miles);
  return { plotted, loose };
}

/** The frame's height in CSS pixels; its width is whatever the card gives it. */
const FRAME_HEIGHT = 384;
/** What to assume before a measure — and in jsdom, where a measure never comes. */
const FALLBACK_SIZE = { width: 720, height: FRAME_HEIGHT };

/**
 * The map: tiles you can drag, a ring at the radius, and a pin per application.
 *
 * Everything is drawn from `lib/geo`'s Mercator projection, so a pin is where the place is and the ring is the
 * real distance at the base's latitude. Pins outside the frame are left where they are and clipped rather than
 * pulled to the edge, because a map that moves your data to make it fit is lying about where things are.
 *
 * Imagery is optional: with `tiles` off this is still a working map — a grid, a ring, a pin per place — which
 * is also the state it falls back to when a tile server cannot be reached.
 */
function SlippyMap({
  centre,
  centreLabel,
  radius,
  dots,
  savedView,
  onView,
  tiles,
  selectedId,
  onSelect,
}: {
  centre: GeoPoint;
  centreLabel: string;
  radius: number;
  dots: Plotted[];
  /** The author's own pan or zoom, if they have made one. Null means "centre on the base, size to the radius". */
  savedView: MapView | null;
  onView: (view: MapView | null) => void;
  tiles: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const frame = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState(FALLBACK_SIZE);
  const [dragging, setDragging] = React.useState(false);
  const [failedTiles, setFailedTiles] = React.useState(0);

  /* The frame is whatever the card gives it, so the view has to come from a real measurement. */
  React.useEffect(() => {
    const measure = () => {
      const box = frame.current?.getBoundingClientRect();
      if (!box?.width) return;
      setSize({ width: Math.round(box.width), height: Math.round(box.height || FRAME_HEIGHT) });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (frame.current && observer) observer.observe(frame.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /**
   * What is on screen: the author's view once they have moved the map, and otherwise the base centred with the
   * radius fitting the frame — so choosing 10 mi moves the map in, and a pan is never yanked back by a
   * settings change.
   */
  const auto: MapView = {
    lat: centre.lat,
    lng: centre.lng,
    zoom: zoomForRadius(radius, centre.lat, size.width, size.height, 72),
  };
  const view = savedView ?? auto;

  const move = React.useCallback(
    (next: MapView) => onView({ lat: next.lat, lng: next.lng, zoom: clampZoom(next.zoom) }),
    [onView],
  );

  /* Drag to pan. Pointer capture, so a fast drag that leaves the frame keeps working. */
  const drag = React.useRef<{ x: number; y: number; view: MapView } | null>(null);
  /** A click at the end of a drag is not a click on the map: without this, panning would unpick your pin. */
  const dragged = React.useRef(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, view };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) dragged.current = true;
    const zoom = clampZoom(start.view.zoom);
    const world = projectMercator({ lat: start.view.lat, lng: start.view.lng }, zoom);
    // Dragging the map right moves the *centre* west, which is why the delta is subtracted.
    const at = unprojectMercator(
      { x: world.x - (event.clientX - start.x), y: world.y - (event.clientY - start.y) },
      zoom,
    );
    move({ lat: at.lat, lng: at.lng, zoom });
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  /** Scroll to zoom, anchored on the pointer: the place under the cursor stays under the cursor. */
  const zoomAt = React.useCallback(
    (step: number, anchor?: { x: number; y: number }) => {
      const zoom = clampZoom(view.zoom + step);
      if (zoom === view.zoom) return;
      if (!anchor) {
        move({ lat: view.lat, lng: view.lng, zoom });
        return;
      }
      const world = projectMercator({ lat: view.lat, lng: view.lng }, view.zoom);
      // What is under the cursor, as a place…
      const under = unprojectMercator(
        { x: world.x - size.width / 2 + anchor.x, y: world.y - size.height / 2 + anchor.y },
        view.zoom,
      );
      // …and where the frame has to be centred for it to still be under the cursor at the new zoom.
      const next = projectMercator(under, zoom);
      const at = unprojectMercator(
        { x: next.x - (anchor.x - size.width / 2), y: next.y - (anchor.y - size.height / 2) },
        zoom,
      );
      move({ lat: at.lat, lng: at.lng, zoom });
    },
    [move, size.height, size.width, view.lat, view.lng, view.zoom],
  );

  React.useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1 : -1, { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /** Arrow keys pan, like every other nudge in this app. Shift goes further. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 160 : 48;
    const nudges: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = nudges[event.key];
    if (!delta) return;
    event.preventDefault();
    const world = projectMercator({ lat: view.lat, lng: view.lng }, view.zoom);
    const at = unprojectMercator({ x: world.x + delta.x, y: world.y + delta.y }, view.zoom);
    move({ lat: at.lat, lng: at.lng, zoom: view.zoom });
  };

  /** "Show every application": the base and every pin in one frame, however far apart they are. */
  const fitAll = () => {
    const fitted = viewToFit([centre, ...dots.map((dot) => dot.point)], size.width, size.height, 80);
    if (fitted) move(fitted);
  };

  const centreAt = projectIntoView(centre, view, size.width, size.height);
  const rings = [
    { miles: radius, strong: true },
    { miles: radius / 2, strong: false },
    { miles: radius / 4, strong: false },
  ];
  const controls = [
    { label: "Zoom in", Icon: Plus, onClick: () => zoomAt(1), off: view.zoom >= MAX_ZOOM },
    { label: "Zoom out", Icon: Minus, onClick: () => zoomAt(-1), off: view.zoom <= MIN_ZOOM },
    { label: "Show every application", Icon: Maximize2, onClick: fitAll, off: !dots.length },
    { label: "Centre on the base", Icon: Locate, onClick: () => onView(null), off: !savedView },
  ];



  return (
    <div
      ref={frame}
      data-map="frame"
      data-zoom={view.zoom}
      data-size={`${size.width}x${size.height}`}
      tabIndex={0}
      role="application"
      aria-label={`Map of ${centreLabel}. ${dots.length} applications within ${radius} miles.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onClick={() => {
        // A drag ends in a click; it is not a click on the map, so it does not unpick your pin.
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        onSelect(null);
      }}
      className={cn(
        "relative touch-none select-none overflow-hidden rounded-lg border bg-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragging ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{ height: FRAME_HEIGHT }}
    >
      {tiles
        ? tilesForView(view, size.width, size.height).tiles.map((tile) => (
            <img
              key={`${tile.key}@${Math.round(tile.left)}`}
              data-tile={tile.key}
              src={fillTileUrl(DEFAULT_TILE_URL, tile.z, tile.x, tile.y)}
              alt=""
              width={TILE_SIZE}
              height={TILE_SIZE}
              draggable={false}
              onError={() => setFailedTiles((count) => count + 1)}
              className="pointer-events-none absolute select-none"
              style={{ left: tile.left, top: tile.top, width: TILE_SIZE, height: TILE_SIZE }}
            />
          ))
        : null}

      {/* With no imagery, a grid is what says "this is a map" rather than a blank panel. */}
      {tiles ? null : (
        <div
          data-grid="drawn"
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(#cbd5e1 1px, transparent 1px), linear-gradient(90deg, #cbd5e1 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      )}

      {/* The radius, sized at the base's latitude: a ring here is the real distance, at any zoom. */}
      {rings.map((ring) => {
        const pixels = pixelsForMiles(ring.miles, centre.lat, view.zoom);
        return (
          <div
            key={ring.miles}
            data-ring-miles={ring.miles}
            data-ring-px={Math.round(pixels)}
            aria-hidden
            className={cn(
              "pointer-events-none absolute rounded-full",
              ring.strong
                ? "border border-teal-600/70 bg-teal-500/[0.04]"
                : "border border-dashed border-slate-400/60",
            )}
            style={{
              left: centreAt.x - pixels,
              top: centreAt.y - pixels,
              width: pixels * 2,
              height: pixels * 2,
            }}
          >
            {ring.strong ? (
              <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded bg-white/85 px-1 text-[9px] font-medium text-teal-700">
                {ringLabel(ring.miles)}
              </span>
            ) : null}
          </div>
        );
      })}

      {/* Where the commute is measured from. */}
      <div
        data-centre={centreLabel}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: centreAt.x, top: centreAt.y }}
      >
        <span className="block h-3 w-3 rounded-full border-2 border-teal-700 bg-white" />
        <span className="absolute left-3.5 top-0 whitespace-nowrap rounded bg-white/85 px-1 text-[10px] font-semibold text-teal-800">
          {centreLabel}
        </span>
      </div>

      {/* A pin per application, at the place the place actually is. Off the frame is left off the frame. */}
      {dots.map((dot) => {
        const at = projectIntoView(dot.point, view, size.width, size.height);
        const ink = STAGE_INK[dot.entry.stage];
        const selected = dot.entry.id === selectedId;
        const remote = dot.entry.workMode === "Remote";
        const name = dot.entry.company || dot.entry.jobTitle;
        return (
          <div
            key={dot.entry.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: at.x, top: at.y }}
          >
            <button
              type="button"
              data-pin={dot.entry.id}
              data-pin-x={Math.round(at.x)}
              data-pin-y={Math.round(at.y)}
              title={`${dot.entry.jobTitle} · ${dot.entry.company} — ${dot.trip} away`}
              aria-label={`${dot.entry.jobTitle} at ${name}, ${dot.trip} away`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(dot.entry.id);
              }}
              className="block"
            >
              <span
                className={cn(
                  "block rounded-full border-2 shadow-sm",
                  selected ? "h-4 w-4" : "h-3 w-3",
                  // A remote role that names an office gets a ring rather than a filled dot: the office is real,
                  // but nobody commutes to it.
                  remote ? "bg-white" : "",
                )}
                style={{ borderColor: ink, backgroundColor: remote ? "#ffffff" : ink }}
              />
            </button>
            {selected ? (
              <span className="absolute left-4 top-0 flex items-center gap-1 whitespace-nowrap">
                <span className="rounded bg-white/90 px-1 text-[10px] font-medium text-slate-800 shadow-sm">
                  {name}
                </span>
                {/*
                  A plain anchor rather than next/link: this renders wherever the records are, including a test
                  harness with no router mounted, and the page it goes to is a full load either way.
                */}
                <a
                  data-open-record={dot.entry.id}
                  href={`/saved?open=${encodeURIComponent(dot.entry.id)}`}
                  title={`Open the ${dot.entry.company || "saved"} record`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded bg-white/90 px-1 text-[10px] font-medium text-primary underline shadow-sm"
                >
                  open record
                </a>
              </span>
            ) : null}
          </div>
        );
      })}

      {/* The controls, above the imagery and out of the drag's way. */}
      <div
        className="absolute right-2 top-2 flex flex-col gap-1"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {controls.map(({ label, Icon, onClick, off }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={off}
            className="flex h-7 w-7 items-center justify-center rounded-md border bg-white/90 text-slate-700 shadow-sm transition-colors hover:border-primary hover:text-primary disabled:opacity-40"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {failedTiles >= 3 ? (
        <p
          data-tiles-failed="yes"
          className="absolute bottom-1 left-1 max-w-[70%] rounded bg-amber-50/95 px-1.5 py-0.5 text-[10px] text-amber-800"
        >
          The imagery is not loading — the ring and the pins still work, and the switch above turns it off.
        </p>
      ) : null}

      {tiles ? (
        <a
          href={TILE_ATTRIBUTION.href}
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-0.5 right-1 rounded bg-white/80 px-1 text-[9px] text-slate-600 hover:underline"
        >
          {TILE_ATTRIBUTION.text}
        </a>
      ) : null}
    </div>
  );
}

/** One application, as a row: what it is, where it is, and how far. */
function PlotRow({
  dot,
  selected,
  onSelect,
}: {
  dot: Plotted;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-row={dot.entry.id}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px]",
        selected ? "border-primary bg-primary/5" : "hover:border-primary",
      )}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: STAGE_INK[dot.entry.stage] }}
      />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{dot.entry.jobTitle}</span>
        {dot.entry.company ? <span className="text-muted-foreground"> · {dot.entry.company}</span> : null}
      </span>
      <span className="shrink-0 text-muted-foreground">{dot.label}</span>
      <span className="w-20 shrink-0 text-right font-medium tabular-nums">{dot.trip}</span>
    </button>
  );
}

/**
 * The section: the frame, the map, and the four lists.
 *
 * The lists are the map's other half. A pin tells you *where*; the rows tell you what it is and how far, and
 * they are ordered by distance, so the top of "inside" is the easiest commute you have in play. Remote roles
 * are listed rather than plotted — they have no commute, which is the point of them — and anything neither the
 * book nor a typed coordinate can place gets a field for a ZIP code or a pair of coordinates instead of a
 * guess.
 */
export function JobMap({ applications }: { applications: SavedApplication[] }) {
  const { profile, mapSettings, updateMapSettings, updateApplication, geocode } = useWorkspace();
  const radius = mapSettings.radiusMiles;
  const marketHint = profile.targetMarket.locations[0] ?? profile.header.location ?? "";
  /** Until the author names a place, the map is centred on the market the profile already states. */
  const baseText = mapSettings.base || marketHint;
  const fromBook = React.useMemo(() => locatePlace(baseText), [baseText]);
  const centre = mapSettings.basePoint ?? fromBook?.point ?? null;
  const centreLabel = mapSettings.base || fromBook?.label || "";
  const [draftBase, setDraftBase] = React.useState(mapSettings.base);
  const [looking, setLooking] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Record<string, string>>({});
  /**
   * Stages the author has switched off.
   *
   * A map with forty pins on it is a map you cannot read, so the legend is also the filter: clicking a stage
   * hides its pins *and* its rows, because a count that disagrees with the pins above it is worse than no count.
   */
  const [hidden, setHidden] = React.useState<ApplicationStage[]>([]);
  const toggleStage = (stage: ApplicationStage) =>
    setHidden((current) =>
      current.includes(stage) ? current.filter((entry) => entry !== stage) : [...current, stage],
    );
  React.useEffect(() => setDraftBase(mapSettings.base), [mapSettings.base]);

  const { plotted, loose } = React.useMemo(
    () => plotApplications(applications, centre, radius),
    [applications, centre, radius],
  );
  /** What the map and the lists are actually showing. */
  const visible = plotted.filter((dot) => !hidden.includes(dot.entry.stage));
  const inside = visible.filter((dot) => dot.inside);
  const outside = visible.filter((dot) => !dot.inside);
  const remote = loose.filter((row) => row.why === "remote" && !hidden.includes(row.entry.stage));
  const unplaced = loose.filter((row) => row.why === "unknown" && !hidden.includes(row.entry.stage));
  const selected = plotted.find((dot) => dot.entry.id === selectedId) ?? null;
  const stagesInUse = APPLICATION_STAGES.filter((stage) =>
    plotted.some((dot) => dot.entry.stage === stage),
  );

  /**
   * Point the map at a place the author typed.
   *
   * A city the book knows is instant; a ZIP code or an address goes to the lookup, and is remembered from then
   * on. Either way the words are kept exactly as typed, because that is what will be edited next time.
   */
  const useBase = async (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setLooking(true);
    const hit = await geocode(clean);
    setLooking(false);
    if (!hit) {
      toast.error(`Nothing found for “${clean}”. Try a city, a ZIP code, or coordinates.`);
      return;
    }
    updateMapSettings((current) => ({ ...current, base: clean, basePoint: hit.point, view: null }));
    toast.success(`Centred on ${hit.label}`);
  };

  /** Pin an application nothing could place: a ZIP code, a place, or coordinates read off a phone. */
  const pin = async (entry: SavedApplication) => {
    const text = (rows[entry.id] ?? "").trim();
    if (!text) return;
    const hit = await geocode(text);
    if (!hit) {
      toast.error(`Nothing found for “${text}”.`);
      return;
    }
    updateApplication(entry.id, { coords: hit.point });
    setRows((current) => ({ ...current, [entry.id]: "" }));
    toast.success(`${entry.company || entry.jobTitle} pinned to ${hit.label}`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> Where you are applying
            </CardTitle>
            <CardDescription>
              A pin per application on streets you can recognise, and how far it is from where you would work.
            </CardDescription>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            Map imagery
            <Switch
              checked={mapSettings.tiles}
              onCheckedChange={(on) => updateMapSettings((current) => ({ ...current, tiles: on }))}
              aria-label="Map imagery"
            />
          </label>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="map-base" className="text-[11px] font-medium text-muted-foreground">
              Centre of the map
            </label>
            <Input
              id="map-base"
              aria-label="Centre of the map"
              value={draftBase}
              placeholder={marketHint ? `${marketHint} · or a ZIP code` : "Portland, OR · or 97201"}
              className="mt-1 h-8 text-[12px]"
              onChange={(event) => setDraftBase(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void useBase(draftBase);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void useBase(draftBase)}
            disabled={looking || !draftBase.trim()}
            className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {looking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="h-3.5 w-3.5" />
            )}
            use this
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Within</span>
          {RADIUS_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => updateMapSettings((current) => ({ ...current, radiusMiles: choice }))}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                choice === radius
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "hover:border-primary",
              )}
            >
              {choice} mi
            </button>
          ))}
        </div>

        {centre ? (
          <SlippyMap
            centre={centre}
            centreLabel={centreLabel}
            radius={radius}
            dots={visible}
            savedView={mapSettings.view}
            onView={(view) => updateMapSettings((current) => ({ ...current, view }))}
            tiles={mapSettings.tiles}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <p className="rounded-lg border bg-muted/40 p-6 text-center text-[12px] text-muted-foreground">
            Say where you would work from — a city, a ZIP code, or a pair of coordinates — and every application
            lands on the map.
          </p>
        )}

        <p className="text-[11px] text-muted-foreground">
          Drag to move · scroll or the +/− buttons to zoom · arrow keys nudge · ⤢ shows every application
          {plotted.length
            ? ` · ${inside.length} of ${visible.length} inside ${radius} miles of ${centreLabel}` +
              (hidden.length ? ` · ${hidden.length} stage${hidden.length === 1 ? "" : "s"} hidden` : "") +
              (selected ? ` · picked ${selected.entry.jobTitle} (${selected.trip})` : "")
            : ""}
        </p>

        {stagesInUse.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {stagesInUse.map((stage) => {
              const off = hidden.includes(stage);
              const count = plotted.filter((dot) => dot.entry.stage === stage).length;
              return (
                <button
                  key={stage}
                  type="button"
                  data-stage={stage}
                  data-hidden={off ? "yes" : "no"}
                  aria-pressed={!off}
                  title={off ? `Show ${stage}` : `Hide ${stage}`}
                  onClick={() => toggleStage(stage)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors",
                    off ? "opacity-45" : "hover:border-primary",
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: off ? "#cbd5e1" : STAGE_INK[stage] }}
                    aria-hidden
                  />
                  {stage} ({count})
                </button>
              );
            })}
            {hidden.length ? (
              <button
                type="button"
                data-show-all="yes"
                onClick={() => setHidden([])}
                className="rounded-full border border-primary px-2 py-0.5 text-[11px] text-primary transition-colors"
              >
                show every stage again
              </button>
            ) : (
              <span className="text-[11px] text-muted-foreground">click a stage to hide it</span>
            )}
          </div>
        ) : null}

        {inside.length ? (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Inside {radius} miles ({inside.length})
            </p>
            {inside.map((dot) => (
              <PlotRow
                key={dot.entry.id}
                dot={dot}
                selected={dot.entry.id === selectedId}
                onSelect={() => setSelectedId(dot.entry.id)}
              />
            ))}
          </div>
        ) : null}

        {outside.length ? (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Further out ({outside.length})
            </p>
            {outside.map((dot) => (
              <PlotRow
                key={dot.entry.id}
                dot={dot}
                selected={dot.entry.id === selectedId}
                onSelect={() => setSelectedId(dot.entry.id)}
              />
            ))}
          </div>
        ) : null}

        {remote.length ? (
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">
              Remote, so no commute ({remote.length})
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {remote.map((row) => row.entry.company || row.entry.jobTitle).join(" · ")}
            </p>
          </div>
        ) : null}

        {unplaced.length ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Not on the map ({unplaced.length})
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Nothing knows these — the book of places has never heard of them and no lookup could place them —
              and a guessed pin is worse than none. Type a ZIP code, a town, or coordinates from the company&apos;s
              own site, and they land exactly.
            </p>
            {unplaced.map((row) => (
              <div
                key={row.entry.id}
                className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">{row.entry.jobTitle}</span>
                  {row.entry.company ? (
                    <span className="text-muted-foreground"> · {row.entry.company}</span>
                  ) : null}
                  <span className="text-muted-foreground"> — {row.entry.location || "no location"}</span>
                </span>
                <Input
                  value={rows[row.entry.id] ?? ""}
                  placeholder="97201, or 45.5152, -122.6784"
                  aria-label={`Where ${row.entry.jobTitle} is`}
                  className="h-7 w-44 text-[11px]"
                  onChange={(event) =>
                    setRows((current) => ({ ...current, [row.entry.id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void pin(row.entry);
                  }}
                />
                <button
                  type="button"
                  onClick={() => void pin(row.entry)}
                  className="rounded-md border px-2 py-1 text-[11px] transition-colors hover:border-primary hover:text-primary"
                >
                  pin it
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

