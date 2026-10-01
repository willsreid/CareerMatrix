/* -------------------------------------------------------------------------- */
/* The look of a portfolio                                                    */
/*                                                                            */
/* A palette, a typeface pairing and a type scale — chosen per document, and   */
/* driving the preview and the PDF from the same numbers.                      */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Why a theme rather than more knobs                                         */
/*                                                                            */
/* Every page in the composer was already re-arrangeable, but the document had */
/* exactly one look: six type sizes, one typeface family and five colours, all */
/* written into the renderer. So two portfolios made with it were the same     */
/* document with different pictures in it, and there was no way to make one    */
/* yours short of editing code.                                                */
/*                                                                            */
/* A theme is deliberately *few* axes with a lot of reach. Five palettes, four */
/* pairings and three scales is 60 looks, each judged once by a person rather  */
/* than assembled at random by a colour wheel — which is the difference        */
/* between a designed page and a decorated one. Anything that needs a free hex */
/* field can be added later; nothing here needs one.                           */
/*                                                                            */
/* The one rule this module exists to keep: **the default theme is exactly     */
/* what the app already drew**, down to the hex and the point size. A document */
/* with no theme is not "unstyled", it is the harbour/helvetica/standard look  */
/* it has always had, and the suite pins the numbers together so it stays so.  */
/* -------------------------------------------------------------------------- */

import {
  PORTFOLIO_INK,
  TEXT_STYLES,
  TEXT_STYLE_ORDER,
  type PdfFontName,
  type PortfolioInkName,
  type TextStyle,
  type TextStyleId,
  type TextStyleMap,
  type TextStyleSlot,
} from "./textStyles";

/** The five colours a document is drawn in. */
export type InkSchemeId = "harbour" | "graphite" | "forest" | "plum" | "oxblood";

/** The typefaces, drawn with the standard PDF fonts so no file has to be embedded. */
export type TypePairingId = "helvetica" | "times" | "editorial" | "courier";

/** How big the type is, relative to the document's own scale. */
export type TypeScaleId = "compact" | "standard" | "roomy";

/** A document's look. Every axis is optional: an absent one is the default. */
export interface PortfolioTheme {
  scheme?: InkSchemeId;
  type?: TypePairingId;
  scale?: TypeScaleId;
}

export interface InkScheme {
  id: InkSchemeId;
  name: string;
  /** What it looks like, in the picker. */
  note: string;
  colours: Record<PortfolioInkName, string>;
}

/**
 * The five palettes.
 *
 * Each one is a *scheme* rather than a colour: a dark ink for body text, a darker navy for headings, a soft
 * grey for captions, one accent, and a hairline. The accents are all dark enough to hold their shape in
 * greyscale, which the suite checks by contrast rather than by eye.
 */
export const INK_SCHEMES: Record<InkSchemeId, InkScheme> = {
  harbour: {
    id: "harbour",
    name: "Harbour",
    note: "Deep navy with a teal accent — what the composer has always drawn.",
    colours: { ...PORTFOLIO_INK },
  },
  graphite: {
    id: "graphite",
    name: "Graphite",
    note: "Charcoal and amber. Reads as technical, holds up on a plotter.",
    colours: { ink: "#1f2227", navy: "#2b3037", soft: "#6b7280", accent: "#b45309", rule: "#cfd4da" },
  },
  forest: {
    id: "forest",
    name: "Forest",
    note: "Deep green with moss. Quieter than navy without being grey.",
    colours: { ink: "#1b201d", navy: "#14342a", soft: "#66736c", accent: "#2f6b4f", rule: "#c8d4cd" },
  },
  plum: {
    id: "plum",
    name: "Plum",
    note: "Aubergine with a dark gold accent — the least corporate of the five.",
    colours: { ink: "#1e1a24", navy: "#3a2247", soft: "#726a7c", accent: "#8a6d1f", rule: "#d5cddd" },
  },
  oxblood: {
    id: "oxblood",
    name: "Oxblood",
    note: "Maroon headings with a terracotta accent. Warm, still serious.",
    colours: { ink: "#211b1b", navy: "#521d1f", soft: "#7b6c6a", accent: "#a34d2a", rule: "#dccdc9" },
  },
};

export const INK_SCHEME_ORDER: readonly InkSchemeId[] = [
  "harbour",
  "graphite",
  "forest",
  "plum",
  "oxblood",
];

export interface TypePairing {
  id: TypePairingId;
  name: string;
  note: string;
  /** The names react-pdf draws with, from the standard 14 — no font file is embedded. */
  pdf: {
    heading: PdfFontName;
    text: PdfFontName;
    italic: PdfFontName;
  };
  /**
   * The same two families as browser stacks.
   *
   * Deliberately the families the PDF uses, in the same roles, and nothing more exotic: a preview set in
   * Georgia while the file is set in Times is a preview of a different document. Where a machine has no Times,
   * the browser falls back to whatever it calls a serif — the same class of typeface the file has committed to.
   */
  screen: { heading: string; text: string };
}

const SANS = { heading: "Helvetica-Bold", text: "Helvetica", italic: "Helvetica-Oblique" } as const;
const SERIF = { heading: "Times-Bold", text: "Times-Roman", italic: "Times-Italic" } as const;
const MONO = { heading: "Courier-Bold", text: "Courier", italic: "Courier-Oblique" } as const;

export const TYPE_PAIRINGS: Record<TypePairingId, TypePairing> = {
  helvetica: {
    id: "helvetica",
    name: "Helvetica",
    note: "One sans, everywhere — the neutral default.",
    pdf: { ...SANS },
    screen: {
      heading: "'Helvetica Neue', Helvetica, Arial, sans-serif",
      text: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    },
  },
  times: {
    id: "times",
    name: "Times",
    note: "One serif, everywhere — the most conventional choice for print.",
    pdf: { ...SERIF },
    screen: {
      heading: "'Times New Roman', Times, Georgia, serif",
      text: "'Times New Roman', Times, Georgia, serif",
    },
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    note: "Serif headings over a sans body: what a magazine would do with the same pages.",
    pdf: { heading: SERIF.heading, text: SANS.text, italic: SERIF.italic },
    screen: {
      heading: "'Times New Roman', Times, Georgia, serif",
      text: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    },
  },
  courier: {
    id: "courier",
    name: "Courier",
    note: "Monospaced throughout — a drawing set or a spec sheet rather than a brochure.",
    pdf: { ...MONO },
    screen: {
      heading: "'Courier New', Courier, monospace",
      text: "'Courier New', Courier, monospace",
    },
  },
};

export const TYPE_PAIRING_ORDER: readonly TypePairingId[] = [
  "helvetica",
  "times",
  "editorial",
  "courier",
];

export interface TypeScale {
  id: TypeScaleId;
  name: string;
  note: string;
  /** Multiplies every size in the document's type table. */
  factor: number;
}

export const TYPE_SCALES: Record<TypeScaleId, TypeScale> = {
  compact: {
    id: "compact",
    name: "Compact",
    note: "Six per cent smaller throughout: more words to a page.",
    factor: 0.94,
  },
  standard: {
    id: "standard",
    name: "Standard",
    note: "The sizes the composer was drawn with.",
    factor: 1,
  },
  roomy: {
    id: "roomy",
    name: "Roomy",
    note: "Eight per cent larger: fewer words, read from further away.",
    factor: 1.08,
  },
};

export const TYPE_SCALE_ORDER: readonly TypeScaleId[] = ["compact", "standard", "roomy"];

/** What a document looks like with nothing chosen, which is what every existing document is. */
export const DEFAULT_THEME: Required<PortfolioTheme> = {
  scheme: "harbour",
  type: "helvetica",
  scale: "standard",
};

/**
 * A theme with every axis filled in.
 *
 * Absent *and* unrecognised both mean the default: a document from a newer version, or a hand-edited backup
 * with `"scheme": "chartreuse"` in it, has to render as something rather than as a blank page.
 */
export function themeOf(theme: PortfolioTheme | undefined): Required<PortfolioTheme> {
  const scheme = theme?.scheme as InkSchemeId | undefined;
  const type = theme?.type as TypePairingId | undefined;
  const scale = theme?.scale as TypeScaleId | undefined;
  return {
    scheme: scheme && INK_SCHEMES[scheme] ? scheme : DEFAULT_THEME.scheme,
    type: type && TYPE_PAIRINGS[type] ? type : DEFAULT_THEME.type,
    scale: scale && TYPE_SCALES[scale] ? scale : DEFAULT_THEME.scale,
  };
}

/**
 * The screen size of each of the six styles, in px.
 *
 * The PDF's sizes are in points and these are what the *preview* draws, so they are not the same numbers —
 * they are the same *look*, and this table is what keeps them together. They used to be written into the
 * class strings of `TEXT_STYLES`, one arbitrary Tailwind value each; they live here now so the type scale can
 * multiply them in one place, and so the stylesheet's defaults have something to be checked against.
 */
export const SCREEN_SIZES: Record<TextStyleId, number> = {
  headline: 19,
  header: 12,
  subject: 12,
  title: 10,
  subhead: 10,
  label: 9,
};

export interface ThemeTokens {
  /** Every axis filled in, which is what the renderers want. */
  theme: Required<PortfolioTheme>;
  colours: Record<PortfolioInkName, string>;
  pairing: TypePairing;
  scale: TypeScale;
}

/** The numbers a renderer needs for a look: colours, fonts, and the factor sizes are multiplied by. */
export function themeTokens(theme: PortfolioTheme | undefined): ThemeTokens {
  const resolved = themeOf(theme);
  return {
    theme: resolved,
    colours: INK_SCHEMES[resolved.scheme].colours,
    pairing: TYPE_PAIRINGS[resolved.type],
    scale: TYPE_SCALES[resolved.scale],
  };
}

/** A size on the scale, rounded to a tenth of a point — the finest the file needs and the preview can show. */
export function scaledSize(base: number, factor: number): number {
  return Math.round(base * factor * 10) / 10;
}

/**
 * The six styles as *this* document draws them.
 *
 * Same ids, same names, same fallbacks — only the numbers move: the family comes from the pairing and every
 * size is multiplied by the scale. The PDF reads this; the workspace does not need to, because the same two
 * things reach it as CSS variables on the page. Both therefore change together, which is the only reason a
 * preview can be trusted.
 */
export function themedTextStyles(theme: PortfolioTheme | undefined): Record<TextStyleId, TextStyle> {
  const { pairing, scale } = themeTokens(theme);
  const styles = {} as Record<TextStyleId, TextStyle>;
  for (const id of TEXT_STYLE_ORDER) {
    const style = TEXT_STYLES[id];
    const family = style.paper.fontFamily;
    const resolved =
      family.endsWith("-Bold") || family.endsWith("Bold")
        ? pairing.pdf.heading
        : family.includes("Oblique") || family.includes("Italic")
          ? pairing.pdf.italic
          : pairing.pdf.text;
    const size = scaledSize(style.paper.fontSize, scale.factor);
    styles[id] = {
      ...style,
      /**
       * The picker's own description.
       *
       * The hand-written strings in the table describe the *default* document, and they say more than a size
       * and a colour ("the cover's tag (10pt, 2.4 tracked)"). Kept as they are whenever nothing has been
       * chosen, and regenerated from the numbers the moment something has — a menu that said "40pt" on a
       * document set at 37.6pt would be the one place the look was not reflected.
       */
      menu: isDefaultTheme(theme)
        ? style.menu
        : `${size}pt ${MENU_WEIGHT[family]} ${style.paper.color}${style.paper.letterSpacing ? ", tracked" : ""}`,
      paper: { ...style.paper, fontSize: size, fontFamily: resolved },
    };
  }
  return styles;
}

/**
 * How a style's weight reads in a menu, from the PDF font name it was drawn with.
 *
 * Kept beside `themedTextStyles` rather than in the table because only the themed menu needs it: the
 * hand-written `menu` strings in `TEXT_STYLES` describe the *default* document, and stay as they are.
 */
const MENU_WEIGHT: Record<string, string> = {
  Helvetica: "regular",
  "Helvetica-Bold": "bold",
  "Helvetica-Oblique": "italic",
  Times: "regular",
  "Times-Bold": "bold",
  "Times-Italic": "italic",
  Courier: "regular",
  "Courier-Bold": "bold",
  "Courier-Oblique": "italic",
};

/**
 * Whether a document is still wearing the look it was made with.
 *
 * Used for the one-line description under the controls, which should say so rather than making a person compare
 * "Harbour · Helvetica · Standard" against a default they cannot see.
 */
export function isDefaultTheme(theme: PortfolioTheme | undefined): boolean {
  const resolved = themeOf(theme);
  return (
    resolved.scheme === DEFAULT_THEME.scheme &&
    resolved.type === DEFAULT_THEME.type &&
    resolved.scale === DEFAULT_THEME.scale
  );
}

/**
 * A style sheet with a theme applied: the same layout, this document's colours, fonts and sizes.
 *
 * The default sheet is the source of truth for *what* a document is made of — every margin, every rule, every
 * size written down once — and this maps it onto a look rather than asking the renderer to know about themes.
 * One function, applied once per document, so a renderer with forty style entries does not need forty edits and
 * cannot half-follow a theme.
 *
 * Two substitutions, both by value rather than by name: the five palette hexes become the scheme's five, and a
 * `fontSize` is multiplied by the scale. Font *family* moves from the Sans duo to the pairing's own names, which
 * is the one place a renderer's default is Helvetica by construction rather than by preference.
 *
 * Only the default sheet goes through here. A style chosen *by hand* on a slot keeps the family and size the
 * table gives it — a limit worth stating plainly: the look is the document's, a hand-picked style is an override
 * of one line, and an override that quietly changed size with the document would be a surprise rather than a
 * convenience.
 */
export function applyThemeToSheet<T extends Record<string, Record<string, unknown>>>(
  sheet: T,
  theme: PortfolioTheme | undefined,
): T {
  const { colours, pairing, scale } = themeTokens(theme);
  const colourFor = new Map<string, string>(
    Object.entries(PORTFOLIO_INK).map(([role, value]) => [value.toLowerCase(), colours[role as PortfolioInkName]]),
  );
  const familyFor = (name: string): string => {
    if (name.includes("Bold")) return pairing.pdf.heading;
    if (name.includes("Oblique") || name.includes("Italic")) return pairing.pdf.italic;
    return pairing.pdf.text;
  };

  const themed: Record<string, Record<string, unknown>> = {};
  for (const [key, style] of Object.entries(sheet)) {
    const next: Record<string, unknown> = {};
    for (const [property, value] of Object.entries(style)) {
      if (typeof value === "string" && colourFor.has(value.toLowerCase())) {
        next[property] = colourFor.get(value.toLowerCase());
      } else if (property === "fontSize" && typeof value === "number") {
        next[property] = scaledSize(value, scale.factor);
      } else if (property === "fontFamily" && typeof value === "string") {
        next[property] = familyFor(value);
      } else {
        next[property] = value;
      }
    }
    themed[key] = next;
  }
  return themed as T;
}

/**
 * The style a slot is set in, from a table that may be themed.
 *
 * The same rule as `resolveTextStyle`: the id chosen by hand if it names a real style, otherwise the slot's own
 * fallback. It takes the table as an argument instead of reading `TEXT_STYLES`, which is what lets the PDF pass
 * the document's own styles and the workspace keep using the static table it draws classes from.
 */
export function styleIn(
  styles: Record<TextStyleId, TextStyle>,
  map: TextStyleMap | undefined,
  slot: TextStyleSlot,
  fallback?: TextStyleId,
): TextStyle | undefined {
  const chosen = map?.[slot];
  const id = chosen && chosen in styles ? chosen : fallback;
  return id ? styles[id] : undefined;
}

/**
 * A theme from stored data, keeping only what is recognised.
 *
 * Called on the way in from localStorage, from an imported backup and from an update, so a document can only
 * ever hold a scheme, a pairing and a scale that exist. Anything else — an id from a version that has been
 * renamed, a string where an object belongs, a number where an id belongs — is dropped, and a dropped axis is
 * the default. Returns undefined when there is nothing left, so a document with no look stays a document with
 * no look rather than gaining an empty object.
 */
export function cleanTheme(raw: unknown): PortfolioTheme | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  const theme: PortfolioTheme = {};
  if (typeof candidate.scheme === "string" && candidate.scheme in INK_SCHEMES) {
    theme.scheme = candidate.scheme as InkSchemeId;
  }
  if (typeof candidate.type === "string" && candidate.type in TYPE_PAIRINGS) {
    theme.type = candidate.type as TypePairingId;
  }
  if (typeof candidate.scale === "string" && candidate.scale in TYPE_SCALES) {
    theme.scale = candidate.scale as TypeScaleId;
  }
  return Object.keys(theme).length ? theme : undefined;
}

/**
 * The look as CSS custom properties, for the page the workspace draws.
 *
 * Concrete values rather than `calc()`, because the PDF does the same arithmetic in `themedTextStyles` and two
 * engines doing the same multiplication is what makes them agree — where two engines sharing one `calc()` would
 * simply be two engines disagreeing later.
 *
 * The names are the contract: `globals.css` reads each one with today's value as its fallback, so a page whose
 * variables are never set renders exactly as it did before any of this existed.
 */
export function themeVariables(theme: PortfolioTheme | undefined): Record<string, string> {
  const { colours, pairing, scale } = themeTokens(theme);
  const variables: Record<string, string> = {
    "--proj-ink": colours.ink,
    "--proj-navy": colours.navy,
    "--proj-soft": colours.soft,
    "--proj-accent": colours.accent,
    "--proj-rule": colours.rule,
    "--proj-font-heading": pairing.screen.heading,
    "--proj-font-text": pairing.screen.text,
  };
  for (const id of TEXT_STYLE_ORDER) {
    variables[`--proj-size-${id}`] = `${scaledSize(SCREEN_SIZES[id], scale.factor)}px`;
  }
  return variables;
}

