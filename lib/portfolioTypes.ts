/* -------------------------------------------------------------------------- */
/* Portfolio                                                                  */
/*                                                                            */
/* The document: pages, the sections on them, and the pads behind them.       */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Pads: the layer between the page and its sections                          */
/* -------------------------------------------------------------------------- */

/**
 * A pad: a panel or a rule drawn *behind* the sections.
 *
 * Sections flow — they are laid out in rows and re-flow when a width changes — which is what makes the
 * page rearrangeable at all. That reflow is also why grouping cannot be a container: a box that "held"
 * three sections would have to move them, and then the page would stop being reflowable. So grouping
 * is a *layer* instead: a panel you place and size by hand, in the same coordinates the page uses, that
 * sections sit on top of. It is decoration with arithmetic behind it, not a straitjacket.
 *
 * Position is stored in fractions of the printable area (0–1 from the left/top margin), not in points,
 * so the same pad works on a Letter page and a wide one, and the on-screen preview at any zoom.
 */
export interface PagePad {
  id: string;
  /** Left edge, 0–1 across the printable area. */
  x: number;
  /** Top edge, 0–1 down the printable area. */
  y: number;
  /** Width and height, 0–1. A pad never leaves the printable area. */
  w: number;
  h: number;
  /** Which tone, from the fixed table. Never a raw colour: see `PAD_TONES`. */
  tone: PadTone;
  /** A short word set in the pad's own ink: "Before", "Existing", "Proposal". */
  label?: string;
  /** Corner radius in points. Rules ignore it. */
  radius?: number;
  /** Draw the outline only, leaving the page showing through. */
  outline?: boolean;
}

/**
 * The tones a pad can be.
 *
 * A named set rather than a colour picker, for two reasons. Consistency, which is the thing that
 * separates a designed page from a decorated one — tones from one catalogue always look like they
 * belong together, and a free colour wheel never does. And contrast: each tone carries the ink that is
 * legible on it, so a pad's label can be set in a colour that cannot be wrong, whatever the tone.
 *
 * Deliberately print-safe: every value is chosen to survive a greyscale printer with the ink still
 * readable against its own fill, and the suite checks the contrast rather than trusting the eye.
 *
 * Twelve of them, in a ramp from a panel you barely notice to a block you cannot miss. They were judged
 * one at a time rather than generated, which is the difference between a palette and a swatch grid.
 */
export type PadTone =
  | "wash"
  | "tint"
  | "sky"
  | "stone"
  | "sand"
  | "moss"
  | "card"
  | "rule"
  | "slate"
  | "navy"
  | "accent"
  | "ink";

/**
 * Type-only import, so the dependency runs one way: this module describes the shape of a document,
 * `presentationOptions` decides how it is shown, and nothing here needs the registry at runtime.
 */
import type { PresentationId } from "./presentationOptions";
import type { PortfolioContact } from "./portfolioContact";
import type { PortfolioTheme } from "./portfolioTheme";
import type { TextMarkMap, TextStyleMap } from "./textStyles";

/**
 * A portfolio page is built from blocks rather than free positioning.
 *
 * Free positioning in a PDF means hand-tuning coordinates for every page, and the
 * moment a caption wraps to two lines everything below it has to move. Blocks keep
 * the document reflowable while still allowing the full-bleed, wide-filmstrip and
 * side-by-side layouts a portfolio actually needs.
 */
export type PortfolioBlockKind =
  | "image"
  | "pair"
  | "filmstrip"
  | "markup"
  | "text"
  | "metrics"
  | "quote"
  | "video";

export type PortfolioPageSize = "letter" | "tabloid" | "wide" | "slide";

/**
 * How much room a frame takes on its page.
 *
 * `wide` gives a short letterbox that leaves space for other sections on the page; `tall` gives a
 * portrait frame that dominates it. This is the control that makes placement adjustable rather than
 * everything packing to the top at one fixed size.
 */
export type FrameShape = "wide" | "standard" | "tall";


/**
 * Where part of an image to show, as a 0..1 rect in the image's own coordinates.
 *
 * Fractions rather than pixels, so re-importing a higher-resolution copy of the same
 * shot keeps the framing.
 */
export interface PortfolioCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PortfolioImageRef {
  /** Key into the image store (IndexedDB), not the bytes themselves. */
  id: string;
  name: string;
  /** Natural pixel size, used to warn about resolution and to compute placed DPI. */
  width: number;
  height: number;
  crop: PortfolioCrop;
  caption?: string;
  alt?: string;
}

export type PortfolioAnnotationKind = "arrow" | "box" | "circle" | "callout" | "highlight";

/**
 * Mark-up over an image, in normalised coordinates.
 *
 * Every annotation is drawn into the page content, so it is visible in any viewer.
 * `asAnnotation` additionally emits a real PDF annotation dictionary, which is what
 * lets a reviewer select, move or delete it in Acrobat; the drawn copy stays as the
 * guarantee that it is visible everywhere either way.
 */
export interface PortfolioAnnotation {
  id: string;
  kind: PortfolioAnnotationKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  color?: string;
  asAnnotation?: boolean;
}

export interface PortfolioMetric {
  label: string;
  value: string;
}

export interface PortfolioBlock {
  id: string;
  kind: PortfolioBlockKind;
  /**
   * How this section is presented. See `lib/presentationOptions.ts` — the same content can be
   * a side-by-side pair, a page flip, a filmstrip or a grid, so the choice belongs here
   * rather than being implied by the block type.
   */
  presentation?: PresentationId;
  /** Assets this block draws from, in the media library. Content lives there, not here. */
  assetIds?: string[];
  title?: string;
  body?: string;
  images: PortfolioImageRef[];
  annotations: PortfolioAnnotation[];
  /** Frames side by side inside this section. */
  columns?: 1 | 2 | 3 | 4;
  /**
   * How much of the page's width this section takes, in twelfths.
   *
   * Twelve rather than a fraction because sections have to *add up to a row*: 6+6 is a row of two,
   * 4+4+4 a row of three, 3×4 a row of four, and 8+4 a two-thirds and a third. Integers mean the
   * flow rule is exact — no accumulated rounding deciding whether the fourth quarter fits.
   */
  span?: number;
  /**
   * How many frames this section expects, so the space can be committed before the asset exists.
   *
   * A section asks for three frames, gets three dashed placeholders at the right size and shape, and
   * each one is replaced as the picture arrives. Unset means "however many are actually here", so
   * documents written before this existed are unaffected.
   */
  slots?: number;
  /**
   * Captions typed on the page, by image id.
   *
   * The store holds what a photograph *is*; this holds what this page says about it. Typing a
   * description on the page therefore wins over the one tied to the image in the store, and the
   * store's version stays as the default for every other page showing it. That is the layering the
   * editor needs: editing where you can see the result, without losing the library.
   */
  captions?: Record<string, string>;
  /**
   * Where the section's text sits relative to its frames.
   *
   * `below` is the default and what a portfolio page usually wants. `left` and `right` put the text
   * in a column beside the frames, which is the layout that makes a wide frame and a paragraph live
   * on one page without either being an afterthought.
   */
  textPlacement?: "below" | "left" | "right" | "above" | "none";
  /**
   * How the body is set.
   *
   * `bullets` splits it on line breaks and sets each line as a bulleted item — the difference between
   * a paragraph of claims and a list a reader can scan, without a second field to keep in sync.
   */
  bodyStyle?: "paragraph" | "bullets" | "lead";
  /**
   * True once the numbers have been typed on the page, so the store's metrics stop overwriting them.
   */
  metricsEdited?: boolean;
  /**
   * How the frames are arranged when it is not a plain row.
   *
   * `cards` gives each frame its own caption underneath, which is what puts two or three
   * self-contained sections — a photograph and its description — on a single page.
   */
  layout?: "rows" | "grid" | "cards";
  /** How much room the frames take, which is what makes a page's composition adjustable. */
  shape?: FrameShape;
  /** Labels for a before/after pair. */
  beforeLabel?: string;
  afterLabel?: string;
  /**
   * How a before/after pair is presented.
   *
   * `side` puts both frames on one page, which is the most direct comparison and reads
   * the same in every viewer. `flip` gives each frame its own page, so a viewer that
   * honours page transitions wipes horizontally between them — closer to the swipe the
   * brief asked for, at the cost of two pages instead of one.
   */
  pairMode?: "side" | "flip";
  metrics?: PortfolioMetric[];
  /**
   * Type styles chosen by hand, by text slot — the six in `lib/textStyles.ts`.
   *
   * Absent means "as this section draws it today", so nothing changes until somebody chooses. A section
   * whose title is set as `label` becomes a tag; one whose body is set as `subject` leads with its first
   * line. The choice lives on the section rather than being baked into a heading, which is what lets the
   * same look be applied anywhere without touching a size.
   */
  textStyles?: TextStyleMap;
  /**
   * Styles laid over *parts* of this section's text, by character range.
   *
   * The base style says how the whole slot is set; this says where within it something differs — which is
   * what highlighting a word and choosing a style produces. The words stay plain, so the document remains
   * searchable and extractable, and the ranges are clamped whenever the text changes.
   */
  textMarks?: TextMarkMap;
  /**
   * Where the video actually lives: a PDF cannot play it in most viewers.
   */
  videoUrl?: string;
  /** Poster frame shown in place of playback. */
  videoPoster?: PortfolioImageRef | null;
}

export interface PortfolioSlide {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  blocks: PortfolioBlock[];
  /**
   * The pads behind this page's sections, in the order they are drawn.
   *
   * Later pads sit on top of earlier ones, and all of them sit under every section — the three layers
   * are the page, the pads, and the sections.
   */
  pads?: PagePad[];
  /**
   * Spread the sections over the page instead of packing them at the top.
   *
   * Both are honest layouts — a page of three cards reads well packed, a page with two things and a
   * lot of white space reads better distributed — so it is the author's call rather than a default.
   */
  fillPage?: boolean;
  /** Type styles chosen by hand for this page's own heading and its line of text. */
  textStyles?: TextStyleMap;
  /** Styles laid over parts of this page's own words, by character range. */
  textMarks?: TextMarkMap;
}

export interface PortfolioProject {
  id: string;
  name: string;
  client?: string;
  year?: string;
  role?: string;
  summary?: string;
  slides: PortfolioSlide[];
}

export interface Portfolio {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  updatedAt: string;
  pageSize: PortfolioPageSize;
  projects: PortfolioProject[];
  /**
   * The frames the cover shows, as image ids.
   *
   * Empty or unset means "the first three frames of the work", which is what a cover wants by default:
   * the portfolio shows itself. Setting them makes the cover a decision rather than an accident.
   */
  coverImages?: string[];
  /**
   * Type styles chosen by hand for the document's own words: the cover's title and its tag.
   *
   * The cover is where a style choice matters most, because the tag above the title *is* the `label`
   * style — and the same choice can be put on any section, which is what makes a page and its cover
   * look like one document.
   */
  textStyles?: TextStyleMap;
  /** Styles laid over parts of the cover's words, by character range. */
  textMarks?: TextMarkMap;
  /**
   * Emit `/Trans` page transitions (a horizontal glide) so presentation mode in
   * Acrobat advances like slides. Viewers that ignore `/Trans` simply show the
   * pages, so this is additive rather than a dependency.
   */
  transitions: boolean;
  /**
   * Also emit mark-up as real PDF annotations, so a reviewer can edit them. The drawn
   * copy is always present regardless.
   */
  annotate: boolean;
  /**
   * Emit clickable slide-to-slide navigation and outline bookmarks.
   */
  navigable: boolean;
  /**
   * The cover's contact block: tagline, email, phone, location and links.
   *
   * Separate from `author` because it is structure rather than a line of prose — and absent on a document that
   * has none, so an existing cover draws exactly what it drew before. See `lib/portfolioContact.ts`.
   */
  contact?: PortfolioContact;
  /**
   * The document's look: palette, typeface pairing and type scale.
   *
   * Absent means the default look — which is exactly what every portfolio made before this existed is, so an
   * old document opens looking the way it always did rather than being "upgraded" into someone else's taste.
   * `lib/portfolioTheme.ts` owns the choices; this field only records them.
   */
  theme?: PortfolioTheme;
}
