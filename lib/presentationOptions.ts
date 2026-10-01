/**
 * Presentation options: the menu a section picks from.
 *
 * A section owns *content* (which assets it shows); this module decides how that content is
 * put on the page. The same pair of photographs can be a side-by-side comparison, a page
 * flip, a two-frame row or part of a grid — so the choice belongs to the section, not to the
 * block's type. That is the difference between "I have a before/after" and "I have this
 * tool": the tool stays, and how it is presented is a decision you can change later.
 *
 * Every option names the capability it depends on, using the exact `feature` string from
 * `PORTFOLIO_CAPABILITIES`. The engine suite asserts each one resolves to a real entry at
 * the same level, so the options cannot promise more than the exported PDF can do.
 */

import type { PortfolioBlock, PortfolioBlockKind } from "./portfolioTypes";

export type PresentationId =
  | "cards"
  | "full"
  | "framed"
  | "duo"
  | "grid"
  | "filmstrip"
  | "pair-side"
  | "pair-flip"
  | "markup"
  | "annotate"
  | "metrics"
  | "quote"
  | "copy"
  | "video";

/** What a section must hold before an option can be used. */
export interface PresentationRequirement {
  images?: { min: number; max: number };
  needsText?: boolean;
  needsMetric?: boolean;
  needsUrl?: boolean;
  /** True when the images must come from a stored before/after pair. */
  needsPair?: boolean;
}

export interface PresentationOption {
  id: PresentationId;
  label: string;
  /** One line for the picker, in the user's terms. */
  summary: string;
  /** The block type the planner and renderer see once this option is applied. */
  blockKind: PortfolioBlockKind;
  /** Set for pair options, so the flip is a presentation rather than a special block. */
  pairMode?: "side" | "flip";
  /**
   * Set when the option arranges frames in a particular way rather than as a plain row.
   *
   * `cards` is the one that matters for a portfolio of individual pieces: each frame gets its own
   * caption underneath, so a single page holds two or three self-contained sections instead of one.
   */
  layout?: "rows" | "grid" | "cards";
  /** Set when the option lays an image block out in columns. */
  columns?: 1 | 2 | 3 | 4;
  /**
   * How many frames this option wants when it is chosen for an empty section.
   *
   * This is what makes an option "represent the space required": adding a section for captioned
   * cards reserves three frames at the right size and shape, so the page can be arranged before the
   * photographs exist. Undefined for options that show no frames.
   */
  frames?: number;
  /**
   * True when the option takes pages of its own instead of living inside the section's page
   * — which changes the page count, so the panel has to say so before you pick it.
   */
  ownsPages: boolean;
  requires: PresentationRequirement;
  /** Exact `feature` string from `PORTFOLIO_CAPABILITIES`. */
  capability: string;
  caveat: string;
}

/** What a section currently holds, used to decide which options apply. */
export interface SectionContent {
  images: number;
  hasPair: boolean;
  hasText: boolean;
  hasMetric: boolean;
  hasUrl: boolean;
}

export const PRESENTATION_OPTIONS: PresentationOption[] = [
  {
    id: "cards",
    label: "Photo + caption cards",
    summary: "Two to four photographs on one page, each with its own description underneath.",
    blockKind: "image",
    layout: "cards",
    frames: 3,
    ownsPages: false,
    requires: { images: { min: 2, max: 4 } },
    capability: "Images, crops and captions",
    caveat: "The description under a photograph is the text tied to it, so it reads the same wherever that photograph appears.",
  },
  {
    id: "full",
    label: "Full bleed",
    summary: "One frame edge to edge. The most confident way to show a single view.",
    blockKind: "image",
    frames: 1,
    ownsPages: false,
    requires: { images: { min: 1, max: 1 } },
    capability: "Images, crops and captions",
    caveat: "Crop it here rather than in another app: the crop is stored as a fraction, so a sharper re-import keeps your framing.",
  },
  {
    id: "framed",
    label: "Framed with caption",
    summary: "One frame inside the margins, with a caption under it.",
    blockKind: "image",
    frames: 1,
    ownsPages: false,
    requires: { images: { min: 1, max: 1 } },
    capability: "Images, crops and captions",
    caveat: "Leaves white space, which is what makes a caption look deliberate.",
  },
  {
    id: "duo",
    label: "Two frames side by side",
    summary: "Two images in a row, matched width and height.",
    blockKind: "image",
    columns: 2,
    frames: 2,
    ownsPages: false,
    requires: { images: { min: 2, max: 2 } },
    capability: "Images, crops and captions",
    caveat: "Both frames get the same box, so mismatched source shapes are cropped to match rather than distorted.",
  },
  {
    id: "grid",
    label: "Four-up grid",
    summary: "Up to four frames in a two-by-two block.",
    blockKind: "image",
    columns: 2,
    frames: 4,
    ownsPages: false,
    requires: { images: { min: 2, max: 4 } },
    capability: "Images, crops and captions",
    caveat: "Frames shrink as you add them; four is about where they stop reading at print size.",
  },
  {
    id: "filmstrip",
    label: "Wide filmstrip",
    summary: "A row of frames across a wide page, for showing a sequence.",
    blockKind: "filmstrip",
    frames: 4,
    ownsPages: true,
    requires: { images: { min: 2, max: 12 } },
    capability: "Horizontal slide rows (filmstrip)",
    caveat: "Takes its own wide page, so the deck gains pages. Frames per row are capped and the rest flow onto another page.",
  },
  {
    id: "pair-side",
    label: "Before / after, one page",
    summary: "Both states on one page, labelled, matched scale.",
    blockKind: "pair",
    pairMode: "side",
    frames: 2,
    ownsPages: false,
    requires: { images: { min: 2, max: 2 }, needsPair: true },
    capability: "Images, crops and captions",
    caveat: "The like-for-like comparison. Reads on paper and in every viewer, with no animation.",
  },
  {
    id: "pair-flip",
    label: "Before / after, page flip",
    summary: "Each state on its own page, wiping sideways on the turn.",
    blockKind: "pair",
    pairMode: "flip",
    frames: 2,
    ownsPages: true,
    requires: { images: { min: 2, max: 2 }, needsPair: true },
    capability: "Page transitions",
    caveat: "Glides in Acrobat and Foxit; elsewhere you get two identically framed pages, which is a comparison you can still read.",
  },
  {
    id: "markup",
    label: "Mark-up callout",
    summary: "A box, circle or callout drawn over the frame.",
    blockKind: "markup",
    frames: 1,
    ownsPages: false,
    requires: { images: { min: 1, max: 1 } },
    capability: "Mark-up drawn on the page",
    caveat: "Visible everywhere because it is drawn into the page — but it is part of the artwork, not separately editable.",
  },
  {
    id: "annotate",
    label: "Mark-up as editable notes",
    summary: "The same mark-up, also emitted as real PDF annotations.",
    blockKind: "markup",
    frames: 1,
    ownsPages: false,
    requires: { images: { min: 1, max: 1 } },
    capability: "Mark-up as real annotations",
    caveat: "A reviewer can select and move these in Acrobat, Foxit and Bluebeam. Chrome's viewer ignores annotations, so the drawn copy is always there too.",
  },
  {
    id: "metrics",
    label: "Metrics row",
    summary: "The numbers, set large.",
    blockKind: "metrics",
    ownsPages: false,
    requires: { needsMetric: true },
    capability: "Images, crops and captions",
    caveat: "Keep it to three or four; a wall of numbers stops being read.",
  },
  {
    id: "quote",
    label: "Pull quote",
    summary: "A short line given the weight of a caption.",
    blockKind: "quote",
    ownsPages: false,
    requires: { needsText: true },
    capability: "Images, crops and captions",
    caveat: "Best when it is a sentence someone else said about the work.",
  },
  {
    id: "copy",
    label: "Text block",
    summary: "A paragraph of description or explanation.",
    blockKind: "text",
    ownsPages: false,
    requires: { needsText: true },
    capability: "Images, crops and captions",
    caveat: "Plain prose. This is read by people, not parsed by a scanner.",
  },
  {
    id: "video",
    label: "Video poster and link",
    summary: "A poster frame, a play badge and a link to where the video lives.",
    blockKind: "video",
    frames: 1,
    ownsPages: false,
    requires: { images: { min: 1, max: 1 }, needsUrl: true },
    capability: "Video playback",
    caveat: "Acrobat can play an embedded asset; Chrome, Preview and phones show nothing. The poster and the link have to carry the meaning on their own.",
  },
];

/* -------------------------------------------------------------------------- */
/* Choosing                                                                   */
/* -------------------------------------------------------------------------- */

export function presentationOption(id: PresentationId | undefined): PresentationOption | undefined {
  if (!id) return undefined;
  return PRESENTATION_OPTIONS.find((option) => option.id === id);
}

/**
 * How many frames to reserve when a section is added with this option.
 *
 * Falls back to the smallest number the option accepts, so an option that never declared a
 * preference still reserves the space it needs rather than none.
 */
export function framesForPresentation(id: PresentationId | undefined): number {
  const option = presentationOption(id);
  if (!option) return 0;
  return option.frames ?? option.requires.images?.min ?? 0;
}

/** The option that matches how a block is currently set up. */
export function inferPresentation(block: PortfolioBlock): PresentationId {
  switch (block.kind) {
    case "pair":
      return block.pairMode === "flip" ? "pair-flip" : "pair-side";
    case "filmstrip":
      return "filmstrip";
    case "metrics":
      return "metrics";
    case "quote":
      return "quote";
    case "text":
      return "copy";
    case "video":
      return "video";
    case "markup":
      return block.annotations.some((annotation) => annotation.asAnnotation) ? "annotate" : "markup";
    case "image":
    default:
      // Cards first: it is the only arrangement where each frame carries its own description, so it
      // is a different thing to show, not a different number of columns.
      if (block.layout === "cards") return "cards";
      if (block.columns === 2 && block.images.length >= 3) return "grid";
      if (block.columns === 2 && block.images.length === 2) return "duo";
      return block.title || block.images[0]?.caption ? "framed" : "full";
  }
}

/**
 * The block as the planner should see it.
 *
 * Presentations are an authoring layer: they normalise to the block type and options the
 * planner already understands, so choosing "flip" sets `pairMode` rather than introducing a
 * second way to describe the same thing. A block with no presentation set is returned
 * untouched, which keeps older documents planning exactly as they did.
 */
export function applyPresentation(block: PortfolioBlock): PortfolioBlock {
  const option = presentationOption(block.presentation);
  if (!option) return block;

  const next: PortfolioBlock = { ...block, kind: option.blockKind };
  if (option.pairMode) next.pairMode = option.pairMode;
  if (option.layout) next.layout = option.layout;
  if (option.columns) next.columns = option.columns;
  // A pair presented as a flip must not also be drawn on its section page, and a filmstrip
  // always owns its pages; the planner reads these two fields to decide.
  if (option.id === "annotate") {
    next.annotations = block.annotations.map((annotation) => ({ ...annotation, asAnnotation: true }));
  }
  return next;
}

/**
 * Why an option cannot be used yet, in the words the picker shows.
 *
 * Returning the reason rather than hiding the option is deliberate: a greyed-out
 * "Before / after, page flip — needs two images" teaches the model, where a missing entry
 * just looks like the feature does not exist.
 */
export function missingRequirements(
  option: PresentationOption,
  content: SectionContent,
): string | null {
  // Content needs come first, then the count. Both can be unmet at once — a video section with
  // five images and no link — and the useful message names the thing to go and add rather than
  // complaining about a count that the option would cope with once the link exists.
  if (option.requires.needsPair && !content.hasPair) return "needs a stored before / after pair";
  if (option.requires.needsText && !content.hasText) return "needs a text asset";
  if (option.requires.needsMetric && !content.hasMetric) return "needs a metric asset";
  if (option.requires.needsUrl && !content.hasUrl) return "needs a link or a video poster";

  const images = option.requires.images;
  if (images) {
    if (content.images < images.min) {
      return images.min === 2 ? "needs two images" : `needs ${images.min} images`;
    }
    if (content.images > images.max) {
      return `shows up to ${images.max} — this section holds ${content.images}`;
    }
  }
  return null;
}

export interface OptionAvailability {
  option: PresentationOption;
  available: boolean;
  /** Null when available; otherwise the reason, ready to show in the picker. */
  reason: string | null;
}

/** Every option with its availability, which is what the section picker renders. */
export function optionAvailability(content: SectionContent): OptionAvailability[] {
  return PRESENTATION_OPTIONS.map((option) => {
    const reason = missingRequirements(option, content);
    return { option, available: reason === null, reason };
  });
}

/** Just the ids that can be used right now — the menu for a section holding this content. */
export function availablePresentations(content: SectionContent): PresentationId[] {
  return optionAvailability(content)
    .filter((entry) => entry.available)
    .map((entry) => entry.option.id);
}

/** Content counts for a section, derived from the assets it references. */
export function sectionContentFromAssets(
  assets: { images: unknown[]; pair?: unknown; text?: string; metric?: unknown; link?: unknown }[],
): SectionContent {
  return {
    images: assets.reduce((total, asset) => total + asset.images.length, 0),
    hasPair: assets.some((asset) => Boolean(asset.pair)),
    hasText: assets.some((asset) => Boolean(asset.text)),
    hasMetric: assets.some((asset) => Boolean(asset.metric)),
    hasUrl: assets.some((asset) => Boolean(asset.link)),
  };
}

/**
 * The options that change the page count.
 *
 * The panel warns with this before a choice is made, because "my deck grew by a page" is the
 * kind of surprise that makes someone stop trusting an export button.
 */
export function pageAddingPresentations(): PresentationOption[] {
  return PRESENTATION_OPTIONS.filter((option) => option.ownsPages);
}
