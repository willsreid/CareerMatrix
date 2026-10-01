import * as React from "react";
import { Document, Image, Link, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";


import type { Portfolio, PortfolioBlock, PortfolioImageRef } from "@/lib/portfolioTypes";
import type { MediaLibrary } from "@/lib/mediaLibrary";
import {
  PAD_TONES,
  frameAspect,
  frameSlots,
  planPortfolio,
  rowsOf,
  spanFraction,
} from "@/lib/portfolio";
import type { PlannedPage } from "@/lib/portfolio";
import {
  PORTFOLIO_INK,
  TEXT_STYLES,
  paperStyle,
  segmentsOf,
  styleWords,
} from "@/lib/textStyles";
import type { TextStyle, TextStyleRange } from "@/lib/textStyles";
import { applyThemeToSheet, styleIn, themedTextStyles } from "@/lib/portfolioTheme";
import type { PortfolioLink } from "@/lib/portfolioContact";


/**
 * The portfolio PDF.
 *
 * Universal tier first: everything a reader sees is page content, so it renders the
 * same in Chrome, Preview, Acrobat, Bluebeam and on a phone. The interactive layer is
 * additive and never load-bearing — navigation is real link annotations plus one named
 * destination per project, the outline pane is filled from page bookmarks, and a viewer
 * that ignores both still reads every page in order.
 *
 * `images` maps image id to an already-cropped data URL: cropping needs a browser
 * canvas, and this module has to stay renderable in a test process.
 */

/**
 * The palette, from the one table the workspace reads too — see `lib/textStyles.ts`.
 *
 * These used to be written down here and again as `.proj-*` classes in `globals.css`; a preview that
 * could disagree with the file is worse than no preview, so there is one list now and the suite checks
 * the stylesheet against it.
 */
const NAVY = PORTFOLIO_INK.navy;
const INK = PORTFOLIO_INK.ink;
const SOFT = PORTFOLIO_INK.soft;
const RULE = PORTFOLIO_INK.rule;
const ACCENT = PORTFOLIO_INK.accent;

/**
 * The style prop react-pdf accepts, so the helpers below stay honest about what they return.
 *
 * `paperStyle` deliberately returns a plain object — `lib/textStyles.ts` is read by the editor too, and
 * has no business knowing about a renderer — so the boundary between the two is here.
 */
type PdfTextStyle = Style;



export interface PortfolioPdfProps {
  portfolio: Portfolio;
  /** Image id → data URL, already cropped to the frame it is placed in. */
  images: Record<string, string>;
  /**
   * The media store the document draws from.
   *
   * This has to be passed, because content lives in the store: planning without it plans a
   * different document — every filmstrip and both halves of every flip disappear, and every frame
   * draws empty, since sections reference assets by id rather than carrying pixels. The export has
   * to plan with the same store the editor planned with, or the file does not match what was shown.
   */
  library?: MediaLibrary;
}

const BASE_SHEET = StyleSheet.create({
  page: { backgroundColor: "#ffffff", color: INK, fontFamily: "Helvetica", fontSize: 10.5 },
  coverBody: { flex: 1, justifyContent: "center", paddingHorizontal: 72, paddingVertical: 60 },
  kicker: { fontSize: 10, letterSpacing: 2.4, color: ACCENT, fontFamily: "Helvetica-Bold" },
  coverTitle: { fontFamily: "Helvetica-Bold", fontSize: 40, color: NAVY, marginTop: 14 },
  coverSub: { fontSize: 15, color: SOFT, marginTop: 10 },
  /** The cover's tagline: a line about the work, under the name. */
  coverTagline: { fontSize: 11.5, color: NAVY, marginTop: 14, maxWidth: 420 },
  /** The cover's contact line and its links, as one row of small print. */
  coverLinks: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 },
  coverLink: { fontSize: 10, color: ACCENT, fontFamily: "Helvetica-Bold" },
  coverMeta: { fontSize: 10.5, color: SOFT, marginTop: 26 },
  head: { paddingHorizontal: 54, paddingTop: 44, paddingBottom: 12 },
  headTitle: { fontFamily: "Helvetica-Bold", fontSize: 24, color: NAVY },
  headSub: { fontSize: 11.5, color: ACCENT, marginTop: 6, fontFamily: "Helvetica-Bold" },
  headBody: { fontSize: 10.5, color: SOFT, marginTop: 8, maxWidth: 420 },
  content: { flex: 1, paddingHorizontal: 54, paddingBottom: 52 },
  blockTitle: { fontFamily: "Helvetica-Bold", fontSize: 11.5, color: NAVY, marginBottom: 5 },
  body: { fontSize: 10.5, color: INK },
  caption: { fontSize: 8.6, color: SOFT, marginTop: 4 },
  row: { flexDirection: "row", gap: 10 },
  pairLabel: {
    fontSize: 8.4,
    letterSpacing: 1.2,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginBottom: 4,
  },
  tile: { flex: 1, borderWidth: 0.8, borderColor: RULE, borderRadius: 3, padding: 8 },
  tileValue: { fontFamily: "Helvetica-Bold", fontSize: 18, color: NAVY },
  tileLabel: { fontSize: 8.4, color: SOFT, marginTop: 2 },
  quote: {
    fontSize: 15,
    fontFamily: "Helvetica-Oblique",
    color: NAVY,
    paddingLeft: 12,
    borderLeftWidth: 2.4,
    borderLeftColor: ACCENT,
  },
  note: { fontSize: 8.6, color: SOFT, marginTop: 5 },
  /** A lead line: the one sentence that carries the page. */
  lead: { fontSize: 12, color: NAVY, lineHeight: 1.35, marginTop: 6 },
  /** Bulleted body text, one line per point. */
  bullet: { width: 10, fontSize: 9.6, color: ACCENT, lineHeight: 1.4 },
  bulletText: { flex: 1, fontSize: 9.6, color: INK, lineHeight: 1.4 },
  sideText: { marginTop: 2 },
  stripRow: { flexDirection: "row", gap: 14, flex: 1 },
  stripFrame: { flex: 1 },
  footer: {
    position: "absolute",
    left: 54,
    right: 54,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.4,
    color: SOFT,
  },
  navLink: { fontSize: 8.4, color: ACCENT },
  cardCaption: { fontSize: 8.6, color: SOFT, marginTop: 6, lineHeight: 1.35 },
  flipBody: { flex: 1, paddingHorizontal: 54, paddingTop: 40, paddingBottom: 48 },
  flipLabel: {
    fontSize: 11,
    letterSpacing: 2.6,
    fontFamily: "Helvetica-Bold",
    color: ACCENT,
    marginBottom: 10,
  },
  flipCaption: { fontSize: 9, color: SOFT, marginTop: 10 },
  /**
   * The hairline around a pad that has no fill.
   *
   * A sheet entry rather than an inline style so it goes through `applyThemeToSheet` like everything else: a
   * colour written into a component would be the one thing that stayed navy in a plum document.
   */
  padOutline: { borderWidth: 0.8, borderColor: RULE },
  /** The accent rule under the cover's title. */
  coverRule: { width: 64, height: 3, backgroundColor: ACCENT, marginTop: 26 },
});

/**
 * The sheet, as this document draws it.
 *
 * Components read the sheet from here rather than importing it, so a theme reaches all fifty-odd of its entries
 * without one of them having to be found and edited. The default is the untabbed sheet: a renderer used outside a
 * document — the preview harness, a test — draws exactly what it always did.
 */
const SheetContext = React.createContext(BASE_SHEET);
const useSheet = () => React.useContext(SheetContext);

/** The six styles, as this document draws them — `TEXT_STYLES` unless the document has a look. */
const TextStylesContext = React.createContext(TEXT_STYLES);
const useTextStyles = () => React.useContext(TextStylesContext);


/** Mark-up, drawn as vectors so it is visible in every viewer. */
function AnnotationLayer({
  annotations,
  width,
  height,
}: {
  annotations: PortfolioBlock["annotations"];
  width: number;
  height: number;
}) {
  if (!annotations.length) return null;
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width, height }}>
      <Svg width={width} height={height}>
        {annotations.map((annotation) => {
          const color = annotation.color ?? "#e11d48";
          const x = annotation.x * width;
          const y = annotation.y * height;
          const w = Math.max(8, annotation.w * width);
          const h = Math.max(8, annotation.h * height);
          if (annotation.kind === "arrow") {
            return (
              <Path
                key={annotation.id}
                d={`M ${x} ${y + h} L ${x + w} ${y} M ${x + w - 10} ${y + 8} L ${x + w} ${y} L ${x + w - 4} ${y + 11}`}
                stroke={color}
                strokeWidth={2}
                fill="none"
              />
            );
          }
          if (annotation.kind === "highlight") {
            return (
              <Rect key={annotation.id} x={x} y={y} width={w} height={h} fill={color} opacity={0.22} />
            );
          }
          if (annotation.kind === "circle") {
            const r = Math.min(w, h) / 2;
            return (
              <Rect
                key={annotation.id}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={r}
                ry={r}
                stroke={color}
                strokeWidth={2}
                fill="none"
              />
            );
          }
          return (
            <Rect key={annotation.id} x={x} y={y} width={w} height={h} stroke={color} strokeWidth={2} fill="none" />
          );
        })}
      </Svg>
      {annotations
        .filter((annotation) => annotation.kind === "callout" && annotation.text)
        .map((annotation) => (
          <Text
            key={`${annotation.id}-t`}
            style={{
              position: "absolute",
              left: Math.min(annotation.x * width, Math.max(0, width - 118)),
              top: Math.max(0, annotation.y * height - 14),
              width: 116,
              fontSize: 7.6,
              color: "#ffffff",
              backgroundColor: annotation.color ?? "#e11d48",
              padding: 3,
            }}
          >
            {annotation.text}
          </Text>
        ))}
    </View>
  );
}

/**
 * Draws one slot's text, with any styles laid over parts of it.
 *
 * The whole point of the range model: a sentence can mix its own styles, and the file says the same thing
 * the page card says, because both are drawn from `segmentsOf`. Each run is a nested `<Text>` whose style
 * overrides only what the style sets — size, face, colour, tracking, leading — so the rest of the line's
 * formatting is inherited and a marked word cannot accidentally reformat its neighbours.
 */
function Runs({
  text,
  base,
  marks,
  baseStyle,
}: {
  text: string;
  base: TextStyle | undefined;
  marks: TextStyleRange[] | undefined;
  /** The drawn style of the slot, which the chosen base is laid over. */
  baseStyle?: PdfTextStyle;
}) {
  const runs = segmentsOf(text, base, marks);
  const outer = baseStyle ? styled(base, baseStyle) : base ? paperStyle(base) : undefined;
  return (
    <Text style={outer}>
      {runs.map((run, index) =>
        run.style && run.style.id !== base?.id ? (
          <Text key={index} style={paperStyle(run.style)}>
            {run.text}
          </Text>
        ) : (
          <React.Fragment key={index}>{run.text}</React.Fragment>
        ),
      )}
    </Text>
  );
}

/**
 * A drawn style, with a chosen style's type laid over it.
 *
 * `chosen` comes from `resolveTextStyle`; the base is the style the renderer already uses for that
 * piece of text. The base keeps what is *layout* — margins, a max width, the flex a bullet needs — and
 * a chosen style replaces what is *type*: size, face, colour, tracking, leading. So picking "label" for
 * a caption sets it as a tag without moving it, and picking nothing leaves the page exactly as it was.
 */
function styled(chosen: ReturnType<typeof styleIn> | undefined, base: PdfTextStyle): PdfTextStyle {
  if (!chosen) return base;
  return { ...base, ...paperStyle(chosen) };
}

/** One image and its caption, at an exact frame size. */
function Figure({
  image,
  dataUrl,
  width,
  height,
  annotations,
  label,
  captionStyle,
}: {
  image?: PortfolioImageRef;
  dataUrl?: string;
  width: number;
  height: number;
  annotations?: PortfolioBlock["annotations"];
  label?: string;
  /** The caption's style: the drawn one, or a chosen style laid over it. */
  captionStyle?: PdfTextStyle;
}) {
  const S = useSheet();
  return (
    <View style={{ width }}>
      {label ? <Text style={S.pairLabel}>{label.toUpperCase()}</Text> : null}
      <View style={{ width, height, backgroundColor: "#eef2f7" }}>
        {dataUrl ? <Image src={dataUrl} style={{ width, height, objectFit: "cover" }} /> : null}
        <AnnotationLayer annotations={annotations ?? []} width={width} height={height} />
      </View>
      {image?.caption ? <Text style={captionStyle ?? S.caption}>{image.caption}</Text> : null}
    </View>
  );
}

/**
 * The pads behind a page's sections.
 *
 * Drawn before everything else on the page, so sections sit on top of them — the three layers are the
 * page, the pads, then the sections. Coordinates are fractions of the printable area (the 54pt
 * margins), which is the same box the workspace uses for its own pad layer, so a pad that lines up
 * with a section on screen lines up with it in the file.
 */
function PadLayer({ page }: { page: PlannedPage }) {
  const S = useSheet();
  const pads = page.pads ?? [];
  if (!pads.length) return null;
  const width = page.width - 108;
  const height = page.height - 108;

  return (
    <View style={{ position: "absolute", left: 54, top: 54, width, height }}>
      {pads.map((pad) => {
        const tone = PAD_TONES[pad.tone];
        // `card` is a white panel that needs its hairline to exist at all; `outline` asks for the
        // hairline with nothing behind it. A rule is a thin fill, so it takes neither.
        const outline = pad.outline || pad.tone === "card";
        return (
          <View
            key={pad.id}
            style={{
              position: "absolute",
              left: pad.x * width,
              top: pad.y * height,
              width: pad.w * width,
              height: pad.h * height,
              backgroundColor: pad.outline ? undefined : tone.fill,
              ...(outline ? S.padOutline : {}),
              borderRadius: pad.radius ?? 0,
            }}
          >
            {pad.label ? (
              <Text
                style={{
                  fontSize: 8,
                  letterSpacing: 1.4,
                  color: tone.ink,
                  paddingHorizontal: 5,
                  paddingVertical: 3,
                }}
              >
                {pad.label.toUpperCase()}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Renders one content block. Heights are computed: a PDF page cannot scroll.
 *
 * `width` is the section's own width rather than the page's, because a page is now a stack of rows
 * and a row can hold up to four sections side by side.
 */
function BlockBody({
  block,
  base = "note",
}: {
  block: PortfolioBlock;
  /** Which drawn style this body's paragraph falls back to. */
  base?: "note" | "body";
}) {
  const S = useSheet();
  const styles = useTextStyles();
  if (!block.body) return null;
  if (block.bodyStyle === "bullets") {
    const lines = block.body
      .split(/\n+/)
      .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
      .filter(Boolean);
    return (
      <View style={{ marginTop: 6 }}>
        {lines.map((line, index) => (
          <View
            key={`${index}-${line.slice(0, 12)}`}
            style={{ flexDirection: "row", marginBottom: 3 }}
          >
            <Text style={S.bullet}>•</Text>
            <Text
              style={styled(
                styleIn(styles, block.textStyles, "body"),
                S.bulletText,
              )}
            >
              {line}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  if (block.bodyStyle === "lead") {
    return (
      <Runs
        text={block.body}
        base={styleIn(styles, block.textStyles, "body")}
        marks={block.textMarks?.body}
        baseStyle={S.lead}
      />
    );
  }
  return (
    <Runs
      text={block.body}
      base={styleIn(styles, block.textStyles, "body")}
      marks={block.textMarks?.body}
      baseStyle={base === "body" ? S.body : S.note}
    />
  );
}
function Block({
  block,
  images,
  width,
  maxHeight,
}: {
  block: PortfolioBlock;
  images: Record<string, string>;
  width: number;
  maxHeight: number;
}) {
  const S = useSheet();
  const styles = useTextStyles();
  const columns = Math.max(1, Math.min(4, block.columns ?? 1));
  const full = Math.min(maxHeight, width / 1.4);

  if (block.kind === "text") {
    return (
      <View style={{ marginBottom: 14 }}>
        {block.title ? <Runs text={block.title} base={styleIn(styles, block.textStyles, "title")} marks={block.textMarks?.title} baseStyle={S.blockTitle} /> : null}
        {block.body ? (
          <Runs
            text={block.body}
            base={styleIn(styles, block.textStyles, "body")}
            marks={block.textMarks?.body}
            baseStyle={S.body}
          />
        ) : null}
      </View>
    );
  }

  if (block.kind === "quote") {
    return (
      <View style={{ marginBottom: 14 }}>
        <Text style={S.quote}>{block.body || block.title}</Text>
      </View>
    );
  }

  if (block.kind === "metrics") {
    return (
      <View style={{ ...S.row, marginBottom: 14 }}>
        {(block.metrics ?? []).map((metric) => (
          <View key={metric.label} style={S.tile}>
            <Text style={S.tileValue}>{metric.value}</Text>
            <Text style={S.tileLabel}>{metric.label}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (block.kind === "pair") {
    const frameWidth = (width - 10) / 2;
    return (
      <View style={{ marginBottom: 14 }}>
        {block.title ? <Runs text={block.title} base={styleIn(styles, block.textStyles, "title")} marks={block.textMarks?.title} baseStyle={S.blockTitle} /> : null}
        <View style={S.row}>
          <Figure
            image={block.images[0]}
            dataUrl={images[block.images[0]?.id ?? ""]}
            width={frameWidth}
            height={Math.min(maxHeight, frameWidth / 1.3)}
            label={block.beforeLabel ?? "Before"}
          />
          <Figure
            image={block.images[1]}
            dataUrl={images[block.images[1]?.id ?? ""]}
            width={frameWidth}
            height={Math.min(maxHeight, frameWidth / 1.3)}
            label={block.afterLabel ?? "After"}
          />
        </View>
        {block.body ? <BlockBody block={block} /> : null}
      </View>
    );
  }

  if (block.kind === "markup") {
    return (
      <View style={{ marginBottom: 14 }}>
        {block.title ? <Runs text={block.title} base={styleIn(styles, block.textStyles, "title")} marks={block.textMarks?.title} baseStyle={S.blockTitle} /> : null}
        <Figure
          image={block.images[0]}
          dataUrl={images[block.images[0]?.id ?? ""]}
          width={width}
          height={full}
          annotations={block.annotations}
        />
        {block.annotations.length ? (
          <Text style={S.note}>
            {block.annotations.length} mark-up
            {block.annotations.length === 1 ? "" : "s"} drawn into the page — visible in every viewer,
            not an editable annotation.
          </Text>
        ) : null}
      </View>
    );
  }

  if (block.kind === "video") {
    return (
      <View style={{ marginBottom: 14 }}>
        {block.title ? <Runs text={block.title} base={styleIn(styles, block.textStyles, "title")} marks={block.textMarks?.title} baseStyle={S.blockTitle} /> : null}
        <Figure
          image={block.videoPoster ?? undefined}
          dataUrl={images[block.videoPoster?.id ?? ""]}
          width={width}
          height={full}
        />
        {block.videoUrl ? (
          <Link src={block.videoUrl}>
            <Text style={S.navLink}>{block.videoUrl}</Text>
          </Link>
        ) : null}
        <Text style={S.note}>
          Video does not play in most PDF viewers (Chrome, Preview, phones). The frame above is the
          poster; the link is the way through.
        </Text>
      </View>
    );
  }

  /**
   * The frames of this section, including the ones that are still placeholders.
   *
   * `frameSlots` is the count the workspace draws too, so a section arranged as four frames exports
   * as four frames. A slot with no picture yet is an empty light panel: filling the page with the
   * composition you want and seeing the holes is the point, and a hole that quietly vanished at
   * export would make the arrangement a lie.
   */
  const cards = Array.from({ length: frameSlots(block) }, (_, index) => block.images[index]);
  if (!cards.length) return null;

  /**
   * Cards: each frame with its own description underneath.
   *
   * This is the layout that makes a page hold several self-contained pieces of work rather than one
   * — two, three or four photographs, each captioned — which is what a portfolio of separate jobs
   * needs and what a plain row cannot express.
   */
  if (block.layout === "cards") {
    // `columns: 1` is what a new block is given, not a choice anyone made, so cards read it as
    // "all of them across, up to four" and only narrow for 2, 3 or 4 said out loud.
    const perRow = Math.min(4, block.columns && block.columns > 1 ? block.columns : cards.length);
    const gap = 14;
    // Rows of at most four: a section that asks for eight frames gets two rows of four rather than
    // eight frames squeezed to the width of a stamp.
    const rows = chunk(cards, perRow);
    return (
      <View style={{ marginBottom: 14 }}>
        {block.title ? <Runs text={block.title} base={styleIn(styles, block.textStyles, "title")} marks={block.textMarks?.title} baseStyle={S.blockTitle} /> : null}
        {rows.map((row, rowIndex) => {
          const cardWidth = (width - (row.length - 1) * gap) / row.length;
          // The section's height is shared between its rows, so a second row cannot push the page
          // into content the plan does not know about. A single row gets exactly what it did before.
          const rowBudget = (maxHeight * 0.52) / rows.length;
          // A fixed shape so the descriptions start on the same line, which is what makes a row of
          // cards read as a row rather than as four unrelated blocks.
          const cardHeight = Math.min(rowBudget, cardWidth / frameAspect(block.shape));
          return (
            <View
              key={rowIndex}
              // Space *between* rows only: a single-row section must come out exactly the height it
              // did before, or every existing page shifts by a few points and starts spilling.
              style={rowIndex === 0 ? [S.row, { gap }] : [S.row, { gap, marginTop: 10 }]}
            >
              {row.map((image, index) => (
                <View key={image?.id ?? `slot-${rowIndex}-${index}`} style={{ width: cardWidth }}>
                  <Figure image={image} dataUrl={image ? images[image.id] : undefined} width={cardWidth} height={cardHeight} />
                  {image?.caption ? <Runs text={image.caption} base={styleIn(styles, block.textStyles, "caption")} marks={block.textMarks?.caption} baseStyle={S.cardCaption} /> : null}
                </View>
              ))}
            </View>
          );
        })}
      </View>
    );
  }

  // A plain row, or a grid, wrapped at the section's column count so four across stays four across.
  const perRow = block.layout === "grid" ? Math.max(2, columns) : columns;
  const rows = chunk(cards, perRow);
  /**
   * Where the text goes, and how wide the frames are because of it.
   *
   * A section with its words beside the frames gives the frames three fifths of the width and the
   * words a column of their own — the layout that lets a wide view and a paragraph share a page
   * without either being an afterthought. Everything else stacks, which is what a portfolio page
   * usually wants.
   */
  const placement = block.textPlacement ?? "below";
  const beside = placement === "left" || placement === "right";
  const framesWidth = beside ? width * 0.61 : width;
  const textWidth = width * 0.35;
  // The aspect comes from the shared table, so "tall" on screen is "tall" in the file — and the
  // height budget is shared between the rows, for the same reason as the cards above.
  const frameHeight = (frameWidth: number) =>
    Math.min(maxHeight / rows.length, frameWidth / frameAspect(block.shape));

  const frames = rows.map((row, rowIndex) => {
    const frameWidth = (framesWidth - (row.length - 1) * 10) / row.length;
    const height = frameHeight(frameWidth);
    return (
      <View key={rowIndex} style={rowIndex === 0 ? [S.row] : [S.row, { marginTop: 10 }]}>
        {row.map((image, index) => (
          <Figure
            key={image?.id ?? `slot-${rowIndex}-${index}`}
            image={image}
            dataUrl={image ? images[image.id] : undefined}
            width={frameWidth}
            height={height}
          />
        ))}
      </View>
    );
  });

  const words = (
    <View style={{ width: beside ? textWidth : undefined }}>
      <BlockBody block={block} />
    </View>
  );

  return (
    <View style={{ marginBottom: 14 }}>
      {block.title ? <Runs text={block.title} base={styleIn(styles, block.textStyles, "title")} marks={block.textMarks?.title} baseStyle={S.blockTitle} /> : null}
      {placement === "above" ? <BlockBody block={block} /> : null}
      {beside ? (
        <View style={[S.row, { alignItems: "flex-start" }]}>
          {placement === "left" ? (
            <>
              {words}
              {frames}
            </>
          ) : (
            <>
              {frames}
              {words}
            </>
          )}
        </View>
      ) : (
        frames
      )}
      {placement === "below" ? <BlockBody block={block} /> : null}
    </View>
  );
}

/** Splits a list into rows of at most `size`, which is how any number of frames is laid out. */
function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    rows.push(items.slice(start, start + size));
  }
  return rows;
}

/** The cover: title, subtitle, contact block, and a filmstrip of the first frames if there are any. */
function CoverPage({
  portfolio,
  images,
  frames,
  meta,
  tagline,
  contactLine,
  links,
}: {
  portfolio: Portfolio;
  images: Record<string, string>;
  /** The cover's frames, from the plan: chosen on the cover, or the first three of the work. */
  frames: PortfolioImageRef[];
  /** The meta line, from the plan, so the screen and the file cannot say different things. */
  meta?: string;
  /** The cover's contact block, also from the plan — see `lib/portfolioContact.ts`. */
  tagline?: string;
  contactLine?: string;
  links?: PortfolioLink[];
}) {
  const S = useSheet();
  const styles = useTextStyles();
  return (
    <View style={S.coverBody}>
      {/* The tag above the title is the `label` style — the one the six are named from, so choosing it
          anywhere else gives exactly this. */}
      <Runs
        text={portfolio.subtitle || "Portfolio"}
        base={styleIn(styles, portfolio.textStyles, "subtitle", "label") ?? TEXT_STYLES.label}
        marks={portfolio.textMarks?.subtitle}
        baseStyle={S.kicker}
      />
      <Runs
        text={portfolio.title}
        base={styleIn(styles, portfolio.textStyles, "title", "headline")}
        marks={portfolio.textMarks?.title}
        baseStyle={S.coverTitle}
      />
      {portfolio.author ? <Text style={S.coverSub}>{portfolio.author}</Text> : null}
      {/* The contact block, from the plan: what you are, how to reply, and where else to look. */}
      {tagline ? <Text style={S.coverTagline}>{tagline}</Text> : null}
      {contactLine ? <Text style={S.coverMeta}>{contactLine}</Text> : null}
      {links?.length ? (
        <View style={S.coverLinks}>
          {links.map((link) => (
            /* The words are drawn either way — a PDF cannot depend on a viewer honouring an annotation — and
               the annotation is laid over them, the same rule as the page navigation links. */
            <Link key={link.url} src={link.url} style={S.coverLink}>
              {link.label}
            </Link>
          ))}
        </View>
      ) : null}
      <View style={S.coverRule} />
      {/* The meta line comes from the plan, so the screen and the file say the same thing. */}
      {meta ? <Text style={S.coverMeta}>{meta}</Text> : null}
      {frames.length ? (
        <View style={{ ...S.row, marginTop: 26 }}>
          {frames.map((frame, index) => (
            <Figure
              // A cover slot with no picture is still a slot: the frame is reserved, and the panel an
              // empty frame prints as is what the workspace shows too.
              key={frame.id || `cover-${index}`}
              image={frame}
              dataUrl={images[frame.id]}
              width={132}
              height={88}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * How much height one block may take.
 *
 * A PDF page cannot scroll, so a slide whose blocks add up to more than the page does not
 * overflow visibly — the renderer silently starts another page, which breaks the "page X
 * of Y" footer and the promise that a slide is a page. So the image-bearing blocks share
 * what is left once the prose has taken its room, and every frame shrinks to fit rather
 * than pushing a page into existence.
 */
function heightBudget(
  blocks: PortfolioBlock[],
  block: PortfolioBlock,
  pageHeight: number,
): number {
  const IMAGE_KINDS: PortfolioBlock["kind"][] = ["image", "pair", "markup", "video"];
  // Divided by *row* rather than by section: two halves side by side share one band of the page, so
  // counting them as two would give the row twice the height it has.
  const imageRows = rowsOf(blocks).filter((row) =>
    row.some((entry) => IMAGE_KINDS.includes(entry.kind)),
  );
  const proseBlocks = blocks.filter((entry) => entry.kind === "text" || entry.kind === "quote");
  const available = pageHeight - 300 - proseBlocks.length * 56 - blocks.length * 14;
  const share = Math.floor(available / Math.max(1, imageRows.length));
  // Frames get small when a slide is crowded, but never invisible.
  return IMAGE_KINDS.includes(block.kind) ? Math.max(90, share) : Math.max(60, share);
}

/**
 * Builds the portfolio document.
 *
 * Exported as a function rather than a component so its return type is exactly the
 * `ReactElement<DocumentProps>` that `pdf()` wants, and so tests can render it in a Node
 * process with synthetic image data.
 */
export function buildPortfolioPdfDocument({
  portfolio,
  images,
  library,
}: PortfolioPdfProps): React.ReactElement<DocumentProps> {
  // Planned with the store, so the pages rendered are the pages the editor counted.
  const pages = planPortfolio(portfolio, library);
  /**
   * The look, applied once.
   *
   * The builder's own drawing reads these directly; everything it renders — the cover, the sections, the figures,
   * the pads — reads them from the two providers below, so a renderer cannot be handed the right sheet and the
   * wrong type or forget to ask for either.
   */
  const S = applyThemeToSheet(BASE_SHEET, portfolio.theme);
  const styles = themedTextStyles(portfolio.theme);

  return (
    <Document
      title={portfolio.title}
      author={portfolio.author || undefined}
      subject={portfolio.subtitle ?? "Portfolio"}
      creator="Career Matrix"
      producer="Career Matrix"
    >
      {/* The look reaches every component below from here, so none of them has to be told about a theme. */}
      <SheetContext.Provider value={S}><TextStylesContext.Provider value={styles}>
      {pages.map((page) => (
        <Page
          key={page.id}
          size={{ width: page.width, height: page.height }}
          style={S.page}
          bookmark={page.bookmark}
        >
          {page.kind === "cover" ? (
            <CoverPage
              portfolio={portfolio}
              images={images}
              frames={page.frames ?? []}
              meta={page.body}
              tagline={page.tagline}
              contactLine={page.contactLine}
              links={page.links}
            />
          ) : page.kind === "flip" && page.flip ? (
            /* One half of a before/after pair, drawn full width so the wipe between the
               two pages reveals the change rather than appearing to jump. */
            <View style={S.flipBody}>
              <Text style={S.flipLabel}>{page.flip.label.toUpperCase()}</Text>
              <View style={{ width: page.width - 108, height: page.height - 220 }}>
                {images[page.flip.image.id] ? (
                  <Image
                    src={images[page.flip.image.id]}
                    style={{ width: page.width - 108, height: page.height - 220, objectFit: "cover" }}
                  />
                ) : null}
              </View>
              <Text style={styled(styleIn(styles, page.textStyles, "caption"), S.flipCaption)}>
                {styleWords(styleIn(styles, page.textStyles, "caption"), page.flip.caption || page.subtitle || "")}
                {page.flip.side === "before"
                  ? "  ·  turn the page for the same view after"
                  : "  ·  the same view before this work"}
              </Text>
            </View>
          ) : page.kind === "filmstrip" ? (
            <>
              <View style={S.head}>
                {/* A filmstrip's heading is the section's, so it takes the section's own style. */}
                <Text style={styled(styleIn(styles, page.textStyles, "title"), S.headTitle)}>
                  {styleWords(styleIn(styles, page.textStyles, "title"), page.title)}
                </Text>
                {page.subtitle ? (
                  <Text style={styled(styleIn(styles, page.textStyles, "body"), S.headBody)}>
                    {styleWords(styleIn(styles, page.textStyles, "body"), page.subtitle)}
                  </Text>
                ) : null}
              </View>
              <View style={S.content}>
                <View style={S.stripRow}>
                  {(page.frames ?? []).map((frame) => (
                    <View key={frame.id} style={S.stripFrame}>
                      <Figure
                        image={frame}
                        dataUrl={images[frame.id]}
                        width={196}
                        height={140}
                      />
                    </View>
                  ))}
                </View>
                <Text style={S.note}>
                  Frames read left to right on a wide page. Every viewer shows this row; none of them
                  scrolls it, which is why it is a row and not a carousel.
                </Text>
              </View>
            </>
          ) : (
            <>
              {/* The pads first, so every section is drawn on top of them. */}
              <PadLayer page={page} />
              <View style={S.head} id={`page-${page.id}`}>
                <Runs
                  text={page.title}
                  base={styleIn(styles, page.textStyles, "title")}
                  marks={page.textMarks?.title}
                  baseStyle={S.headTitle}
                />
                {page.subtitle ? (
                  <Runs
                    text={page.subtitle}
                    base={styleIn(styles, page.textStyles, "subtitle", "subhead")}
                    marks={page.textMarks?.subtitle}
                    baseStyle={S.headSub}
                  />
                ) : null}
                {page.body ? (
                  <Runs
                    text={page.body}
                    base={styleIn(styles, page.textStyles, "body")}
                    marks={page.textMarks?.body}
                    baseStyle={S.headBody}
                  />
                ) : null}
              </View>
              <View
                style={[
                  S.content,
                  // A page with two things and a lot of white space reads better distributed; a page
                  // of three cards reads better packed. The author decides, not a default.
                  page.fillPage ? { justifyContent: "space-between" } : undefined,
                ]}
              >
                {/*
                  Sections are laid out in rows by width, using the same `rowsOf` the workspace uses:
                  a full-width section takes its own row, two halves share one, four quarters share
                  one. The width of each section is its share of the row, so a two-thirds beside a
                  third is exactly two-thirds and a third of the page.
                */}
                {rowsOf(page.blocks).map((row) => {
                  const contentWidth = page.width - 108;
                  const gap = 10;
                  const available = contentWidth - gap * (row.length - 1);
                  const laidOut = row.map((block) => (
                    <Block
                      key={block.id}
                      block={block}
                      images={images}
                      width={available * spanFraction(block)}
                      maxHeight={heightBudget(page.blocks, block, page.height)}
                    />
                  ));
                  // A row of one is not a row: it goes in the column as it always did, so a page of
                  // full-width sections keeps exactly the geometry it had before rows existed.
                  if (row.length === 1) return laidOut;
                  return (
                    <View key={row[0].id} style={[S.row, { alignItems: "flex-start" }]}>
                      {laidOut}
                    </View>
                  );
                })}
              </View>
              {portfolio.navigable ? (
                <View style={S.footer} fixed>
                  <Text>{portfolio.title}</Text>
                  <Text>
                    Page {page.pageNumber} of {pages.length}
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </Page>
      ))}
      </TextStylesContext.Provider></SheetContext.Provider>
    </Document>
  );
}
