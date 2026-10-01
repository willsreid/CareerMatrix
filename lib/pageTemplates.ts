/**
 * Page templates: the shapes a page takes.
 *
 * A project template decides what a whole portfolio says; these decide what *one page* is. That is
 * the level people actually think at while laying out — "three across and a big one underneath",
 * "four squares", "the frame here and the words beside it" — and it is the level a starting point is
 * most useful at, because the content of the page is usually already decided by then.
 *
 * A template is only ever a starting shape. Every section it creates is a normal section: same
 * widths, same presentations, same everything, immediately movable and resizable. Nothing here is a
 * locked layout.
 */

import { rowsOf } from "./portfolio";
import type { Portfolio, PortfolioBlock, PortfolioSlide } from "./portfolioTypes";
import type { PresentationId } from "./presentationOptions";

export interface PageTemplateSection {
  title: string;
  presentation: PresentationId;
  /** Width in twelfths. Four is a third, three is a quarter. */
  span: number;
  /** Frames to reserve, so the shape is visible before the pictures exist. */
  slots?: number;
  columns?: 1 | 2 | 3 | 4;
  body?: string;
  bodyStyle?: "paragraph" | "bullets" | "lead";
  textPlacement?: "below" | "left" | "right" | "above" | "none";
  shape?: "wide" | "standard" | "tall";
}

export interface PageTemplate {
  id: string;
  name: string;
  summary: string;
  /** When to reach for this one, in the user's terms. */
  useWhen: string;
  /** A starting page title; renameable on the page. */
  title: string;
  sections: PageTemplateSection[];
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "three-and-a-big-one",
    name: "Three across, one big below",
    summary: "A row of three frames, then a full-width view underneath.",
    useWhen: "A project with three pieces to compare and one view that sums it up.",
    title: "Three across",
    sections: [
      { title: "Piece one", presentation: "framed", span: 4, slots: 1, shape: "wide" },
      { title: "Piece two", presentation: "framed", span: 4, slots: 1, shape: "wide" },
      { title: "Piece three", presentation: "framed", span: 4, slots: 1, shape: "wide" },
      { title: "The whole thing", presentation: "framed", span: 12, slots: 1 },
    ],
  },
  {
    id: "quad",
    name: "Four squares",
    summary: "Four equal frames, a quarter of the page each.",
    useWhen: "A set of details that only makes sense together, like a contact sheet.",
    title: "Four squares",
    sections: [
      { title: "Detail one", presentation: "framed", span: 3, slots: 1 },
      { title: "Detail two", presentation: "framed", span: 3, slots: 1 },
      { title: "Detail three", presentation: "framed", span: 3, slots: 1 },
      { title: "Detail four", presentation: "framed", span: 3, slots: 1 },
    ],
  },
  {
    id: "frame-and-words",
    name: "A frame, words beside it",
    summary: "A two-thirds frame with the writing in a column to its right.",
    useWhen: "There is a real explanation to give, not just a caption.",
    title: "The view and what it shows",
    sections: [
      {
        title: "The view",
        presentation: "framed",
        span: 8,
        slots: 1,
        body: "What this shows, and why it mattered.",
        textPlacement: "right",
      },
    ],
  },
  {
    id: "words-and-frame",
    name: "Words, then a frame",
    summary: "The writing on the left, the frame on the right.",
    useWhen: "The text is the argument and the photograph is the evidence.",
    title: "What we changed",
    sections: [
      {
        title: "What we changed",
        presentation: "framed",
        span: 8,
        slots: 1,
        body: "The change, the reasoning, the constraints.",
        textPlacement: "left",
      },
    ],
  },
  {
    id: "hero-and-two",
    name: "One hero, two below",
    summary: "A full-width hero frame over two halves.",
    useWhen: "There is one shot that carries the page.",
    title: "The main view",
    sections: [
      { title: "The main view", presentation: "framed", span: 12, slots: 1 },
      { title: "Before", presentation: "framed", span: 6, slots: 1, shape: "wide" },
      { title: "After", presentation: "framed", span: 6, slots: 1, shape: "wide" },
    ],
  },
  {
    id: "sequence-and-notes",
    name: "A sequence and the notes",
    summary: "Four frames in a wide band, with bulleted notes underneath.",
    useWhen: "The work is a process and the writing is a list of what changed.",
    title: "In sequence",
    sections: [
      { title: "In sequence", presentation: "framed", span: 12, slots: 4, columns: 4, shape: "wide" },
      {
        title: "Notes",
        presentation: "copy",
        span: 12,
        body: "First point\nSecond point\nThird point",
        bodyStyle: "bullets",
      },
    ],
  },
];

export function pageTemplateById(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((template) => template.id === id);
}

/**
 * The template's rows, for the picker's diagram.
 *
 * Worked out with `rowsOf` on stand-in blocks rather than by counting spans here, so the little
 * diagram in the menu cannot describe a different layout from the one you get.
 */
export function pageTemplateRows(template: PageTemplate): number[][] {
  const stand: PortfolioBlock[] = template.sections.map((section, index) => ({
    id: `t${index}`,
    kind: "image",
    span: section.span,
    images: [],
    annotations: [],
  }));
  return rowsOf(stand).map((row) => row.map((block) => block.span ?? 12));
}

/** Builds the page a template describes. Pure, so a test can assert the shape it produces. */
export function pageFromTemplate(
  template: PageTemplate,
  options: { id: string; title?: string; stamp: string },
): PortfolioSlide {
  return {
    id: options.id,
    title: options.title ?? template.title,
    blocks: template.sections.map((section, index) => ({
      id: `${options.stamp}-b${index}`,
      kind: section.presentation === "copy" ? "text" : "image",
      presentation: section.presentation,
      title: section.title,
      span: section.span,
      shape: section.shape,
      ...(section.columns ? { columns: section.columns } : {}),
      ...(section.slots ? { slots: section.slots } : {}),
      ...(section.body ? { body: section.body } : {}),
      ...(section.bodyStyle ? { bodyStyle: section.bodyStyle } : {}),
      ...(section.textPlacement ? { textPlacement: section.textPlacement } : {}),
      assetIds: [],
      images: [],
      annotations: [],
    })),
  };
}

/**
 * Re-lays one page: the sections it already holds, arranged the way a layout arranges them.
 *
 * A project template makes a project; a page layout shapes *a page*. So changing one page's shape has to
 * leave every other page alone — which is the whole point of this function existing separately from
 * `applyPageTemplate`. It takes the page's sections in order and gives each the slot's width, columns,
 * height and text placement, and keeps everything else: what the section holds, its presentation, its
 * words, its captions, its numbers, its pads.
 *
 * Two asymmetries worth knowing:
 *
 *  - a layout with more slots than the page has sections fills the page out with empty ones, so
 *    "three across and a big one below" gives you the big one even if you only had three sections;
 *  - a page with more sections than the layout has slots keeps the extras *untouched*, because dropping
 *    someone's work to make a shape fit is a worse trade than an uneven page.
 *
 * An empty section adopts the slot's presentation as well as its geometry: a hole is a hole, and it may
 * as well be the right kind of hole.
 */
export function relayoutPage(
  portfolio: Portfolio,
  slideId: string,
  template: PageTemplate,
  stamp = Date.now().toString(36),
): Portfolio {
  const slide = portfolio.projects
    .flatMap((project) => project.slides)
    .find((entry) => entry.id === slideId);
  if (!slide) return portfolio;

  const next: PortfolioBlock[] = slide.blocks.map((block, index) => {
    const slot = template.sections[index];
    if (!slot) return block;
    const empty = (block.assetIds ?? []).length === 0 && block.images.length === 0;
    return {
      ...block,
      span: slot.span,
      ...(slot.columns ? { columns: slot.columns } : {}),
      ...(slot.shape ? { shape: slot.shape } : {}),
      ...(slot.textPlacement ? { textPlacement: slot.textPlacement } : {}),
      ...(empty
        ? { presentation: slot.presentation, ...(slot.slots ? { slots: slot.slots } : {}) }
        : {}),
    };
  });

  // The layout's remaining slots become empty sections, so a page can be given a shape it does not yet
  // have the content for.
  for (let index = slide.blocks.length; index < template.sections.length; index += 1) {
    const slot = template.sections[index];
    next.push({
      id: `${stamp}-bl${index}`,
      kind: slot.presentation === "copy" ? "text" : "image",
      presentation: slot.presentation,
      title: slot.title,
      span: slot.span,
      ...(slot.columns ? { columns: slot.columns } : {}),
      ...(slot.shape ? { shape: slot.shape } : {}),
      ...(slot.slots ? { slots: slot.slots } : {}),
      ...(slot.body ? { body: slot.body } : {}),
      ...(slot.bodyStyle ? { bodyStyle: slot.bodyStyle } : {}),
      ...(slot.textPlacement ? { textPlacement: slot.textPlacement } : {}),
      assetIds: [],
      images: [],
      annotations: [],
    });
  }

  // Applying the same layout twice is not an edit, so it costs no undo step — the rule every other edit
  // in this codebase follows.
  if (JSON.stringify(next) === JSON.stringify(slide.blocks)) return portfolio;

  return {
    ...portfolio,
    projects: portfolio.projects.map((project) => ({
      ...project,
      slides: project.slides.map((entry) => (entry.id === slideId ? { ...entry, blocks: next } : entry)),
    })),
  };
}

/** Adds the page a template describes to a project. */
export function applyPageTemplate(
  portfolio: Portfolio,
  projectId: string,
  template: PageTemplate,
  options: { stamp: string; id: string },
): Portfolio {
  const slide = pageFromTemplate(template, options);
  return {
    ...portfolio,
    projects: portfolio.projects.map((project) =>
      project.id === projectId ? { ...project, slides: [...project.slides, slide] } : project,
    ),
  };
}
