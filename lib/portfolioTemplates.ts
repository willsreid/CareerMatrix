/**
 * Modular templates.
 *
 * A template is an ordered list of slots — not a pile of artboards. Each slot says what it is for,
 * how it is presented, and how many images it wants, and assets fill the slots in order. That is
 * what keeps a template exportable: PDF has no drag-and-drop, so "modular" has to mean the
 * structure lives in the page plan, where it can be laid out, measured and printed.
 *
 * The macro-to-micro workflow this supports:
 *
 *   1. load the work into the store (images, captions, numbers — any order, any amount),
 *   2. apply a template, which gives every asset a place in a structure,
 *   3. refine slot by slot: change a presentation, swap an asset, delete a section.
 */

import type { PresentationId } from "./presentationOptions";
import { presentationOption } from "./presentationOptions";
import { createBlock } from "./portfolio";
import type { PortfolioProject, PortfolioSlide } from "./portfolioTypes";
import { type MediaAsset, type MediaLibrary } from "./mediaLibrary";

export interface TemplateSlot {
  /** Section title, used verbatim so the structure is recognisable in the editor. */
  title: string;
  presentation: PresentationId;
  /** How many images this slot fills with, if any. */
  images: number;
  /** What the slot is for. Shown while choosing, and kept as the section's note. */
  purpose: string;
}

export interface PortfolioTemplate {
  id: string;
  name: string;
  summary: string;
  /** When to reach for this one, in the user's terms. */
  useWhen: string;
  sections: TemplateSlot[];
}

export const PORTFOLIO_TEMPLATES: PortfolioTemplate[] = [
  {
    id: "case-study",
    name: "Case study",
    summary: "Story first: the problem, the view that shows it, the change, the numbers.",
    useWhen: "One project you want to explain properly, with a before/after worth showing.",
    sections: [
      { title: "Brief", presentation: "copy", images: 0, purpose: "What the job was and what was at stake." },
      { title: "The view", presentation: "full", images: 1, purpose: "The frame that sets the scene." },
      { title: "The change", presentation: "pair-flip", images: 2, purpose: "Before and after, as a page flip." },
      { title: "The detail", presentation: "cards", images: 2, purpose: "Two close-ups, each with its own description." },
      { title: "Outcome", presentation: "metrics", images: 0, purpose: "The numbers." },
      { title: "Sequence", presentation: "filmstrip", images: 4, purpose: "A row of frames across a wide page." },
    ],
  },
  {
    id: "walkthrough",
    name: "Visual walkthrough",
    summary: "Mostly frames, little prose: opens wide, then the sequence and the detail.",
    useWhen: "The work photographs well and the story is mostly visual.",
    sections: [
      { title: "Purpose", presentation: "copy", images: 0, purpose: "Two sentences on what this is." },
      { title: "Opening view", presentation: "full", images: 1, purpose: "Where to start looking." },
      { title: "Sequence", presentation: "filmstrip", images: 4, purpose: "How it comes together, in order." },
      { title: "The work", presentation: "cards", images: 3, purpose: "Three pieces, each with its own description." },
      { title: "Numbers", presentation: "metrics", images: 0, purpose: "What it added up to." },
    ],
  },
  {
    id: "change",
    name: "Before and after",
    summary: "Built around one change: the context, the flip, the evidence.",
    useWhen: "There is one intervention worth showing and you have matched frames.",
    sections: [
      { title: "Context", presentation: "copy", images: 0, purpose: "What was wrong before." },
      { title: "The change", presentation: "pair-flip", images: 2, purpose: "Before and after, same framing." },
      { title: "Evidence", presentation: "markup", images: 1, purpose: "The frame with the change called out." },
      { title: "What it saved", presentation: "metrics", images: 0, purpose: "The numbers." },
    ],
  },
  {
    id: "one-pager",
    name: "Compact one-pager",
    summary: "Two sections, no extra pages: a spread and the numbers.",
    useWhen: "You need something short to send with an application.",
    sections: [
      { title: "The work", presentation: "cards", images: 3, purpose: "Three pieces, each with its own description." },
      { title: "What it added up to", presentation: "metrics", images: 0, purpose: "Three or four numbers." },
    ],
  },
];

export function templateById(id: string): PortfolioTemplate | undefined {
  return PORTFOLIO_TEMPLATES.find((template) => template.id === id);
}

/** One line for the picker: what this template will do. */
export function templatePreview(template: PortfolioTemplate): string {
  const pageAdding = template.sections.filter((slot) =>
    ["filmstrip", "pair-flip"].includes(slot.presentation),
  ).length;
  const images = template.sections.reduce((total, slot) => total + slot.images, 0);
  return `${template.sections.length} sections · about ${images} images${
    pageAdding ? ` · ${pageAdding} take extra pages` : ""
  }`;
}

/* -------------------------------------------------------------------------- */
/* Filling a template                                                         */
/* -------------------------------------------------------------------------- */

interface Pool {
  images: MediaAsset[];
  pairs: MediaAsset[];
  texts: MediaAsset[];
  metrics: MediaAsset[];
}

function poolFrom(library: MediaLibrary): Pool {
  const assets = library.assets;
  return {
    pairs: assets.filter((asset) => asset.kind === "pair"),
    images: assets.filter((asset) => asset.kind === "image" || asset.kind === "poster"),
    texts: assets.filter((asset) => Boolean(asset.text)),
    metrics: assets.filter((asset) => Boolean(asset.metric)),
  };
}

/**
 * Fills one slot from the pool, taking assets in the order they were imported.
 *
 * A pair slot prefers a stored pair, because that is the only thing that can honestly claim to be
 * a before and after; failing that it takes two loose images, and the slot still shows two views.
 */
function fillSlot(slot: TemplateSlot, pool: Pool, used: Set<string>): string[] {
  const take = (from: MediaAsset[], count: number) => {
    const picked: string[] = [];
    for (const asset of from) {
      if (picked.length >= count) break;
      if (used.has(asset.id)) continue;
      picked.push(asset.id);
      used.add(asset.id);
    }
    return picked;
  };

  const wantsPair = slot.presentation === "pair-side" || slot.presentation === "pair-flip";
  if (wantsPair) {
    const pair = take(pool.pairs, 1);
    return pair.length ? pair : take(pool.images, 2);
  }
  if (slot.images > 0) return take(pool.images, slot.images);
  if (slot.presentation === "metrics") return take(pool.metrics, 4);
  return take(pool.texts, 1);
}

/**
 * Applies a template to the store: every slot becomes a section, and anything left over is placed
 * too.
 *
 * That second half is the point. Loading twelve images and choosing a six-slot template must not
 * quietly drop six of them, so the remainder is gathered into wide filmstrip sections and the
 * spare captions and numbers get one section each — everything loaded has somewhere to live, and
 * refining means rearranging rather than hunting for what went missing.
 */
export function applyTemplate(
  template: PortfolioTemplate,
  options: { name: string; library: MediaLibrary; id?: string },
): PortfolioProject {
  const pool = poolFrom(options.library);
  const used = new Set<string>();
  const stamp = options.id ?? `pr-${Date.now().toString(36)}`;
  const slides: PortfolioSlide[] = [];

  template.sections.forEach((slot, index) => {
    // The purpose line is guidance while composing, so it goes in the section's body — but only
    // where that body is a page we were going to have anyway. A filmstrip or a flip owns its own
    // pages, and a sentence-body would put a heading-only page in front of the content.
    const ownsPages = presentationOption(slot.presentation)?.ownsPages ?? false;
    slides.push({
      id: `${stamp}-s${index}`,
      title: slot.title,
      ...(ownsPages ? {} : { body: slot.purpose }),
      blocks: [
        createBlock("image", {
          presentation: slot.presentation,
          title: slot.title,
          // A slot that shows frames reserves the frames it asked for, whether or not the store had
          // that many pictures. Apply a template to an empty store and you get the structure with the
          // right number of holes in it — which is how you arrange the pages before the work arrives,
          // and how a short store shows you exactly what is missing.
          ...(slot.images ? { slots: slot.images } : {}),
          assetIds: fillSlot(slot, pool, used),
        }),
      ],
    });
  });

  // Pairs first: a stored pair is the most specific thing a leftover could be, and it must not be
  // dropped just because no slot asked for a comparison.
  const sparePairs = pool.pairs.filter((asset) => !used.has(asset.id));
  sparePairs.forEach((pair, index) => {
    used.add(pair.id);
    slides.push({
      id: `${stamp}-p${index}`,
      title: pair.name,
      body: "A comparison that did not fit a slot above.",
      blocks: [
        createBlock("pair", { presentation: "pair-side", title: pair.name, assetIds: [pair.id] }),
      ],
    });
  });

  // Leftover frames become cards as well, three to a page, so the work that did not fit a slot is
  // still shown with a description rather than as an uncaptioned contact sheet.
  const leftovers = pool.images.filter((asset) => !used.has(asset.id));
  for (let start = 0; start < leftovers.length; start += 3) {
    const chunk = leftovers.slice(start, start + 3).map((asset) => asset.id);
    chunk.forEach((id) => used.add(id));
    // No body: the cards carry their own descriptions, and a sentence here would add a page.
    slides.push({
      id: `${stamp}-x${start}`,
      title: "More work",
      blocks: [createBlock("image", { presentation: "cards", title: "More work", assetIds: chunk })],
    });
  }

  const spareText = pool.texts.filter((asset) => !used.has(asset.id));
  if (spareText.length) {
    slides.push({
      id: `${stamp}-notes`,
      title: "Notes",
      blocks: [
        createBlock("image", {
          presentation: "copy",
          title: "Notes",
          assetIds: spareText.map((asset) => asset.id),
        }),
      ],
    });
  }

  const spareMetrics = pool.metrics.filter((asset) => !used.has(asset.id));
  if (spareMetrics.length) {
    slides.push({
      id: `${stamp}-also`,
      title: "Also",
      blocks: [
        createBlock("image", {
          presentation: "metrics",
          title: "Also",
          assetIds: spareMetrics.map((asset) => asset.id),
        }),
      ],
    });
  }

  return { id: stamp, name: options.name, summary: template.summary, slides };
}

/** Every asset a project references, for reporting what a template placed. */
export function placedAssetIds(project: PortfolioProject): string[] {
  const ids = new Set<string>();
  for (const slide of project.slides) {
    for (const block of slide.blocks ?? []) {
      for (const id of block.assetIds ?? []) ids.add(id);
    }
  }
  return [...ids];
}
