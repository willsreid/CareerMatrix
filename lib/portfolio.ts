/**
 * Portfolio planning.
 *
 * Turns a portfolio document into the exact sequence of pages the PDF renderer will
 * emit, so the planner, the renderer and the tests all agree about what is on which
 * page. Rendering decisions (how many filmstrip frames fit, which slide gets its own
 * page) belong here, where they can be asserted without rendering anything.
 */

import type {
  FrameShape,
  PagePad,
  PadTone,
  Portfolio,
  PortfolioBlock,
  PortfolioImageRef,
  PortfolioPageSize,
  PortfolioProject,
  PortfolioSlide,
} from "./portfolioTypes";
import { applyPresentation, inferPresentation } from "./presentationOptions";
import { contactLine, type PortfolioLink } from "./portfolioContact";
import type { TextStyleId, TextStyleMap, TextStyleSlot } from "./textStyles";
import type { TextMarkMap, TextStyleRange } from "./textStyles";
import { applyMark, clampMarks, clearMarks } from "./textStyles";

import {
  assetById,
  descriptionForImage,
  expandWithCompanions,
  imagesForAssets,
  linkForAssets,
  metricsForAssets,
  textForAssets,
  type MediaAsset,
  type MediaLibrary,
} from "./mediaLibrary";

/* -------------------------------------------------------------------------- */
/* Resolving content from the store                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fills a block from the media store and applies its chosen presentation.
 *
 * Both steps are optional and additive. A block with no `assetIds` keeps the image references
 * it carries, and a block with no `presentation` keeps its type, so documents written before
 * the store existed plan exactly as they did. Content that has been deleted from the store is
 * left in place rather than blanking the section — a missing asset should be visible as a
 * stale reference, not as an empty page.
 */
export function resolveBlock(block: PortfolioBlock, library?: MediaLibrary): PortfolioBlock {
  const presented = applyPresentation(block);

  /**
   * Captions typed on the page, applied last so they win over the tied text and the store's one-liner.
   *
   * Applied on every path out of this function, including the one where there is no library: a page's
   * own words are the document's, and must not depend on the store being passed. (Planning without a
   * store is how the tests and the fixtures work, and losing a caption there would be a silent
   * difference between what is planned and what is shown.)
   */
  const withCaptions = (value: PortfolioBlock): PortfolioBlock => {
    if (!block.captions) return value;
    return {
      ...value,
      images: value.images.map((image) =>
        block.captions?.[image.id] !== undefined
          ? { ...image, caption: block.captions[image.id] }
          : { ...image },
      ),
    };
  };

  if (!library || !block.assetIds?.length) return withCaptions(presented);

  const next: PortfolioBlock = { ...presented };

  // Whatever is tied to a placed asset comes with it. A caption or a metric follows the photograph
  // into every section that shows it, and keeps following when a section changes presentation. A
  // slot only renders what its presentation can show, so a metric companion is inert on a
  // full-bleed page and a caption is inert on a metrics row.
  const ids = expandWithCompanions(library, block.assetIds);
  const images = imagesForAssets(library, ids);
  if (images.length) next.images = images;

  const metrics = metricsForAssets(library, ids);
  // Unless they were typed on the page: a number edited in place is an instruction, and re-resolving
  // the store over the top of it would silently undo the edit every time anything else changed.
  if (metrics.length && !block.metricsEdited) next.metrics = metrics;

  const pair = block.assetIds
    .map((id) => assetById(library, id))
    .find((asset) => Boolean(asset?.pair));
  if (pair?.pair) {
    // Labels come from the stored pair, so renaming it once renames it everywhere. An
    // explicit label on the block still wins, for the case where this section frames the
    // comparison differently from the others.
    next.beforeLabel = block.beforeLabel ?? pair.pair.beforeLabel;
    next.afterLabel = block.afterLabel ?? pair.pair.afterLabel;
  }

  const accompanyingText = textForAssets(library, ids);
  if (next.kind === "text" || next.kind === "quote") {
    next.body = accompanyingText ?? block.body;
  } else if (accompanyingText && !block.body) {
    // A caption that followed an image in becomes the section's caption where there is no body of
    // its own — the "text travels with the media" promise, made visible.
    next.body = accompanyingText;
  }
  if (next.kind === "metrics" && !next.metrics?.length) {
    next.metrics = metricsForAssets(library, ids);
  }
  if (next.kind === "video") {
    const link = linkForAssets(library, ids);
    if (link) next.videoUrl = link.url;
    if (!next.videoPoster && next.images.length) next.videoPoster = next.images[0];
  }
  if (next.kind === "filmstrip" && images.length) next.images = images;

  // Cards put a description under each photograph, so the description has to belong to the
  // photograph rather than to the section: text tied to the image wins, then the one-line
  // description typed in the store. The refs are copied first — they are the store's own objects,
  // and stamping a caption onto one would write through to every other section showing the frame.
  if (next.layout === "cards") {
    next.images = next.images.map((image) => {
      const described = descriptionForImage(library, image.id);
      return described ? { ...image, caption: described } : { ...image };
    });
  }

  // Captions typed on the page win over the store's description — see `withCaptions`, which is
  // applied on the way out, after the store has had its say.
  return withCaptions(next);
}

/**
 * Resolves every block in a document, so the planner sees plain blocks.
 *
 * Two separate jobs, and only one of them needs the store. Applying a block's *presentation* is pure
 * arithmetic on the block — it turns "cards" into the layout and column count the renderer reads — and
 * has to happen whether or not a store was passed, or a document planned without one would lay out
 * differently from the same document planned with one. Filling content from the store happens only
 * when there is one.
 */
export function resolvePortfolio(portfolio: Portfolio, library?: MediaLibrary): Portfolio {
  return {
    ...portfolio,
    projects: portfolio.projects.map((project) => ({
      ...project,
      slides: project.slides.map((slide) => ({
        ...slide,
        blocks: slide.blocks.map((block) => resolveBlock(block, library)),
      })),
    })),
  };
}

/**
 * Which option a block is using, for the editor to show as selected.
 *
 * Reads the explicit choice when there is one and infers it from the block otherwise, so a
 * section authored before the picker existed still shows the option it behaves like.
 */
export function blockPresentation(block: PortfolioBlock): string {
  return block.presentation ?? inferPresentation(block);
}

/* -------------------------------------------------------------------------- */
/* Editing the document                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Frame width over height, per shape.
 *
 * One table, read by the PDF renderer and by the on-screen workspace, so a "tall" frame means the
 * same thing on both. Numbers rather than names in both places would drift the moment either side
 * was touched.
 */
export const FRAME_ASPECT: Record<FrameShape, number> = {
  wide: 1.9,
  standard: 1.34,
  tall: 0.92,
};

export function frameAspect(shape: FrameShape | undefined): number {
  return FRAME_ASPECT[shape ?? "standard"];
}

/**
 * The page's width in units, for placing sections side by side.
 *
 * Twelve divides into halves, thirds and quarters exactly, which is the whole reason for choosing it
 * over a fraction: a section's width and the row's total are integers, so "does the next one fit" is
 * a comparison rather than a rounding decision.
 */
export const GRID_SPAN = 12;

/** The width steps the editor offers, with the words that explain them. */
export const BLOCK_SPANS: { span: number; label: string; hint: string }[] = [
  { span: 12, label: "full", hint: "the whole width, on its own row" },
  { span: 9, label: "¾", hint: "three quarters — a quarter left beside it" },
  { span: 8, label: "⅔", hint: "two thirds — a third left beside it" },
  { span: 6, label: "½", hint: "half the width — two share a row" },
  { span: 4, label: "⅓", hint: "a third — three share a row" },
  { span: 3, label: "¼", hint: "a quarter — four share a row" },
];

/** Twelfths this section takes: 1–12, defaulting to the full width. */
export function blockSpan(block: PortfolioBlock): number {
  const span = block.span ?? GRID_SPAN;
  return Math.max(1, Math.min(GRID_SPAN, span));
}

/** The width of a section as a fraction of the page, for renderers that work in points. */
export function spanFraction(block: PortfolioBlock): number {
  return blockSpan(block) / GRID_SPAN;
}

/**
 * How many frames a section draws, including the ones still waiting for a picture.
 *
 * Unset `slots` means "as many as are here", so a section with two pictures and nothing else stays a
 * two-frame section. Set, it is a promise about the composition: four slots is four frames whether or
 * not four pictures have arrived, which is what lets the page be arranged first and filled later.
 */
export function frameSlots(block: PortfolioBlock): number {
  if (block.slots === undefined) return block.images.length;
  return Math.max(block.slots, block.images.length);
}

/**
 * The tones, and the ink that is legible on each.
 *
 * One table, read by the PDF renderer and the workspace both, for the same reason `FRAME_ASPECT` is:
 * a tone that looked one way on screen and another in the file would make the preview a lie. The
 * label ink travels with the fill, so a pad's own text can never be set in something unreadable.
 */
export const PAD_TONES: Record<
  PadTone,
  { fill: string; ink: string; label: string; hint: string }
> = {
  wash: {
    fill: "#f2f5f9",
    ink: "#616c78",
    label: "wash",
    hint: "a very light panel, to group things quietly",
  },
  tint: {
    fill: "#e4ebf5",
    ink: "#172f54",
    label: "tint",
    hint: "a light navy panel, for grouping with emphasis",
  },
  card: {
    fill: "#ffffff",
    ink: "#1c1f24",
    label: "card",
    hint: "a white panel with a hairline, to lift content off a tinted page",
  },
  rule: {
    fill: "#c9d2de",
    // Was `soft` #616c78, which is 3.5:1 on this fill — legible but poor for the one tone that is a *line*
    // rather than a panel. Darkened so all twelve tones clear 4.5:1, which is the figure the suite checks.
    ink: "#4b5563",
    label: "line",
    hint: "a line — thin to divide, taller as a bar",
  },
  navy: {
    fill: "#172f54",
    ink: "#ffffff",
    label: "navy",
    hint: "the accent block: its own label is white, so keep body text off it",
  },
  accent: {
    fill: "#0f766e",
    ink: "#ffffff",
    label: "teal",
    hint: "the second accent: its own label is white, so keep body text off it",
  },
  stone: {
    fill: "#e7e5e4",
    ink: "#292524",
    label: "stone",
    hint: "a warm light panel — quieter than a tint, warmer than a wash",
  },
  sand: {
    fill: "#f4e9d3",
    ink: "#6a5322",
    label: "sand",
    hint: "a light warm panel, for grouping without a colour",
  },
  sky: {
    fill: "#dbe8f4",
    ink: "#1b4569",
    label: "sky",
    hint: "a light blue panel: the tint with more air in it",
  },
  moss: {
    fill: "#dde7d6",
    ink: "#31502a",
    label: "moss",
    hint: "a light green panel, for a soft second voice",
  },
  slate: {
    fill: "#475569",
    ink: "#ffffff",
    label: "slate",
    hint: "a mid grey block: the sober version of a navy or teal one",
  },
  ink: {
    fill: "#1c1f24",
    ink: "#ffffff",
    label: "ink",
    hint: "a near-black block — the strongest grouping there is",
  },
};

/**
 * The tones, in the order they are offered.
 *
 * Light panels first, then the rules, then the solid blocks: the picker reads as a ramp from "barely there" to
 * "unmistakably a group", which is the decision being made rather than a list of colour names.
 */
export const PAD_TONE_ORDER: PadTone[] = [
  "wash",
  "tint",
  "sky",
  "stone",
  "sand",
  "moss",
  "card",
  "rule",
  "slate",
  "navy",
  "accent",
  "ink",
];

/**
 * How thick a line is, as a named preset — the **line style** dropdown.
 *
 * A rule is a pad with almost no height, so "line style" is height, and until now that was a pill row
 * that also offered *panel*: one control doing two unrelated things, with numbers you had to guess at.
 * Named instead, and the number stays in one table, so the pad still stores the fraction and the drawing
 * still reads it — the name is a way to reach the number, not a value hidden somewhere else.
 */
export interface LineStyle {
  id: "hairline" | "thin" | "medium" | "bar";
  name: string;
  /** Height as a fraction of the printable area, which is how a pad's height is stored. */
  height: number;
  /** What it prints as on a Letter page, in points, so the dropdown can say something true. */
  points: number;
  hint: string;
}

export const LINE_STYLES: Record<LineStyle["id"], LineStyle> = {
  hairline: {
    id: "hairline",
    name: "hairline",
    height: 0.0035,
    points: 2.4,
    hint: "a divider — the thinnest line the page can draw",
  },
  thin: { id: "thin", name: "thin", height: 0.012, points: 8.2, hint: "a rule with a little weight" },
  medium: {
    id: "medium",
    name: "medium",
    height: 0.03,
    points: 20.5,
    hint: "a band — separates two things without boxing them",
  },
  bar: { id: "bar", name: "bar", height: 0.08, points: 54.7, hint: "a thick bar — a header's spine" },
};

export const LINE_STYLE_ORDER: readonly LineStyle["id"][] = ["hairline", "thin", "medium", "bar"];

/**
 * How round a pad's corners are, as a named preset — the **pad style** dropdown.
 *
 * Corner radius is the one shape decision a panel has, and it was a row of bare numbers (0, 3, 6, 12)
 * that told you nothing about what you would get. Named, it says it.
 */
export interface PadStyle {
  id: "square" | "soft" | "round" | "pill";
  name: string;
  /** Corner radius in points, which is what the drawing reads. */
  radius: number;
  hint: string;
}

export const PAD_STYLES: Record<PadStyle["id"], PadStyle> = {
  square: { id: "square", name: "square", radius: 0, hint: "sharp corners — a plain panel" },
  soft: { id: "soft", name: "soft", radius: 3, hint: "the document's default corner" },
  round: { id: "round", name: "round", radius: 8, hint: "a friendlier panel" },
  pill: { id: "pill", name: "pill", radius: 18, hint: "a capsule — best on a band or a table row" },
};

export const PAD_STYLE_ORDER: readonly PadStyle["id"][] = ["square", "soft", "round", "pill"];

/** The thickness preset nearest a height, so the dropdown can show what a line currently is. */
export function lineStyleFor(height: number): LineStyle {
  return LINE_STYLE_ORDER.map((id) => LINE_STYLES[id]).reduce((best, candidate) =>
    Math.abs(candidate.height - height) < Math.abs(best.height - height) ? candidate : best,
  );
}

/** The corner preset nearest a radius, for the same reason. */
export function padStyleFor(radius: number | undefined): PadStyle {
  return PAD_STYLE_ORDER.map((id) => PAD_STYLES[id]).reduce((best, candidate) =>
    Math.abs(candidate.radius - (radius ?? 0)) < Math.abs(best.radius - (radius ?? 0))
      ? candidate
      : best,
  );
}

/** The smallest a pad can be dragged to, in fractions of the printable area. */
export const MIN_PAD = 0.03;

/**
 * A rule's minimum height is a hairline rather than a panel's.
 *
 * Which is the difference between a divider and a stripe: a line you can actually get thin, and a
 * panel that cannot be dragged down to nothing by accident.
 */
export const MIN_RULE = 0.0012;

function minHeightFor(tone: PadTone): number {
  return tone === "rule" ? MIN_RULE : MIN_PAD;
}

/**
 * Keeps a pad inside the printable area and no smaller than its tone allows.
 *
 * Every mutation goes through this, so a pad cannot be dragged off the page by accident, and a wobbly
 * drag cannot invert one into a negative width — which would draw nothing and look like a bug.
 */
export function clampPad(pad: PagePad): PagePad {
  const w = Math.max(MIN_PAD, Math.min(1, pad.w));
  const h = Math.max(minHeightFor(pad.tone), Math.min(1, pad.h));
  return {
    ...pad,
    w,
    h,
    x: Math.max(0, Math.min(1 - w, pad.x)),
    y: Math.max(0, Math.min(1 - h, pad.y)),
  };
}

/** A new pad, with the defaults a panel wants. The id is short and unique enough for one page. */
export function createPad(overrides: Partial<PagePad> = {}): PagePad {
  return {
    id: `pad-${Math.random().toString(36).slice(2, 8)}`,
    x: 0,
    y: 0.08,
    w: 1,
    h: 0.28,
    tone: "wash",
    radius: 4,
    ...overrides,
  };
}

/** The pad an "add a panel" button should give you: a wash behind the first third of the page. */
export function defaultGroupPad(): PagePad {
  return createPad({ tone: "wash", radius: 5 });
}

/** The pad a "add a line" button should give you: a full-width rule under the page heading. */
export function defaultRulePad(): PagePad {
  return createPad({ tone: "rule", y: 0.075, h: 0.0035, radius: 0 });
}

/**
 * Snaps a pad to the page's own geometry: twelfth columns across, twenty-fourths down.
 *
 * Twelfths because that is the grid the sections use, so a pad can be made to line up with a section
 * exactly — three thirds, four quarters — which is most of what grouping a row means. Both edges snap,
 * so a pad can be grown from either side to meet a column. `tolerance` is how close you have to be
 * before it takes hold, so free positioning is still possible by aiming between the marks.
 */
export function snapPad(pad: PagePad, tolerance = 0.012, columns = 12, rows = 24): PagePad {
  const snapTo = (value: number, step: number) => {
    const nearest = Math.round(value / step) * step;
    return Math.abs(nearest - value) <= tolerance ? nearest : value;
  };

  const x = snapTo(pad.x, 1 / columns);
  let w = pad.w;
  const right = pad.x + pad.w;
  const snappedRight = snapTo(right, 1 / columns);
  if (snappedRight !== right) w = snappedRight - x;

  const y = snapTo(pad.y, 1 / rows);
  let h = pad.h;
  const bottom = pad.y + pad.h;
  const snappedBottom = snapTo(bottom, 1 / rows);
  if (snappedBottom !== bottom) h = snappedBottom - y;

  return clampPad({ ...pad, x, y, w, h });
}

/** Moves or resizes a pad by a delta in page fractions, the way a drag does. */
export function dragPad(
  pad: PagePad,
  mode: "move" | "nw" | "ne" | "sw" | "se" | "w" | "e",
  dx: number,
  dy: number,
): PagePad {
  if (mode === "move") return clampPad({ ...pad, x: pad.x + dx, y: pad.y + dy });
  const next = { ...pad };
  // The ends of a line resize its length and nothing else, which is what its handles offer: the thickness of a
  // rule is the **line style** dropdown, so there is no corner to grab on a three-pixel strip.
  if (mode === "w") return clampPad({ ...pad, x: pad.x + dx, w: pad.w - dx });
  if (mode === "e") return clampPad({ ...pad, w: pad.w + dx });
  if (mode === "nw" || mode === "sw") {
    next.x = pad.x + dx;
    next.w = pad.w - dx;
  } else {
    next.w = pad.w + dx;
  }
  if (mode === "nw" || mode === "ne") {
    next.y = pad.y + dy;
    next.h = pad.h - dy;
  } else {
    next.h = pad.h + dy;
  }
  return clampPad(next);
}

/**
 * Whether a click on the page itself should put the tools away.
 *
 * This exists because of a bug that only showed up on the *second* visit to a pad. Selecting a pad for
 * the first time works through `addPad`, which sets the selection directly; selecting one you placed
 * earlier goes through the pointer, and a click with a pixel of jitter counts as a move — which takes
 * pointer capture, which makes the browser deliver the release's `click` to the *capturing* element,
 * the page box. The pad's own click never fired and the box's click deselects, so the modifiers
 * appeared while the button was held and vanished on release.
 *
 * Two guards, in one place so they can be tested without a browser: the press has to have started on
 * the page itself (not on a pad), and the click's target has to be the page (not a pad or anything
 * inside one).
 */
export function clickClearsTools(options: { startedOnPad: boolean; targetIsPad: boolean }): boolean {
  return !options.startedOnPad && !options.targetIsPad;
}

/**
 * The block with this id, or undefined.
 *
 * Every setter below starts by looking its target up, which is what lets them answer the question the
 * provider asks of every updater: did anything actually change? A pill pressed twice, a caption typed
 * and typed back, a pad dragged and dropped where it started — all of those have to hand back the
 * *same* document, or undo fills up with steps that do nothing.
 */
export function findBlock(portfolio: Portfolio, blockId: string): PortfolioBlock | undefined {
  return portfolio.projects
    .flatMap((project) => project.slides)
    .flatMap((slide) => slide.blocks)
    .find((block) => block.id === blockId);
}

/** True when every field in `patch` already holds the value it would be set to. */
export function blockHas(patch: Partial<PortfolioBlock>, block: PortfolioBlock): boolean {
  return Object.entries(patch).every(
    ([key, value]) =>
      JSON.stringify((block as unknown as Record<string, unknown>)[key]) === JSON.stringify(value),
  );
}

/** True when every field in `patch` already holds the value it would be set to. */
export function padHas(patch: Partial<PagePad>, pad: PagePad): boolean {
  return Object.entries(patch).every(
    ([key, value]) =>
      JSON.stringify((pad as unknown as Record<string, unknown>)[key]) === JSON.stringify(value),
  );
}

/** The pad with this id, or undefined. */
export function findPad(portfolio: Portfolio, padId: string): PagePad | undefined {
  return portfolio.projects
    .flatMap((project) => project.slides)
    .flatMap((slide) => slide.pads ?? [])
    .find((pad) => pad.id === padId);
}

/**
 * Pads, from the page's own point of view.
 *
 * `addPad` places a new pad, `updatePad` is the one the drag and the tone buttons both use, and
 * `removePad` takes it away. All three hand back the same document when nothing changed, so a drag
 * that ends where it started — which is what most drags that get cancelled are — costs no undo step.
 */
export function addPad(portfolio: Portfolio, slideId: string, pad: PagePad): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) =>
      slide.id === slideId ? { ...slide, pads: [...(slide.pads ?? []), pad] } : slide,
    ),
  );
}

export function updatePad(
  portfolio: Portfolio,
  padId: string,
  patch: Partial<PagePad>,
): Portfolio {
  const current = findPad(portfolio, padId);
  if (!current) return portfolio;
  // The id is never part of a patch: it is how the pad is found.
  const next = clampPad({ ...current, ...patch, id: current.id });
  if (padHas(next, current)) return portfolio;
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) =>
      slide.pads?.some((pad) => pad.id === padId)
        ? { ...slide, pads: slide.pads.map((pad) => (pad.id === padId ? next : pad)) }
        : slide,
    ),
  );
}

export function removePad(portfolio: Portfolio, padId: string): Portfolio {
  if (!findPad(portfolio, padId)) return portfolio;
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) =>
      slide.pads?.some((pad) => pad.id === padId)
        ? { ...slide, pads: slide.pads.filter((pad) => pad.id !== padId) }
        : slide,
    ),
  );
}

/** The pads on a page, oldest first, which is the order they are drawn in. */
export function padsOf(slide: PortfolioSlide): PagePad[] {
  return slide.pads ?? [];
}

/** Edits to the document's own words, which is all the cover page is. */
export function setPortfolioText(
  portfolio: Portfolio,
  patch: { title?: string; subtitle?: string; author?: string },
): Portfolio {
  if (blockHas(patch, portfolio as unknown as PortfolioBlock)) return portfolio;
  return { ...portfolio, ...patch, textMarks: clampMarkSlots(portfolio.textMarks, patch) };
}

/**
 * The frame ids the cover shows: the explicit choice, or the first three frames of the work.
 *
 * Shared so the file and the screen agree, and so an empty cover slot is *visible* as empty rather than
 * quietly filled from the document.
 */
/**
 * The cover's frames: the slots the author chose, or the first frames of the work.
 *
 * **Once the cover has slots, they are the cover** — the empty ones included, in the order they are stored.
 * This used to drop the empty strings and fall back to the work's first frames, which produced two bugs that
 * read as one: clearing a cover picture put it straight back (because the same picture was placed in a
 * section, and the fallback found it again), and clearing one of three shifted the other two along by a slot.
 * A slot you emptied is a frame you emptied; the card keeps the slot and offers to fill it again.
 *
 * An untouched cover — no `coverImages` at all — still shows the first frames of the work, so a new document's
 * cover is not a blank page, and dragging a picture into a section is what puts it there. Add a picture to the
 * cover, or clear one, and the cover becomes the author's own: from then on nothing about it follows the work.
 */
export function coverFrames(portfolio: Portfolio): string[] {
  if (portfolio.coverImages) return portfolio.coverImages.slice(0, COVER_SLOTS);
  return portfolio.projects
    .flatMap((project) => project.slides)
    .flatMap((slide) => slide.blocks)
    .flatMap((block) => block.images)
    .slice(0, COVER_SLOTS)
    .map((image) => image.id);
}

/** The cover's three slots: one array, so a slot can be filled in place. */
export const COVER_SLOTS = 3;

/** The slots the cover is showing now: its own if it has any, the work's first frames if it has none. */
function coverSlots(portfolio: Portfolio): string[] {
  return portfolio.coverImages ?? coverFrames(portfolio);
}

/**
 * Where a picture added *from the cover itself* lands: the first slot that is empty, else a new one.
 *
 * The first free slot rather than the last used one, so filling a hole fills that hole: with slots
 * `[a, "", c]`, adding used to overwrite `c` because the count of non-empty slots was two.
 */
export function nextCoverSlot(portfolio: Portfolio): number {
  const slots = coverSlots(portfolio);
  const free = slots.findIndex((id) => !id);
  if (free !== -1) return free;
  return Math.min(slots.length, COVER_SLOTS - 1);
}

/** Puts an image in a cover slot, keeping the other slots — and the slot count — as they were. */
export function setCoverImage(portfolio: Portfolio, index: number, imageId: string): Portfolio {
  const current = coverSlots(portfolio);
  const at = Math.max(0, Math.min(COVER_SLOTS - 1, index));
  // Never more slots than the cover had, never fewer than the one being filled: adding a picture must not
  // invent two empty frames beside it, and must not drop a slot that was showing something.
  const length = Math.max(1, Math.min(COVER_SLOTS, Math.max(current.length, at + 1)));
  const next = Array.from({ length }, (_, slot) => current[slot] ?? "");
  next[at] = imageId;
  return { ...portfolio, coverImages: next };
}

/**
 * Empties a cover slot, so the cover can be cleared rather than only added to.
 *
 * The slot stays — one empty slot, not three, and not zero — because an emptied slot is the same promise a
 * section's empty frame makes: the space is still there to put a picture in.
 */
export function clearCoverImage(portfolio: Portfolio, index: number): Portfolio {
  const current = coverSlots(portfolio);
  const at = Math.max(0, Math.min(COVER_SLOTS - 1, index));
  const length = Math.max(1, Math.min(COVER_SLOTS, Math.max(current.length, at + 1)));
  const next = Array.from({ length }, (_, slot) => current[slot] ?? "");
  next[at] = "";
  return { ...portfolio, coverImages: next };
}

/**
 * Two pieces of writing, one after the other.
 *
 * A blank line between them, because two paragraphs that were separate when they were saved should not
 * become one paragraph because they landed in the same section.
 */
export function appendText(existing: string | undefined, added: string): string {
  const first = (existing ?? "").trim();
  const second = added.trim();
  if (!first) return second;
  if (!second) return first;
  return `${first}\n\n${second}`;
}

/**
 * Adds a text module's words to a section's own words.
 *
 * The clipboard holds *words*, not content a section shows: dropping a paragraph onto a section adds it to
 * what is written there, which is what "place this text here" means. A picture is the other way round — it
 * becomes a frame, because a section shows pictures.
 */
export function appendTextToBlock(portfolio: Portfolio, blockId: string, text: string): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block) return portfolio;
  const body = appendText(block.body, text);
  // Nothing to add is not an edit, so it costs no undo step and changes no identity.
  if (body === (block.body ?? "")) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, body }));
}

/**
 * A new text section holding a text module, at the end of the page it was dropped on.
 *
 * Dropping on empty page space adds something rather than discarding the gesture — a page of writing can be
 * built by dragging paragraphs onto it, which is the other half of what the clipboard is for.
 */
export function addTextSection(portfolio: Portfolio, slideId: string, text: string): Portfolio {
  const body = text.trim();
  if (!body) return portfolio;
  const landing = portfolio.projects
    .flatMap((project) => project.slides)
    .find((slide) => slide.id === slideId);
  // A page that is not in the document is not an edit either: nothing to add to, so nothing changes.
  if (!landing) return portfolio;
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => {
      if (slide.id !== slideId) return slide;
      const block: PortfolioBlock = { ...createBlock("text"), body };
      return { ...slide, blocks: [...slide.blocks, block] };
    }),
  );
}

/**
 * Structural edits, as pure functions over a document.
 *
 * Each returns a new document, so the provider applies them through the same updater path as
 * everything else and the editor never mutates state in place. They live here rather than in the
 * page because they are the parts worth asserting: a delete that leaves a dangling reference, or a
 * move that loses a section, is a data bug rather than a layout one.
 */
function mapProjects(
  portfolio: Portfolio,
  update: (project: PortfolioProject) => PortfolioProject,
): Portfolio {
  return { ...portfolio, projects: portfolio.projects.map(update) };
}

function mapSlides(
  project: PortfolioProject,
  update: (slide: PortfolioSlide) => PortfolioSlide,
): PortfolioProject {
  return { ...project, slides: project.slides.map(update) };
}

export function removeBlock(portfolio: Portfolio, blockId: string): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => ({
      ...slide,
      blocks: slide.blocks.filter((block) => block.id !== blockId),
    })),
  );
}

/**
 * Removes a section and its page.
 *
 * A project is allowed to end up with no sections. It used to refuse, on the grounds that an empty
 * project would render an empty page — but it renders *no* page (the plan walks the slides), the
 * project stays in the list saying "0 sections", and the way to get one back is the Add a page button
 * that is right there. Refusing silently was worse: it read as "the delete button does not work",
 * which is exactly how it read.
 */
export function removeSlide(portfolio: Portfolio, slideId: string): Portfolio {
  return mapProjects(portfolio, (project) => ({
    ...project,
    slides: project.slides.filter((slide) => slide.id !== slideId),
  }));
}

export function removeProject(portfolio: Portfolio, projectId: string): Portfolio {
  return { ...portfolio, projects: portfolio.projects.filter((project) => project.id !== projectId) };
}

/** Moves a project up or down in the document. Unchanged at either end. */
export function moveProject(portfolio: Portfolio, projectId: string, direction: -1 | 1): Portfolio {
  const index = portfolio.projects.findIndex((project) => project.id === projectId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= portfolio.projects.length) return portfolio;
  const projects = [...portfolio.projects];
  [projects[index], projects[target]] = [projects[target], projects[index]];
  return { ...portfolio, projects };
}

/** Turns a page's fill on or off. */
export function setFillPage(portfolio: Portfolio, slideId: string, fillPage: boolean): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => (slide.id === slideId ? { ...slide, fillPage } : slide)),
  );
}

/** Sets how much room a block's frames take on its page. */
export function setBlockShape(portfolio: Portfolio, blockId: string, shape: FrameShape): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block || (block.shape ?? "standard") === shape) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, shape }));
}

export function renameSlide(portfolio: Portfolio, slideId: string, title: string): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => (slide.id === slideId ? { ...slide, title } : slide)),
  );
}

export function renameProject(portfolio: Portfolio, projectId: string, name: string): Portfolio {
  return mapProjects(portfolio, (project) =>
    project.id === projectId ? { ...project, name } : project,
  );
}

export function renameBlock(portfolio: Portfolio, blockId: string, title: string): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => ({
      ...slide,
      blocks: slide.blocks.map((block) => (block.id === blockId ? { ...block, title } : block)),
    })),
  );
}

/** Moves a section up or down within its project. Unchanged at either end. */
export function moveSlide(portfolio: Portfolio, slideId: string, direction: -1 | 1): Portfolio {
  return mapProjects(portfolio, (project) => {
    const index = project.slides.findIndex((slide) => slide.id === slideId);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= project.slides.length) return project;
    const slides = [...project.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    return { ...project, slides };
  });
}

/**
 * Moves a page next to another one, which is what dragging a page between two pages means.
 *
 * Expressed as "put this page before/after that page" rather than as an index, because an index is
 * only meaningful inside one project and the gesture is not: dropping a page between two pages of a
 * *different* project has to work too, or half the drops would silently do nothing. The caller names
 * two pages; this works out the projects and the arithmetic.
 *
 * Returns the same document when the move would not change anything, so dropping a page back where
 * it came from costs no undo step.
 */
export function moveSlideTo(
  portfolio: Portfolio,
  slideId: string,
  targetSlideId: string,
  position: "before" | "after" = "before",
): Portfolio {
  if (slideId === targetSlideId) return portfolio;
  const source = portfolio.projects.find((project) =>
    project.slides.some((slide) => slide.id === slideId),
  );
  const target = portfolio.projects.find((project) =>
    project.slides.some((slide) => slide.id === targetSlideId),
  );
  if (!source || !target) return portfolio;
  const moved = source.slides.find((slide) => slide.id === slideId)!;

  const anchor = target.slides.findIndex((slide) => slide.id === targetSlideId);
  // Landing after the anchor is one place further along — and one place *less* when the page is
  // coming out of the same list, because its own removal shifts everything after it up by one.
  const wanted = position === "after" ? anchor + 1 : anchor;
  const from = source.slides.findIndex((slide) => slide.id === slideId);
  const index = source.id === target.id && wanted > from ? wanted - 1 : wanted;
  if (source.id === target.id && index === from) return portfolio;

  return mapProjects(portfolio, (project) => {
    if (project.id !== source.id && project.id !== target.id) return project;
    const without = project.slides.filter((slide) => slide.id !== slideId);
    if (project.id !== target.id) return { ...project, slides: without };
    const at = Math.max(0, Math.min(index, without.length));
    return { ...project, slides: [...without.slice(0, at), moved, ...without.slice(at)] };
  });
}
export function moveBlock(portfolio: Portfolio, blockId: string, direction: -1 | 1): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => {
      const index = slide.blocks.findIndex((block) => block.id === blockId);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= slide.blocks.length) return slide;
      const blocks = [...slide.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      return { ...slide, blocks };
    }),
  );
}

/**
 * Groups a page's sections into rows, by width.
 *
 * The rule is the whole layout model, so it lives here rather than in either renderer: walk the
 * sections in order, adding each to the current row, and start a new row when the next one would
 * overrun the page. A full-width section is therefore always alone on its row, and four quarters
 * always share one — which is what makes "put four cards next to each other" the same statement as
 * "make each of them a quarter".
 */
export function rowsOf(blocks: PortfolioBlock[]): PortfolioBlock[][] {
  const rows: PortfolioBlock[][] = [];
  let row: PortfolioBlock[] = [];
  let used = 0;
  for (const block of blocks) {
    const span = blockSpan(block);
    if (row.length && used + span > GRID_SPAN) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(block);
    used += span;
    if (used >= GRID_SPAN) {
      rows.push(row);
      row = [];
      used = 0;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Which row a section is in, and where within it. Null when it is not on this page. */
export function blockPosition(
  blocks: PortfolioBlock[],
  blockId: string,
): { row: number; column: number } | null {
  const rows = rowsOf(blocks);
  for (let row = 0; row < rows.length; row += 1) {
    const column = rows[row].findIndex((block) => block.id === blockId);
    if (column !== -1) return { row, column };
  }
  return null;
}

/** Sets how much of the page's width a section takes. */
export function setBlockSpan(portfolio: Portfolio, blockId: string, span: number): Portfolio {
  const clamped = Math.max(1, Math.min(GRID_SPAN, Math.round(span)));
  const block = findBlock(portfolio, blockId);
  if (!block || blockSpan(block) === clamped) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, span: clamped }));
}

/** Sets how many frames sit side by side inside a section. */
export function setBlockColumns(
  portfolio: Portfolio,
  blockId: string,
  columns: 1 | 2 | 3 | 4,
): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block || (block.columns ?? 1) === columns) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, columns }));
}

/**
 * Sets how many frames a section expects, within 0–8.
 *
 * Lowering it below what is already placed is refused rather than obeyed: a count that silently
 * forgot the frames already in the section would look like data loss. Raising it commits the space
 * for pictures that have not arrived yet, which is the point of it.
 */
export function setBlockSlots(portfolio: Portfolio, blockId: string, slots: number): Portfolio {
  const wanted = Math.max(0, Math.min(8, Math.round(slots)));
  const block = findBlock(portfolio, blockId);
  if (!block) return portfolio;
  const next = Math.max(wanted, block.images.length);
  if (block.slots === next) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, slots: next }));
}

/**
 * Moves a section past the whole neighbouring row, which is what the up and down arrows do.
 *
 * Left and right move a section one place (`moveBlock`), which within a row *is* left and right; up
 * and down have to mean something else or they would be the same gesture twice. Jumping a row is
 * that something else, and it is the useful one: a half beside a half becomes a full-width section
 * above or below them in a single move.
 */
export function moveBlockAcrossRows(
  portfolio: Portfolio,
  blockId: string,
  direction: -1 | 1,
): Portfolio {
  const slide = portfolio.projects
    .flatMap((project) => project.slides)
    .find((candidate) => candidate.blocks.some((block) => block.id === blockId));
  if (!slide) return portfolio;
  const rows = rowsOf(slide.blocks);
  const where = blockPosition(slide.blocks, blockId);
  if (!where) return portfolio;
  const target = where.row + direction;
  if (target < 0 || target >= rows.length) return portfolio;

  // Land past the *far* side of that row, so the section genuinely changes row instead of burrowing
  // into the top of the next one and re-flowing straight back out.
  const anchorRow = rows[target];
  const anchor = anchorRow[direction === 1 ? anchorRow.length - 1 : 0];
  const anchorIndex = slide.blocks.findIndex((block) => block.id === anchor.id);
  return moveBlockTo(portfolio, blockId, direction === 1 ? anchorIndex + 1 : anchorIndex);
}

/** Moves a project to a given position in the document, which is what dragging one needs. */
export function moveProjectTo(
  portfolio: Portfolio,
  projectId: string,
  targetIndex: number,
): Portfolio {
  const from = portfolio.projects.findIndex((project) => project.id === projectId);
  if (from === -1) return portfolio;
  const to = Math.max(0, Math.min(targetIndex, portfolio.projects.length - 1));
  if (to === from) return portfolio;
  const projects = [...portfolio.projects];
  const [moved] = projects.splice(from, 1);
  projects.splice(to, 0, moved);
  return { ...portfolio, projects };
}

/**
 * Adds a page to a project. The title is a starting point, renameable in place.
 *
 * Returns the new page's id as well as the document so the caller can put the cursor on it — adding
 * a page and then having to hunt for it in the list is the small friction that makes an editor feel
 * like paperwork.
 */
export function addSlide(
  portfolio: Portfolio,
  projectId: string,
  title = "New page",
): { portfolio: Portfolio; slideId: string } {
  const id = shortId("sl");
  return {
    slideId: id,
    portfolio: mapProjects(portfolio, (project) =>
      project.id === projectId
        ? { ...project, slides: [...project.slides, { id, title, blocks: [] }] }
        : project,
    ),
  };
}

/**
 * Editing what is on the page, from the page.
 *
 * These are the edits you make while looking at the result: a caption, a heading, a number, where the
 * text sits. They live here rather than in the store because the store is the *library* — what a
 * photograph is, what a piece of writing says when nothing overrides it — while the page is the
 * document, and the document is what gets printed. Every one of them returns a new document, and a
 * no-op returns the same one, so undo records one step per edit and none for an accidental click.
 */
function mapBlock(
  portfolio: Portfolio,
  blockId: string,
  update: (block: PortfolioBlock) => PortfolioBlock,
): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => ({
      ...slide,
      blocks: slide.blocks.map((block) => (block.id === blockId ? update(block) : block)),
    })),
  );
}

/** Sets a section's heading and body. Empty strings are kept: clearing a heading is an edit too. */
export function setBlockText(
  portfolio: Portfolio,
  blockId: string,
  patch: { title?: string; body?: string; videoUrl?: string },
): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block || blockHas(patch, block)) return portfolio;
  // Marks are ranges over characters: if the words changed, the ranges are trimmed to the new text rather
  // than left pointing past the end of it.
  const marks = clampMarkSlots(block.textMarks, patch);
  return mapBlock(portfolio, blockId, (current) => ({ ...current, ...patch, textMarks: marks }));
}

/** A page's heading, standfirst and text. */
export function setSlideText(
  portfolio: Portfolio,
  slideId: string,
  patch: { title?: string; subtitle?: string; body?: string },
): Portfolio {
  const slide = portfolio.projects
    .flatMap((project) => project.slides)
    .find((entry) => entry.id === slideId);
  if (!slide || blockHas(patch as Partial<PortfolioBlock>, slide as unknown as PortfolioBlock)) {
    return portfolio;
  }
  const marks = clampMarkSlots(slide.textMarks, patch);
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (entry) =>
      entry.id === slideId ? { ...entry, ...patch, textMarks: marks } : entry,
    ),
  );
}

/**
 * Types a caption onto the page for one image.
 *
 * Held on the block by image id rather than written back to the store, so improving a description for
 * *this* page cannot change the three other pages showing the same photograph. Clearing it (an empty
 * string) is stored deliberately, which is how a page says "no caption here" over the store's default.
 */
export function setBlockCaption(
  portfolio: Portfolio,
  blockId: string,
  imageId: string,
  caption: string,
): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block || block.captions?.[imageId] === caption) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({
    ...current,
    captions: { ...(current.captions ?? {}), [imageId]: caption },
  }));
}

/** Types a number onto the page, and marks the section as owning its own numbers from now on. */
export function setBlockMetric(
  portfolio: Portfolio,
  blockId: string,
  index: number,
  patch: { label?: string; value?: string },
): Portfolio {
  const block = findBlock(portfolio, blockId);
  const metric = block?.metrics?.[index];
  if (!block || !metric || blockHas(patch as Partial<PortfolioBlock>, metric as unknown as PortfolioBlock)) {
    return portfolio;
  }
  return mapBlock(portfolio, blockId, (current) => ({
    ...current,
    metricsEdited: true,
    metrics: (current.metrics ?? []).map((entry, position) =>
      position === index ? { ...entry, ...patch } : entry,
    ),
  }));
}

/** Where the section's text sits relative to its frames. */
export function setBlockTextPlacement(
  portfolio: Portfolio,
  blockId: string,
  textPlacement: NonNullable<PortfolioBlock["textPlacement"]>,
): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block || (block.textPlacement ?? "below") === textPlacement) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, textPlacement }));
}

/** How the body is set: a paragraph, a lead line, or bullets. */
export function setBlockBodyStyle(
  portfolio: Portfolio,
  blockId: string,
  bodyStyle: NonNullable<PortfolioBlock["bodyStyle"]>,
): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block || (block.bodyStyle ?? "paragraph") === bodyStyle) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, bodyStyle }));
}

/**
 * The style map with one slot set, or cleared.
 *
 * A cleared slot is *absent* rather than an explicit "none", which is what makes an untouched document
 * indistinguishable from one whose styles were set and then taken off again. An empty map is dropped
 * entirely, so a section nobody has styled carries no field at all.
 */
function withTextStyle(
  map: TextStyleMap | undefined,
  slot: TextStyleSlot,
  style: TextStyleId | null,
): TextStyleMap | undefined {
  const next: TextStyleMap = { ...(map ?? {}) };
  if (style) next[slot] = style;
  else delete next[slot];
  return Object.keys(next).length ? next : undefined;
}

/** Whether two style maps say the same thing, so a no-op costs no undo step. */
function sameTextStyles(a: TextStyleMap | undefined, b: TextStyleMap | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Sets a section's text style by hand, or clears it back to the drawn default.
 *
 * `slot` is which text: `title`, `body` or `caption`. The six styles are in `lib/textStyles.ts`, and they
 * carry the format rather than a size, which is the point — you choose "the PORTFOLIO tag" and the words
 * are set as a tag, on screen and on paper, without touching a font size anywhere.
 */
export function setBlockTextStyle(
  portfolio: Portfolio,
  blockId: string,
  slot: TextStyleSlot,
  style: TextStyleId | null,
): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block) return portfolio;
  const next = withTextStyle(block.textStyles, slot, style);
  if (sameTextStyles(block.textStyles, next)) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, textStyles: next }));
}

/** Sets a page's own heading or line of text style by hand, or clears it. */
export function setSlideTextStyle(
  portfolio: Portfolio,
  slideId: string,
  slot: TextStyleSlot,
  style: TextStyleId | null,
): Portfolio {
  const slide = portfolio.projects.flatMap((project) => project.slides).find((s) => s.id === slideId);
  if (!slide) return portfolio;
  const next = withTextStyle(slide.textStyles, slot, style);
  if (sameTextStyles(slide.textStyles, next)) return portfolio;
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (entry) => (entry.id === slideId ? { ...entry, textStyles: next } : entry)),
  );
}

/** Sets the document's own words — the cover's title and tag — or clears them. */
export function setPortfolioTextStyle(
  portfolio: Portfolio,
  slot: TextStyleSlot,
  style: TextStyleId | null,
): Portfolio {
  const next = withTextStyle(portfolio.textStyles, slot, style);
  if (sameTextStyles(portfolio.textStyles, next)) return portfolio;
  return { ...portfolio, textStyles: next };
}

/**
 * One slot's marks, set or dropped: absent when there are none, like every other empty field here.
 */
function withTextMarks(
  map: TextMarkMap | undefined,
  slot: TextStyleSlot,
  marks: TextStyleRange[] | undefined,
): TextMarkMap | undefined {
  const next: TextMarkMap = { ...(map ?? {}) };
  if (marks?.length) next[slot] = marks;
  else delete next[slot];
  return Object.keys(next).length ? next : undefined;
}

/** Marks trimmed to the text they belong to, after that text changed. */
function clampMarkSlots(
  marks: TextMarkMap | undefined,
  patch: { title?: string; subtitle?: string; body?: string },
): TextMarkMap | undefined {
  let next = marks;
  for (const slot of ["title", "subtitle", "body"] as const) {
    if (patch[slot] === undefined) continue;
    next = withTextMarks(next, slot, clampMarks(next?.[slot], patch[slot]!.length));
  }
  return next;
}

/**
 * Sets a style over a range of one slot's text, or clears it — the one control behind the style dropdown.
 *
 * The rule that keeps it to one control rather than two: a range that covers the whole text is stored as
 * the *slot's* style, and anything shorter as a mark. So "highlight the whole heading, pick label" and
 * "style the heading" are the same stored thing, which is what lets the dropdown mean one thing whatever
 * is highlighted. It also makes whole-slot styling survive later edits for free — a range would have to be
 * re-anchored, and a slot style cannot be.
 */
function withRangeStyle<T extends { textStyles?: TextStyleMap; textMarks?: TextMarkMap }>(
  owner: T,
  slot: TextStyleSlot,
  text: string,
  range: { start: number; end: number } | undefined,
  style: TextStyleId | null,
): T {
  const whole = !range || (range.start <= 0 && range.end >= text.length);
  if (whole) {
    return { ...owner, textStyles: withTextStyle(owner.textStyles, slot, style), textMarks: clearMarks(owner.textMarks, slot) };
  }
  return {
    ...owner,
    textMarks: withTextMarks(owner.textMarks, slot, applyMark(owner.textMarks?.[slot], range, style)),
  };
}

/**
 * Styles part of a section's text — what highlighting a word and choosing from the dropdown does.
 */
export function setBlockTextMark(
  portfolio: Portfolio,
  blockId: string,
  slot: TextStyleSlot,
  range: { start: number; end: number } | undefined,
  style: TextStyleId | null,
  /** The string the range refers to, when it is not the slot's own field: a caption lives per photograph. */
  text?: string,
): Portfolio {
  const block = findBlock(portfolio, blockId);
  if (!block) return portfolio;
  const own =
    slot === "title"
      ? block.title ?? ""
      : slot === "body"
        ? block.body ?? ""
        : slot === "caption"
          ? text ?? block.images[0]?.caption ?? ""
          : "";
  const next = withRangeStyle(block, slot, text ?? own, range, style);
  if (sameTextStyles(block.textStyles, next.textStyles) && sameMarks(block.textMarks, next.textMarks)) {
    return portfolio;
  }
  return mapBlock(portfolio, blockId, () => next);
}

/** Styles part of a page's own words. */
export function setSlideTextMark(
  portfolio: Portfolio,
  slideId: string,
  slot: TextStyleSlot,
  range: { start: number; end: number } | undefined,
  style: TextStyleId | null,
): Portfolio {
  const slide = portfolio.projects.flatMap((project) => project.slides).find((s) => s.id === slideId);
  if (!slide) return portfolio;
  const text =
    slot === "title" ? slide.title : slot === "subtitle" ? slide.subtitle ?? "" : slide.body ?? "";
  const next = withRangeStyle(slide, slot, text, range, style);
  if (sameTextStyles(slide.textStyles, next.textStyles) && sameMarks(slide.textMarks, next.textMarks)) {
    return portfolio;
  }
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (entry) => (entry.id === slideId ? next : entry)),
  );
}

/** Styles part of the document's own words: the cover's title and its tag. */
export function setPortfolioTextMark(
  portfolio: Portfolio,
  slot: TextStyleSlot,
  range: { start: number; end: number } | undefined,
  style: TextStyleId | null,
): Portfolio {
  const text =
    slot === "title" ? portfolio.title : slot === "subtitle" ? portfolio.subtitle ?? "" : "";
  const next = withRangeStyle(portfolio, slot, text, range, style);
  if (sameTextStyles(portfolio.textStyles, next.textStyles) && sameMarks(portfolio.textMarks, next.textMarks)) {
    return portfolio;
  }
  return next;
}

/** Whether two mark maps say the same thing, so a no-op costs no undo step. */
function sameMarks(a: TextMarkMap | undefined, b: TextMarkMap | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Types a before/after label on the pair itself.
 *
 * These live on the section rather than on the flip pages that show them, because one section can own
 * two pages and a label belongs to the comparison, not to a page — flip it and each half still says
 * which half it is.
 */
export function setBlockLabel(
  portfolio: Portfolio,
  blockId: string,
  side: "before" | "after",
  label: string,
): Portfolio {
  const block = findBlock(portfolio, blockId);
  const key = side === "before" ? "beforeLabel" : "afterLabel";
  if (!block || (block[key] ?? (side === "before" ? "Before" : "After")) === label) return portfolio;
  return mapBlock(portfolio, blockId, (current) => ({ ...current, [key]: label }));
}

/**
 * Places an asset into a given frame of a section.
 *
 * Distinct from `placeAsset`, which appends: a picture imported straight into frame three of four has
 * to land in frame three, or the act of filling a hole would rearrange the page around it. The index
 * is a position in `assetIds`, which is what the frames are generated from, so for the usual
 * one-image-per-asset case it is the frame number exactly.
 */
export function placeAssetAt(
  portfolio: Portfolio,
  blockId: string,
  assetId: string,
  index: number,
): Portfolio {
  return mapBlock(portfolio, blockId, (block) => {
    const ids = (block.assetIds ?? []).filter((id) => id !== assetId);
    const at = Math.max(0, Math.min(index, ids.length));
    return { ...block, assetIds: [...ids.slice(0, at), assetId, ...ids.slice(at)] };
  });
}

/**
 * Moves a section onto another page, in this project or another one.
 *
 * The last thing that makes the layout fully rearrangeable: a page can be rebuilt by moving its
 * sections rather than by deleting them and starting again. Index is the position among the target
 * page's sections; the section lands at the end when it is past the end, which is what dropping on
 * empty space means.
 */
export function moveBlockToPage(
  portfolio: Portfolio,
  blockId: string,
  targetSlideId: string,
  index?: number,
): Portfolio {
  const source = portfolio.projects
    .flatMap((project) => project.slides)
    .find((slide) => slide.blocks.some((block) => block.id === blockId));
  if (!source || source.id === targetSlideId) {
    // Same page: this is a reorder, which `moveBlockTo` owns.
    if (source && index !== undefined) return moveBlockTo(portfolio, blockId, index);
    return portfolio;
  }
  const moved = source.blocks.find((block) => block.id === blockId);
  if (!moved) return portfolio;
  const target = portfolio.projects
    .flatMap((project) => project.slides)
    .find((slide) => slide.id === targetSlideId);
  if (!target) return portfolio;

  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => {
      if (slide.id === source.id) {
        return { ...slide, blocks: slide.blocks.filter((block) => block.id !== blockId) };
      }
      if (slide.id !== targetSlideId) return slide;
      const at = Math.max(0, Math.min(index ?? slide.blocks.length, slide.blocks.length));
      return { ...slide, blocks: [...slide.blocks.slice(0, at), moved, ...slide.blocks.slice(at)] };
    }),
  );
}

/** Moves a block to a given position within its section, which is what drag-to-reorder needs.
 *
 * Separate from `moveBlock` (one step up or down) because a drag lands somewhere specific, and a
 * sequence of one-step moves would push a history entry per step and make undo feel broken.
 */
export function moveBlockTo(portfolio: Portfolio, blockId: string, targetIndex: number): Portfolio {
  // Whether this would change anything is decided first, on the identifier: returning the *same*
  // document for a drop that changes nothing is what stops the provider recording an undo step, so
  // "drag it back where it was" cannot fill the history with no-ops.
  const slide = portfolio.projects
    .flatMap((project) => project.slides)
    .find((candidate) => candidate.blocks.some((block) => block.id === blockId));
  if (!slide) return portfolio;
  const from = slide.blocks.findIndex((block) => block.id === blockId);
  const to = Math.max(0, Math.min(targetIndex, slide.blocks.length - 1));
  if (to === from) return portfolio;

  return mapProjects(portfolio, (project) =>
    mapSlides(project, (candidate) => {
      const index = candidate.blocks.findIndex((block) => block.id === blockId);
      if (index === -1) return candidate;
      const blocks = [...candidate.blocks];
      const [moved] = blocks.splice(index, 1);
      blocks.splice(to, 0, moved);
      return { ...candidate, blocks };
    }),
  );
}

/**
 * The plan in words, for the editor header.
 *
 * "cover + 4 pages + 1 wide row" rather than a list of page kinds: the old form spelled out
 * `cover,project,project,project` and told a reader nothing they could act on.
 */
export function pageSummary(pages: PlannedPage[]): string {
  const counts: Record<PlannedPageKind, number> = { cover: 0, project: 0, filmstrip: 0, flip: 0 };
  for (const page of pages) counts[page.kind] += 1;

  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const parts: string[] = [];
  if (counts.cover) parts.push("cover");
  if (counts.project) parts.push(plural(counts.project, "page", "pages"));
  if (counts.flip) parts.push(plural(counts.flip, "flip page", "flip pages"));
  if (counts.filmstrip) parts.push(plural(counts.filmstrip, "wide row", "wide rows"));
  return parts.join(" + ");
}
export function unplaceAsset(portfolio: Portfolio, blockId: string, assetId: string): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => ({
      ...slide,
      blocks: slide.blocks.map((block) =>
        block.id === blockId
          ? { ...block, assetIds: (block.assetIds ?? []).filter((id) => id !== assetId) }
          : block,
      ),
    })),
  );
}

/** Adds an asset to a section, keeping the order the caller chose. */
export function placeAsset(portfolio: Portfolio, blockId: string, assetId: string): Portfolio {
  return mapProjects(portfolio, (project) =>
    mapSlides(project, (slide) => ({
      ...slide,
      blocks: slide.blocks.map((block) =>
        block.id === blockId ? { ...block, assetIds: [...(block.assetIds ?? []), assetId] } : block,
      ),
    })),
  );
}

/** Every asset id the document already places, anywhere. */
export function placedIds(portfolio: Portfolio): string[] {
  const ids = new Set<string>();
  for (const project of portfolio.projects) {
    for (const slide of project.slides) {
      for (const block of slide.blocks) {
        for (const id of block.assetIds ?? []) ids.add(id);
      }
    }
  }
  return [...ids];
}

/**
 * A companion is never arranged on its own.
 *
 * It travels with the media it belongs to, so it is accounted for when its host is — whether the
 * host is already in the document or is being placed by this same call. The tie is stored on the
 * host, so it has to be read from the host's side; reading it from the companion's side finds
 * nothing and every caption in the store gets pulled out of its photograph.
 */
function coveredCompanions(
  library: MediaLibrary,
  already: Set<string>,
  incoming: Set<string>,
): Set<string> {
  const covered = new Set<string>();
  for (const asset of library.assets) {
    if (!already.has(asset.id) && !incoming.has(asset.id)) continue;
    for (const companionId of asset.companionIds ?? []) covered.add(companionId);
  }
  return covered;
}

/**
 * Assets the document does not show anywhere yet, with companions accounted for.
 *
 * Exported because the editor needs to say how much work is waiting before offering to place it —
 * and because "unplaced" has to mean the same thing here and in `arrangeUnplaced`, or the button
 * would promise a number the action does not deliver.
 */
export function unplacedAssets(portfolio: Portfolio, library: MediaLibrary): MediaAsset[] {
  const already = new Set(placedIds(portfolio));
  const candidates = library.assets.filter((asset) => !already.has(asset.id));
  const incoming = new Set(candidates.map((asset) => asset.id));
  const covered = coveredCompanions(library, already, incoming);
  return candidates.filter((asset) => !covered.has(asset.id));
}

/**
 * The macro step: give every asset that has no home yet one, at the end of a project.
 *
 * This is what makes "load everything first" work. Import a shoot, press this, and the document
 * grows sections holding all of it — pairs as comparisons, frames in wide rows of four, captions
 * and numbers into one section each — so composing becomes rearranging and cutting rather than
 * hunting for what never got placed.
 */
export function arrangeUnplaced(
  portfolio: Portfolio,
  library: MediaLibrary,
  projectId?: string,
): { portfolio: Portfolio; placed: number } {
  const unplaced = unplacedAssets(portfolio, library);
  if (!unplaced.length) return { portfolio, placed: 0 };

  const pairs = unplaced.filter((asset) => asset.kind === "pair");
  const images = unplaced.filter((asset) => asset.kind !== "pair" && asset.images.length > 0);
  const texts = unplaced.filter((asset) => Boolean(asset.text));
  const metrics = unplaced.filter((asset) => Boolean(asset.metric));
  const stamp = `mx-${Date.now().toString(36)}`;
  const slides: PortfolioSlide[] = [];

  pairs.forEach((pair, index) => {
    slides.push({
      id: `${stamp}-pair${index}`,
      title: pair.name,
      blocks: [
        createBlock("pair", { presentation: "pair-side", title: pair.name, assetIds: [pair.id] }),
      ],
    });
  });
  for (let start = 0; start < images.length; start += 4) {
    slides.push({
      id: `${stamp}-row${start}`,
      title: "Unplaced work",
      body: "Imported frames that have not been given a section yet.",
      blocks: [
        createBlock("image", {
          presentation: "filmstrip",
          title: "Unplaced work",
          assetIds: images.slice(start, start + 4).map((asset) => asset.id),
        }),
      ],
    });
  }
  if (texts.length) {
    slides.push({
      id: `${stamp}-text`,
      title: "Unplaced notes",
      blocks: [
        createBlock("image", {
          presentation: "copy",
          title: "Unplaced notes",
          assetIds: texts.map((asset) => asset.id),
        }),
      ],
    });
  }
  if (metrics.length) {
    slides.push({
      id: `${stamp}-metrics`,
      title: "Unplaced numbers",
      blocks: [
        createBlock("image", {
          presentation: "metrics",
          title: "Unplaced numbers",
          assetIds: metrics.map((asset) => asset.id),
        }),
      ],
    });
  }

  const target = projectId
    ? portfolio.projects.find((project) => project.id === projectId)
    : portfolio.projects[portfolio.projects.length - 1];

  if (!target) {
    const project: PortfolioProject = {
      id: `pr-${Date.now().toString(36)}`,
      name: "Unplaced work",
      summary: "Everything imported and not yet given a section.",
      slides,
    };
    return {
      portfolio: { ...portfolio, projects: [...portfolio.projects, project] },
      placed: unplaced.length,
    };
  }

  return {
    portfolio: mapProjects(portfolio, (project) =>
      project.id === target.id ? { ...project, slides: [...project.slides, ...slides] } : project,
    ),
    placed: unplaced.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Page geometry                                                              */
/* -------------------------------------------------------------------------- */

export interface PageGeometry {
  label: string;
  width: number;
  height: number;
  /** What this size is for. */
  note: string;
}

/**
 * Page sizes in PDF points (72 per inch).
 *
 * `wide` exists specifically for filmstrips: three 5.4in frames in a row cannot fit on
 * letter, and squeezing them there is what makes portfolio PDFs look like thumbnails.
 * `slide` is a 16:9 presentation page for people who present from the file.
 */
export const PAGE_SIZES: Record<PortfolioPageSize, PageGeometry> = {
  letter: { label: "Letter 8.5×11in", width: 612, height: 792, note: "Default. Prints anywhere." },
  tabloid: { label: "Tabloid 11×17in", width: 792, height: 1224, note: "Large-format spreads." },
  wide: { label: "Wide 17×11in", width: 1224, height: 792, note: "Filmstrips and contact sheets." },
  slide: { label: "Slide 10×5.6in", width: 720, height: 405, note: "16:9 for presenting on screen." },
};

/** The wide page used for filmstrip rows, whichever base size is set. */
export function filmstripGeometry(base: PortfolioPageSize): PageGeometry {
  return base === "slide" ? PAGE_SIZES.slide : PAGE_SIZES.wide;
}

/* -------------------------------------------------------------------------- */
/* Capability matrix                                                          */
/* -------------------------------------------------------------------------- */

export type SupportLevel = "universal" | "common" | "acrobat" | "none";

export interface Capability {
  feature: string;
  level: SupportLevel;
  how: string;
  caveat: string;
}

export const SUPPORT_LABELS: Record<SupportLevel, string> = {
  universal: "Every viewer",
  common: "Most viewers",
  acrobat: "Acrobat-class only",
  none: "Not possible in PDF",
};

/**
 * What a PDF can and cannot do, stated once, honestly.
 *
 * This exists because a portfolio is where people ask for web behaviour from a
 * document format, and the difference between "works in Chrome, Preview, Acrobat and
 * on a phone" and "plays only in desktop Acrobat" changes what you should build. The
 * UI renders this table and the tests assert it, so a claim cannot drift away from the
 * implementation without failing.
 */
export const PORTFOLIO_CAPABILITIES: Capability[] = [
  {
    feature: "Images, crops and captions",
    level: "universal",
    how: "The cropped pixels are baked into the page as an image XObject.",
    caveat: "Nothing to worry about — this is what PDF is for.",
  },
  {
    feature: "Slide-to-slide navigation",
    level: "universal",
    how: "Clickable link annotations plus outline bookmarks.",
    caveat: "Chrome and Preview show links; bookmarks need a viewer with a nav pane.",
  },
  {
    feature: "Horizontal slide rows (filmstrip)",
    level: "universal",
    how: "Several frames laid out across a wide 17×11in page.",
    caveat: "Reads as a horizontal strip in any viewer. Frames shrink as you add them.",
  },
  {
    feature: "Mark-up drawn on the page",
    level: "universal",
    how: "Vector shapes and callouts drawn into the content stream.",
    caveat: "Visible everywhere, but it is part of the artwork — not separately editable.",
  },
  {
    feature: "Mark-up as real annotations",
    level: "common",
    how: "PDF annotation dictionaries (Square, Highlight, Ink, FreeText, Stamp).",
    caveat: "Acrobat, Foxit, Bluebeam and Preview show and edit these. Chrome's viewer and most phone viewers ignore annotations.",
  },
  {
    feature: "Page transitions",
    level: "acrobat",
    how: "A /Trans glide patched into each page dictionary after rendering, so a before/after flip wipes sideways instead of cutting.",
    caveat: "Acrobat and Foxit animate it. Everywhere else the page simply changes — which is why the flip halves are also numbered pages that read on their own.",
  },
  {
    feature: "Before/after slider you can drag",
    level: "none",
    how: "No mechanism exists.",
    caveat: "PDF has no drag widget and no continuous pointer events. Use the labelled side-by-side pair for a like-for-like comparison, or the two-page flip that glides in presentation mode.",
  },
  {
    feature: "Video playback",
    level: "acrobat",
    how: "An embedded H.264 asset in a RichMedia annotation.",
    caveat: "Acrobat only. Chrome, Preview, iOS and Android show nothing at all, so the poster frame and a link have to carry the meaning on their own.",
  },
];

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

export type PlannedPageKind = "cover" | "project" | "filmstrip" | "flip";

/** One half of a before/after flip: its own page, so the wipe has something to reveal. */
export interface PlannedFlipHalf {
  pairId: string;
  side: "before" | "after";
  label: string;
  image: PortfolioImageRef;
  /** Kept identical across the two halves so the change reads as a wipe, not a jump. */
  caption?: string;
}

export interface PlannedPage {
  id: string;
  kind: PlannedPageKind;
  /** Page geometry in points. */
  width: number;
  height: number;
  /** Outline entry, so a viewer's nav pane lists the projects. */
  bookmark: string;
  title: string;
  subtitle?: string;
  body?: string;
  /** The cover's author line, kept separate so it can be edited on the cover itself. */
  author?: string;
  /**
   * The cover's contact block, assembled from the document.
   *
   * Planned here rather than read by each renderer, for the same reason `fillPage` is: the plan is the single
   * description of the page, so the file and the screen cannot put the email in a different order or leave the
   * links off one of them.
   */
  tagline?: string;
  contactLine?: string;
  links?: PortfolioLink[];
  projectIndex: number;
  pageNumber: number;
  blocks: PortfolioBlock[];
  /** Spread this page's sections over its height rather than packing them at the top. */
  fillPage?: boolean;
  /**
   * The pads behind this page's sections, in draw order.
   *
   * Carried on the plan rather than read from the document by each renderer, for the same reason
   * `fillPage` is: the plan is the single description of the page, and the file and the screen both
   * work from it.
   */
  pads?: PagePad[];
  /** Filmstrip pages carry their frames here rather than as blocks. */
  frames?: PortfolioImageRef[];
  /** Flip pages carry one half of a before/after pair. */
  flip?: PlannedFlipHalf;
  /**
   * The styles this page's own words are set in, carried on the plan.
   *
   * Carried rather than read from the document by the renderer, for the same reason the pads are: a flip
   * page's heading *is* a section's heading, and the plan is the one place that knows it. The slots are
   * the plan's own — a cover's `title` is a headline, a page's `title` is a header — so the renderer and
   * the workspace resolve them the same way without either re-deriving where the page came from.
   */
  textStyles?: TextStyleMap;
  /** Styles laid over parts of the page's own words, carried for the same reason. */
  textMarks?: TextMarkMap;
}

/** Frames per wide page before a strip wraps. */
export const FILMSTRIP_MAX_PER_ROW = 4;

function shortId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Which of a section's text slots each slot of a page it *owns* is drawn from.
 *
 * A flip half's big line is the half's own label — part of the pair's apparatus, like a page number — and
 * the line under it is the section's heading, which is why the section's `title` becomes the page's
 * `subtitle`. A filmstrip row's heading and line are the section's too. Written down once, because the
 * styles *and* the marks both travel this way.
 */
const FLIP_TEXT_SLOTS: Partial<Record<TextStyleSlot, TextStyleSlot>> = {
  subtitle: "title",
  body: "body",
  caption: "caption",
};
const STRIP_TEXT_SLOTS: Partial<Record<TextStyleSlot, TextStyleSlot>> = {
  title: "title",
  body: "body",
};

/** A section's slot-keyed values, remapped to the slots of a page it owns. */
function mapTextSlots<T>(
  source: Partial<Record<TextStyleSlot, T>> | undefined,
  slots: Partial<Record<TextStyleSlot, TextStyleSlot>>,
): Partial<Record<TextStyleSlot, T>> | undefined {
  if (!source) return undefined;
  const next: Partial<Record<TextStyleSlot, T>> = {};
  for (const [slot, from] of Object.entries(slots) as [TextStyleSlot, TextStyleSlot][]) {
    const value = source[from];
    if (value !== undefined) next[slot] = value;
  }
  return Object.keys(next).length ? next : undefined;
}

/** The styles and marks a flip half's own words are set in, taken from the section that owns it. */
function flipPageStyles(block: PortfolioBlock) {
  return {
    textStyles: mapTextSlots(block.textStyles, FLIP_TEXT_SLOTS),
    textMarks: mapTextSlots(block.textMarks, FLIP_TEXT_SLOTS),
  };
}

/** The same, for a filmstrip row. */
function stripPageStyles(block: PortfolioBlock) {
  return {
    textStyles: mapTextSlots(block.textStyles, STRIP_TEXT_SLOTS),
    textMarks: mapTextSlots(block.textMarks, STRIP_TEXT_SLOTS),
  };
}

/** The block that owns a page, when the page is one of a section's own. */
export function pageBlockId(pageId: string): string | undefined {
  return blocksOnPage(pageId) ? undefined : pageId.split(":")[2];
}

/**
 * Whether a page holds its slide's sections, as opposed to being one a section owns.
 *
 * The two shapes are `${projectId}:${slideId}` and `${projectId}:${slideId}:${blockId}:${half}` — four
 * parts for a flip half or a filmstrip row, two for a page of sections. Written down once because three
 * places now depend on telling them apart: the planner, the page's text and the layout picker.
 */
export function blocksOnPage(pageId: string): boolean {
  return pageId.split(":").length === 2;
}

/**
 * An empty portfolio to start editing from.
 *
 * Carries sensible defaults rather than blanks: the interactivity settings are the
 * ones that cannot hurt, since a viewer that ignores them still shows every page.
 */
export function createPortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: shortId("pf"),
    title: "Selected Work",
    subtitle: "Portfolio",
    author: "",
    updatedAt: new Date().toISOString(),
    pageSize: "letter",
    projects: [],
    transitions: true,
    annotate: true,
    navigable: true,
    ...overrides,
  };
}

export function createSlide(title: string): PortfolioSlide {
  return { id: shortId("sl"), title, blocks: [] };
}

export function createProject(name: string): PortfolioProject {
  return { id: shortId("pr"), name, slides: [createSlide("Overview")] };
}

export function createBlock(
  kind: PortfolioBlock["kind"],
  overrides: Partial<PortfolioBlock> = {},
): PortfolioBlock {
  const base: PortfolioBlock = { id: shortId("bl"), kind, images: [], annotations: [] };
  switch (kind) {
    case "pair":
      // No label defaults here on purpose. A label stored on the block is an instruction, and
      // one that is merely the default would mask the before/after labels held by a stored
      // pair asset. The defaults are applied where the pair is drawn and planned instead.
      return { ...base, columns: 2, ...overrides };
    case "filmstrip":
      return { ...base, title: "Walkthrough", ...overrides };
    case "metrics":
      return {
        ...base,
        metrics: [
          { label: "Clashes resolved", value: "1,240" },
          { label: "Weeks saved", value: "6" },
        ],
        ...overrides,
      };
    case "video":
      return { ...base, title: "Walkthrough video", videoPoster: null, ...overrides };
    default:
      return { ...base, columns: 1, ...overrides };
  }
}

/**
 * The cover's frames as references, for the plan.
 *
 * Resolved from the document's own images where possible, and invented where not — an id whose picture
 * is missing from the store still reserves its frame, which is the same rule every other frame follows.
 */
function coverRefs(portfolio: Portfolio): PortfolioImageRef[] {
  const all = portfolio.projects
    .flatMap((project) => project.slides)
    .flatMap((slide) => slide.blocks)
    .flatMap((block) => block.images);
  return coverFrames(portfolio).map(
    (id) =>
      all.find((image) => image.id === id) ?? {
        id,
        name: "cover",
        width: 0,
        height: 0,
        crop: { x: 0, y: 0, w: 1, h: 1 },
      },
  );
}

/**
 * Lays a portfolio out across pages.
 *
 * Rules, in order:
 *  - a cover page, always;
 *  - one page per slide, because a slide is the unit a reader thinks in;
 *  - a filmstrip block takes a page of its own on the wide geometry, since a row of
 *    frames is the whole point of that page and cannot share space with prose;
 *  - a strip longer than four frames wraps onto another wide page rather than
 *    shrinking the frames into thumbnails.
 */
export function planPortfolio(portfolio: Portfolio, library?: MediaLibrary): PlannedPage[] {
  // Content is resolved from the store and each section's chosen presentation is applied
  // before planning, so everything below works on plain blocks and the page plan stays the
  // single description of what the PDF will contain.
  const resolved = resolvePortfolio(portfolio, library);
  const base = PAGE_SIZES[resolved.pageSize] ?? PAGE_SIZES.letter;
  const pages: PlannedPage[] = [];

  pages.push({
    id: "cover",
    kind: "cover",
    width: base.width,
    height: base.height,
    bookmark: resolved.title,
    title: resolved.title,
    subtitle: resolved.subtitle,
    // The author is its own field rather than part of the meta line, so the cover can be edited on the
    // cover: the title, the standfirst and the name are three separate things a reader sees.
    author: resolved.author,
    // The rest of the cover's contact block, assembled once so both surfaces draw the same thing — and left
    // undefined when there is nothing, so a cover with no contact details adds no line at all.
    tagline: resolved.contact?.tagline,
    contactLine: contactLine(resolved.contact) || undefined,
    links: resolved.contact?.links,
    body: resolved.projects.length
      ? `${resolved.projects.length} project${resolved.projects.length === 1 ? "" : "s"}${
          resolved.projects[0] ? ` · ${resolved.projects[0].name}` : ""
        }`
      : "",
    projectIndex: -1,
    pageNumber: 1,
    blocks: [],
    // The cover's frames, chosen or derived: carried on the plan so the screen and the file draw the
    // same three frames, and so a slot can be filled or emptied from either side.
    frames: coverRefs(resolved),
    textStyles: resolved.textStyles,
    textMarks: resolved.textMarks,
  });

  resolved.projects.forEach((project, projectIndex) => {
    project.slides.forEach((slide, slideIndex) => {
      // A flipped pair and a filmstrip each own their pages, so neither is also drawn inline —
      // otherwise the reader sees the same change twice.
      const inlineBlocks = slide.blocks.filter(
        (block) => block.kind !== "filmstrip" && !(block.kind === "pair" && block.pairMode === "flip"),
      );
      // A section with nothing left to draw inline gets no page of its own: whatever it holds is
      // already on the pages it owns. The test is whether the page would show *anything* beyond its
      // heading — a body is real content and keeps the page, a bare title does not, because the
      // owned pages carry the title themselves. Without this, a flip or a filmstrip section
      // contributed a page with nothing but a heading in front of its content.
      const hasOwnText = Boolean(slide.body?.trim());
      // A page with no sections at all is still a page: it is where the next section goes. Hiding it
      // would make "Add a page" look like it did nothing, which is the same dead end as a delete
      // button that silently refuses. A flip or a filmstrip section does have blocks — they are just
      // drawn on the pages they own — so this cannot resurrect the heading-only page above.
      const isBlankPage = slide.blocks.length === 0;
      if (inlineBlocks.length || hasOwnText || isBlankPage) {
        pages.push({
          id: `${project.id}:${slide.id}`,
          kind: "project",
          width: base.width,
          height: base.height,
          bookmark: slideIndex === 0 ? project.name : `${project.name} — ${slide.title}`,
          title: slide.title,
          subtitle: slide.subtitle ?? (slideIndex === 0 ? project.name : undefined),
          body: slide.body ?? (slideIndex === 0 ? project.summary : undefined),
          projectIndex,
          pageNumber: pages.length + 1,
          blocks: inlineBlocks,
          // Carried onto the page so the renderer can spread the sections over it, and so the
          // on-screen workspace can show the same thing.
          fillPage: slide.fillPage ?? false,
          // And the pads, which are drawn under everything else on the page.
          pads: slide.pads ?? [],
          textStyles: slide.textStyles,
          textMarks: slide.textMarks,
        });
      }

      for (const block of slide.blocks) {
        if (block.kind === "pair" && block.pairMode === "flip" && block.images.length === 2) {
          const halves: { side: "before" | "after"; label: string; image: PortfolioImageRef }[] = [
            { side: "before", label: block.beforeLabel ?? "Before", image: block.images[0] },
            { side: "after", label: block.afterLabel ?? "After", image: block.images[1] },
          ];
          halves.forEach((half) => {
            pages.push({
              id: `${project.id}:${slide.id}:${block.id}:${half.side}`,
              kind: "flip",
              width: base.width,
              height: base.height,
              // One outline entry for the pair, on the first half, named for the section rather
              // than the block: the outline is a list of sections, and the pages a section owns
              // should read as part of it.
              bookmark:
                half.side === "before"
                  ? `${project.name} — ${slide.title || block.title || "Change"}`
                  : `${project.name} — ${slide.title || block.title || "Change"} (after)`,
              title: half.label,
              subtitle: block.title,
              body: block.body,
              projectIndex,
              pageNumber: pages.length + 1,
              blocks: [],
              // The section's styles *and* its marks, remapped onto this page's own slots.
              ...flipPageStyles(block),
              flip: {
                pairId: block.id,
                side: half.side,
                label: half.label,
                image: half.image,
                /**
                 * A description typed on the page wins over the one tied to the picture in the store —
                 * the same layering every other caption follows, so typing on a flip half means the
                 * same thing as typing under a card.
                 */
                caption: block.captions?.[half.image.id] ?? half.image.caption,
              },
            });
          });
        }

        if (block.kind !== "filmstrip" || !block.images.length) continue;
        const strip = filmstripGeometry(resolved.pageSize);
        for (let start = 0; start < block.images.length; start += FILMSTRIP_MAX_PER_ROW) {
          pages.push({
            id: `${project.id}:${slide.id}:${block.id}:${start}`,
            kind: "filmstrip",
            width: strip.width,
            height: strip.height,
            bookmark: `${project.name} — ${slide.title || block.title || "Works"}${start ? ` (${start + 1})` : ""}`,
            title: block.title ?? project.name,
            subtitle: block.body,
            projectIndex,
            pageNumber: pages.length + 1,
            blocks: [],
            frames: block.images.slice(start, start + FILMSTRIP_MAX_PER_ROW),
            ...stripPageStyles(block),
          });
        }
      }
    });
  });

  return pages;
}

/** Every image in the document, for orphan detection and export sizing. */
/**
 * The frames the planned pages draw, in order — one entry per *placement*.
 *
 * The plan is the single description of the document, so this is the honest answer to "what pictures does
 * this page draw": a filmstrip's frames are carried by the filmstrip page that draws them rather than
 * counted again on the page they came from, and a flip pair's halves appear once each on their own pages.
 * The cover's frames and a flip half are included because they are the document's, not a section's.
 */
export function plannedFrames(pages: PlannedPage[]): PortfolioImageRef[] {
  const frames: PortfolioImageRef[] = [];
  for (const page of pages) {
    frames.push(...(page.frames ?? []));
    if (page.flip) frames.push(page.flip.image);
    for (const block of page.blocks) {
      frames.push(...block.images);
      if (block.videoPoster) frames.push(block.videoPoster);
    }
  }
  return frames;
}

/**
 * Every image the document will *draw*, in the order the pages draw it.
 *
 * Read from the **plan**, with the store, rather than from the raw document — and that is the whole point. A
 * picture placed from the clipboard lives in the store: the section holds an id (`block.assetIds`) and the
 * pixels become `block.images` only when the block is *resolved* with the library, which is what planning
 * does. Walking the document alone therefore missed every image placed from the clipboard and every cover
 * frame, and this function is what the PDF preview asks for the pixels to fetch — so the workspace could show
 * a photograph that the file drew as an empty frame. Both surfaces draw from the plan; both now read their
 * pixels from it too.
 */
export function collectImages(portfolio: Portfolio, library?: MediaLibrary): PortfolioImageRef[] {
  return plannedFrames(planPortfolio(portfolio, library));
}

/**
 * Which pixels a surface has to fetch, from the plan it is about to draw.
 *
 * **One function, two callers, on purpose.** The workspace holds a plan and the preview holds a document, and
 * each used to work out for itself which pictures existed — which is how they came to disagree: the
 * workspace read the plan, the preview read the raw document, and a picture placed from the clipboard was in
 * one list and not the other. Anything either surface draws is in this list, so a frame it shows cannot be a
 * frame the file leaves blank.
 */
export function planImageIds(pages: PlannedPage[]): string[] {
  return plannedFrames(pages).map((frame) => frame.id);
}

export interface PortfolioStats {
  projects: number;
  slides: number;
  images: number;
  pages: number;
  filmstrips: number;
  /** Blocks that will not read as intended, with the reason. */
  warnings: string[];
}

/**
 * What the document amounts to, and what will not work as intended.
 *
 * Surfaced before export, because the alternative is finding out from a 40-page file
 * that the video block never had a poster frame.
 */
export function portfolioStats(portfolio: Portfolio, library?: MediaLibrary): PortfolioStats {
  const pages = planPortfolio(portfolio, library);
  const warnings: string[] = [];
  let slides = 0;
  let filmstrips = 0;

  for (const project of portfolio.projects) {
    slides += project.slides.length;
    if (!project.slides.length) warnings.push(`${project.name} has no slides.`);
    for (const slide of project.slides) {
      for (const block of slide.blocks) {
        if (block.kind === "filmstrip") {
          filmstrips += 1;
          if (block.images.length < 2) {
            warnings.push(
              `“${block.title ?? "Filmstrip"}” needs at least two frames to read as a strip.`,
            );
          }
        }
        if (block.kind === "pair" && block.images.length !== 2) {
          warnings.push(`“${block.title ?? "Before/after"}” needs exactly two images.`);
        }
        if (block.kind === "video" && !block.videoPoster) {
          warnings.push(
            `“${block.title ?? "Video"}” has no poster frame. Most viewers cannot play embedded video, so the poster is all many readers will see.`,
          );
        }
        if (block.kind === "video" && !block.videoUrl) {
          warnings.push(
            `“${block.title ?? "Video"}” has no link, so a reader who cannot play it has no way through.`,
          );
        }
      }
    }
  }

  if (!portfolio.projects.length) warnings.push("No projects yet — add one to start the portfolio.");

  return {
    projects: portfolio.projects.length,
    slides,
    images: collectImages(portfolio, library).length,
    pages: pages.length,
    filmstrips,
    warnings,
  };
}

