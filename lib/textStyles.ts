/* -------------------------------------------------------------------------- */
/* Text styles                                                                */
/*                                                                            */
/* Six named ways of setting words, and the palette they are set in.           */
/* -------------------------------------------------------------------------- */

/**
 * The page palette, on screen and on paper.
 *
 * These five values were already the PDF's constants and the `.proj-*` classes in `globals.css` — the
 * same hexes written down twice. They live here now, and both surfaces read them, so a colour can no
 * longer drift between the preview and the file. The suite asserts the stylesheet still agrees.
 */
export const PORTFOLIO_INK = {
  /** Body text. */
  ink: "#1c1f24",
  /** Headings: a deep navy that reads as black on paper and as blue on screen. */
  navy: "#172f54",
  /** Secondary text: captions, notes, the author line. */
  soft: "#616c78",
  /** One accent, used for emphasis and for links. */
  accent: "#0f766e",
  /** Hairlines and empty-frame borders. */
  rule: "#c9d2de",
} as const;

export type PortfolioInkName = keyof typeof PORTFOLIO_INK;

/**
 * The six styles.
 *
 * `label` is the tag the cover already wears — PORTFOLIO, small, spaced out, uppercase, in the accent —
 * and the other five are the document's other type settings, named so they can be put anywhere. That is
 * the whole idea: nothing new is introduced, and nothing already drawn changes. Each entry carries the
 * numbers the PDF draws with *and* the class the workspace draws with, because a style that looked one
 * way on screen and another on paper would defeat the point of a preview.
 */
export type TextStyleId = "headline" | "header" | "subject" | "title" | "subhead" | "label";

/**
 * The standard PDF fonts this composer draws with.
 *
 * No file is embedded: every PDF viewer has these fourteen built in, which is why a portfolio set in Times costs
 * nothing and prints identically on any machine. `lib/portfolioTheme.ts` pairs them, and the pairing is the only
 * thing that picks between them.
 */
export type PdfFontName =
  | "Helvetica"
  | "Helvetica-Bold"
  | "Helvetica-Oblique"
  | "Times-Roman"
  | "Times-Bold"
  | "Times-Italic"
  | "Courier"
  | "Courier-Bold"
  | "Courier-Oblique";

export interface TextStyle {
  id: TextStyleId;
  name: string;
  /** What it is for, in the picker's tooltip. */
  what: string;
  /** The word the picker shows, set in the style itself. */
  sample: string;
  /** How the style reads in a dropdown: a native select cannot draw the sample, so it describes it. */
  menu: string;
  /** Where the format comes from in the document. */
  from: string;
  /** The workspace draws it with this. */
  className: string;
  /** The PDF draws it with this. */
  paper: {
    fontSize: number;
    fontFamily: PdfFontName;
    color: PortfolioInkName;
    letterSpacing?: number;
    lineHeight?: number;
  };
  /** Set in capitals whatever was typed — the label's whole character. */
  uppercase?: boolean;
}

export const TEXT_STYLES: Record<TextStyleId, TextStyle> = {
  headline: {
    id: "headline",
    name: "headline",
    what: "the largest thing on a page — a title you want to be read from across the room",
    sample: "Headline",
    menu: "40pt bold navy — the biggest thing on a page",
    from: "the cover's title (40pt)",
    className: "proj-navy proj-f-heading proj-s-headline font-semibold leading-tight",
    paper: { fontSize: 40, fontFamily: "Helvetica-Bold", color: "navy" },
  },
  header: {
    id: "header",
    name: "header",
    what: "the heading a page is known by",
    sample: "Header",
    menu: "24pt bold navy — a page heading",
    from: "a page's heading (24pt)",
    className: "proj-ink proj-f-heading proj-s-header font-semibold",
    paper: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "navy" },
  },
  subject: {
    id: "subject",
    name: "subject",
    what: "the one line that carries a section — larger than the words around it",
    sample: "Subject line",
    menu: "12pt navy — a lead line",
    from: "a lead line (12pt)",
    className: "proj-navy proj-f-text proj-s-subject",
    paper: { fontSize: 12, fontFamily: "Helvetica", color: "navy", lineHeight: 1.35 },
  },
  title: {
    id: "title",
    name: "title",
    what: "a section's own heading, and what a section title looks like by default",
    sample: "Section title",
    menu: "11.5pt bold navy",
    from: "a section title (11.5pt bold)",
    className: "proj-ink proj-f-heading proj-s-title font-medium",
    paper: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: "navy" },
  },
  subhead: {
    id: "subhead",
    name: "subhead",
    what: "a secondary heading, or a line under one, in the accent",
    sample: "Subhead",
    menu: "11.5pt bold, in the accent",
    from: "a page's standfirst (11.5pt bold, accent)",
    className: "proj-accent proj-f-heading proj-s-subhead font-semibold",
    paper: { fontSize: 11.5, fontFamily: "Helvetica-Bold", color: "accent" },
  },
  label: {
    id: "label",
    name: "label",
    what: "the PORTFOLIO tag: small, spaced out, capitals — a tag rather than a heading",
    sample: "PORTFOLIO",
    menu: "10pt tracked capitals, in the accent",
    from: "the cover's tag (10pt, 2.4 tracked)",
    className: "proj-accent proj-f-heading proj-s-label uppercase tracking-[0.2em]",
    paper: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "accent", letterSpacing: 2.4 },
    uppercase: true,
  },
};

/** Biggest first, which is also the order they read in on a page. */
export const TEXT_STYLE_ORDER: readonly TextStyleId[] = [
  "headline",
  "header",
  "subject",
  "title",
  "subhead",
  "label",
];

/** The slots of a document whose text can be styled by hand. */
export type TextStyleSlot = "title" | "subtitle" | "body" | "caption";

/**
 * Styles chosen by hand, by slot.
 *
 * A map rather than one field per slot so a slot nobody has touched is simply absent — and absence means
 * "as the document draws it today", which is what keeps every existing portfolio looking the way it
 * did. The same shape is used on the document, on a page and on a section, so one control fits all three.
 */
export type TextStyleMap = Partial<Record<TextStyleSlot, TextStyleId>>;

const STYLE_IDS = new Set<string>(TEXT_STYLE_ORDER);

/** The style with this id, or undefined — including for an id from an older document. */
export function textStyleOf(id: string | null | undefined): TextStyle | undefined {
  if (!id || !STYLE_IDS.has(id)) return undefined;
  return TEXT_STYLES[id as TextStyleId];
}

/**
 * The style a slot is set in: the one chosen by hand, or the slot's own default.
 *
 * The fallback is per slot and per surface — a section title falls back to `title`, a page heading to
 * `header`, the cover's title to `headline` — because that is what each of them is drawn as today. So
 * nothing changes until someone chooses something, and choosing "header" on a section title makes it
 * a page heading, which is the entire feature.
 */
export function resolveTextStyle(
  map: TextStyleMap | undefined,
  slot: TextStyleSlot,
  fallback?: TextStyleId,
): TextStyle | undefined {
  return textStyleOf(map?.[slot]) ?? textStyleOf(fallback);
}

/**
 * What each slot is drawn as when nobody has chosen, per surface.
 *
 * Used by the picker to say what "as drawn" means — on a cover the title is a headline, on a page it is
 * a header, on a section it is a title — and by nothing else. The drawing itself reads the base style
 * from the renderer, which is what keeps this table honest: if it disagreed, the picker would be
 * labelling the wrong thing, and the suite pins the two together.
 */
export type TextStyleSurface = "document" | "page" | "section";

export const SLOT_DRAWN_AS: Record<TextStyleSurface, Partial<Record<TextStyleSlot, TextStyleId>>> = {
  document: { title: "headline", subtitle: "label" },
  page: { title: "header", subtitle: "subhead" },
  section: { title: "title" },
};

/**
 * A style applied to *part* of a slot's text, by character range.
 *
 * This is what makes styling a highlighted selection possible without turning the document into mark-up:
 * the words stay plain — searchable, extractable, exportable — and the styling is a list of ranges over
 * them. `start` is inclusive, `end` exclusive, in characters of the slot's own text, so the same range
 * means the same thing on screen and on paper.
 *
 * Ranges are clamped whenever the text changes (see `clampMarks`): a range that pointed past the end of a
 * shortened line would otherwise style the wrong words, which is the kind of quiet wrongness this document
 * has no room for.
 */
export interface TextStyleRange {
  start: number;
  end: number;
  style: TextStyleId;
}

/** Styles by range, per slot: parts of the text set differently from the rest. */
export type TextMarkMap = Partial<Record<TextStyleSlot, TextStyleRange[]>>;

/** One stretch of text with the style it is drawn in, if it differs from the slot's own. */
export interface TextRun {
  text: string;
  style?: TextStyle;
}

/** Keeps a range inside the text it belongs to. */
function clampRange(range: TextStyleRange, length: number): TextStyleRange | null {
  const start = Math.max(0, Math.min(range.start, length));
  const end = Math.max(0, Math.min(range.end, length));
  return end > start ? { ...range, start, end } : null;
}

/**
 * Marks with one more range, or one fewer.
 *
 * `style` of null clears the style from that range and leaves nothing behind — no mark that merely says
 * "as designed", because absent is how that is said everywhere else in this document. Overlapping ranges
 * are resolved here rather than at draw time: a new range cuts out whatever was under it and the remains
 * are trimmed around it, so the stored list is always a set of non-overlapping stretches. That is what
 * lets the renderers be a single loop instead of a merge sort.
 */
export function applyMark(
  marks: TextStyleRange[] | undefined,
  range: { start: number; end: number },
  style: TextStyleId | null,
): TextStyleRange[] {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const next: TextStyleRange[] = [];

  for (const mark of marks ?? []) {
    if (mark.end <= start || mark.start >= end) {
      next.push(mark);
      continue;
    }
    // The part of this mark before the new range survives under the new style...
    if (mark.start < start) next.push({ ...mark, end: start });
    // ...and so does the part after it.
    if (mark.end > end) next.push({ ...mark, start: end });
  }

  if (style && end > start) next.push({ start, end, style });
  return next.sort((a, b) => a.start - b.start);
}

/** Marks trimmed to the current text, with any that became empty dropped. */
export function clampMarks(
  marks: TextStyleRange[] | undefined,
  length: number,
): TextStyleRange[] | undefined {
  if (!marks?.length) return undefined;
  const next = marks
    .map((mark) => clampRange(mark, length))
    .filter((mark): mark is TextStyleRange => mark !== null);
  return next.length ? next : undefined;
}

/** Marks dropped entirely — used when words are replaced wholesale rather than edited. */
export function clearMarks(
  marks: TextMarkMap | undefined,
  slot: TextStyleSlot,
): TextMarkMap | undefined {
  if (!marks?.[slot]) return marks;
  const next: TextMarkMap = { ...marks };
  delete next[slot];
  return Object.keys(next).length ? next : undefined;
}

/**
 * The text of one slot, split into runs by the styles laid over it.
 *
 * The single source for both surfaces: the PDF draws each run as a nested `<Text>` with the run's own
 * numbers, the workspace draws each as a `<span>` with the run's own class, and because both work from
 * this one list a marked-up paragraph looks the same in the file as it does on the page. The words are
 * transformed by `styleWords` here, per run, so a `label` run is capitals and the rest is not.
 */
export function segmentsOf(
  text: string,
  base: TextStyle | undefined,
  marks: TextStyleRange[] | undefined,
): TextRun[] {
  const trimmed = clampMarks(marks, text.length) ?? [];
  if (!trimmed.length) return text ? [{ text: styleWords(base, text), style: base }] : [];

  const runs: TextRun[] = [];
  let cursor = 0;
  for (const mark of trimmed) {
    if (mark.start > cursor) {
      const plain = text.slice(cursor, mark.start);
      runs.push({ text: styleWords(base, plain), style: base });
    }
    const marked = text.slice(mark.start, mark.end);
    const style = textStyleOf(mark.style) ?? base;
    runs.push({ text: styleWords(style, marked), style });
    cursor = mark.end;
  }
  if (cursor < text.length) {
    const rest = text.slice(cursor);
    runs.push({ text: styleWords(base, rest), style: base });
  }
  return runs.filter((run) => run.text.length > 0);
}

/**
 * The style a whole slot is set in, or mixed when its marks disagree — what the dropdown shows when
 * something is highlighted.
 */
export function styleUnderMarks(
  base: TextStyle | undefined,
  marks: TextStyleRange[] | undefined,
  range: { start: number; end: number } | undefined,
): TextStyleId | "mixed" | undefined {
  if (!marks?.length) return base?.id;
  const inside = marks.filter((mark) =>
    range ? mark.start < range.end && mark.end > range.start : true,
  );
  const ids = new Set(inside.map((mark) => mark.style));
  if (ids.size === 0) return range ? base?.id : undefined;
  if (ids.size > 1) return "mixed";
  return [...ids][0];
}

/**
 * The words as the style sets them: a label is capitals whatever was typed.
 *
 * Applied on both surfaces, so words typed in lower case read as a tag wherever they appear — and the
 * editable field is handed the same string it draws, which is what stops a capitalised label from
 * looking like an edit the moment you click out of it.
 */
export function styleWords(style: TextStyle | undefined, words: string): string {
  if (!style?.uppercase) return words;
  return words.toUpperCase();
}

/**
 * The PDF's style object for a style, so `paper` reads as one thing in the renderer.
 *
 * `extra` is layout rather than type — a margin, a max width, the flex a bullet needs — laid over the
 * chosen type so a style never moves the words it is applied to.
 */
export function paperStyle(
  style: TextStyle | undefined,
  extra?: Record<string, number | string>,
): Record<string, number | string> {
  if (!style) return { ...(extra ?? {}) };
  const { fontSize, fontFamily, color, letterSpacing, lineHeight } = style.paper;
  return {
    fontSize,
    fontFamily,
    color: PORTFOLIO_INK[color],
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(extra ?? {}),
  };
}
