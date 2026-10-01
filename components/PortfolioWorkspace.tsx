"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Clipboard as ClipboardIcon,
  Eye,
  GripVertical,
  ImageOff,
  Minus,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { PRESENTATION_OPTIONS, inferPresentation, type PresentationId } from "@/lib/presentationOptions";
import type { MediaLibrary } from "@/lib/mediaLibrary";
import { EditableText } from "@/components/EditableText";
import {
  PORTFOLIO_INK,
  SLOT_DRAWN_AS,
  TEXT_STYLES,
  resolveTextStyle,
  segmentsOf,
  styleWords,
  type TextStyle,
  type TextStyleId,
  type TextStyleRange,
  type TextStyleSlot,
} from "@/lib/textStyles";

import {
  BLOCK_SPANS,
  GRID_SPAN,
  LINE_STYLES,
  PAD_TONE_ORDER,
  PAD_TONES,
  blockSpan,
  clickClearsTools,
  dragPad,
  frameAspect,
  frameSlots,
  pageBlockId,
  planImageIds,
  rowsOf,
  snapPad,
  type PlannedPage,
} from "@/lib/portfolio";
import type { FrameShape, PagePad, PortfolioBlock } from "@/lib/portfolioTypes";
import { Button } from "@/components/ui/button";
import { useImageData } from "@/components/useImageData";
import { cn } from "@/lib/utils";

/**
 * The portfolio workspace: the pages, at their real proportions, with the store alongside.
 *
 * This is the portfolio's equivalent of the resume sheet — you look at the thing you are making
 * rather than at a list of its parts. It is HTML rather than the PDF renderer so it can be edited
 * in place, which means it is a *proportional* preview: the same plan, the same order, the same page
 * sizes, drawn with web layout instead of paper.
 *
 * It is not the last word on what prints — nothing drawn with web layout can be, because the PDF has
 * its own text engine and its own idea of a millimetre. `PortfolioPdfPreview` renders the real file
 * from the same plan, and that one *is* the document. This is the surface you arrange on; that is the
 * surface you check against.
 *
 * Two rules keep this usable in a dark theme: nothing drawn on a page uses theme colours, because a
 * page is white whatever the app around it is doing, and anything editable outside a page sits on an
 * opaque panel rather than floating over the page's own artwork.
 */

/**
 * The printable margins, as fractions of the page: the same 54pt box the PDF lays its content and its
 * pads out in. Percentages on `top`/`bottom` resolve against the box's height and on `left`/`right`
 * against its width, which is why the box is positioned rather than padded — padding would resolve
 * every side against the width and the vertical margins would come out wrong.
 */
const PAGE_MARGIN_X = "8.82%";
const PAGE_MARGIN_Y = "6.82%";
/**
 * Where the footer sits, as a fraction of the page's height.
 *
 * The file puts it 24pt from the bottom edge of a Letter page — in the *margin*, below the printable box,
 * not inside it among the sections. Drawn inside the box it looked like part of the content and pushed
 * against the last row of sections, which is exactly the "not correlating" a reader notices first.
 */
const FOOTER_MARGIN_Y = "3.03%";

/**
 * How wide a page card grows before it stops, in pixels.
 *
 * Two pages across instead of three was meant to leave room for the panels beside the document *without*
 * making the pages bigger. A grid column with no ceiling does the opposite: the extra room becomes a larger
 * page, and the panels then take that room back, so opening a panel shrinks a page that had just been
 * enlarged to make space for it. This is roughly what a Letter page measured at three across — so the pages
 * look the way they looked, and the room the panels take comes out of the empty space beside them.
 */
const PAGE_CARD_MAX_PX = 420;

/**
 * What a reader can click, spelled out for whoever is looking at the page.
 *
 * Hyperlinks are out of scope for now on both surfaces: the file's footer used to draw the projects as link
 * text, which cannot be anything but a dead link on a card, and there is no way to *author* a link yet. They
 * come back as their own **hyperlink section** — a section with an address and its own settings — rather
 * than as something the footer does on its own.
 */
const hyperlinksNote =
  "Hyperlinks are off for now. A link will come back as its own hyperlink section, with the address set on the section itself.";


/** Which part of a pad is being dragged. */
type PadDragMode = "move" | "nw" | "ne" | "sw" | "se" | "w" | "e";

/**
 * The edits you make *on the page*: words, numbers, pictures, and where the text sits.
 *
 * Grouped into one prop because they are one idea — the page is where you edit — and because
 * threading eight more callbacks separately would bury the structural ones (`onMoveBlock`,
 * `onDeleteBlock`, the page moves) that this component's real work is.
 *
 * The words typed here are written to the *document*, not to the store: the store is the library
 * (what a photograph is, what a piece of writing says by default), and the page is the document,
 * which is what gets printed. A caption typed on a page therefore wins over the one tied to the
 * image in the store, for that page only.
 */
export interface WorkspaceEdits {
  slideText: (pageId: string, patch: { title?: string; subtitle?: string; body?: string }) => void;
  blockText: (blockId: string, patch: { title?: string; body?: string; videoUrl?: string }) => void;
  caption: (blockId: string, imageId: string, caption: string) => void;
  metric: (blockId: string, index: number, patch: { label?: string; value?: string }) => void;
  textPlacement: (blockId: string, placement: NonNullable<PortfolioBlock["textPlacement"]>) => void;
  bodyStyle: (blockId: string, style: NonNullable<PortfolioBlock["bodyStyle"]>) => void;
  /** Imports a picture file straight into a section's frame — and into the store with it. */
  importImage: (blockId: string, index: number, file: File) => void;
  /** Moves a section onto another page, in this project or another. */
  moveToPage: (blockId: string, pageId: string, index?: number) => void;
  /** Moves or resizes a pad. Called once per drag, on release. */
  pad: (padId: string, patch: Partial<PagePad>) => void;
  /** Adds a pad to a page: a panel, or `"rule"` for a line. */
  addPad: (pageId: string, kind?: "rule") => void;
  removePad: (padId: string) => void;
  /** The document's own words: the title, the standfirst and the author on the cover. */
  portfolioText: (patch: { title?: string; subtitle?: string; author?: string }) => void;
  /** Imports a picture into a cover slot; a negative index fills the first free slot. */
  coverImage: (index: number, file: File) => void;
  /** Empties a cover slot. */
  clearCoverImage: (index: number) => void;
  /** Saves a whole section to the clipboard, to place again on any page. */
  /** Saves a section's words to the clipboard as a text module. */
  saveText: (blockId: string) => void;
  /** Opens the page-layout picker for one page: the shape changes, nothing else does. */
  chooseLayout: (pageId: string) => void;
  /** Sets a section's text style by hand, or clears it back to the drawn default. */
  blockTextStyle: (blockId: string, slot: TextStyleSlot, style: TextStyleId | null) => void;
  /** Sets a page's own heading or line of text style by hand, or clears it. */
  slideTextStyle: (pageId: string, slot: TextStyleSlot, style: TextStyleId | null) => void;
  /** Sets the document's own words — the cover's title and its tag — or clears them. */
  portfolioTextStyle: (slot: TextStyleSlot, style: TextStyleId | null) => void;
  /** Types a before/after label on the pair itself, which is where the flip pages read it from. */
  blockLabel: (blockId: string, side: "before" | "after", label: string) => void;
  /** Told where the reader highlighted text, so the style dropdown can act on exactly that. */
  selectText: (target: TextStyleTarget, range: { start: number; end: number } | null, words?: string) => void;
}

/**
 * The pads on a page: the layer between the paper and the sections.
 *
 * Painted under the content (`z-0` against the content's `z-1`), and *hit-testable* only where no
 * section is drawn over it — the layer itself passes pointer events through, and each pad takes them.
 * So clicking a section selects the section, and clicking the space beside it selects the pad behind,
 * which is what you would want if you had placed a panel and then wanted to adjust it.
 *
 * A drag is previewed locally and committed once, on release: committing per pointer-move would push
 * a hundred undo steps for one gesture, and undo would stop being useful.
 */
function PagePads({
  pads,
  selectedId,
  editable,
  onSelect,
  onBeginDrag,
  onLabel,
}: {
  pads: PagePad[];
  selectedId: string | null;
  /** True when this is the page being worked on, so the selected pad's label can be typed. */
  editable: boolean;
  onSelect: (padId: string | null) => void;
  onBeginDrag: (event: React.PointerEvent, pad: PagePad, mode: PadDragMode) => void;
  onLabel: (padId: string, label: string) => void;
}) {
  if (!pads.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      {pads.map((pad) => {
        const tone = PAD_TONES[pad.tone];
        const selected = pad.id === selectedId;
        const outline = pad.outline || pad.tone === "card";
        /**
         * Is this a *line* rather than a panel?
         *
         * A rule is a pad with almost no height: a hairline is 2.4pt of a Letter page, which is about three
         * pixels on a card — and three pixels is not something anyone can point at. Thin pads get a grab band
         * around them and handles at their **ends**; panels get corner handles. `medium` is the dividing line:
         * thicker than that and it is a block you can see, not a line you are aiming at.
         */
        const thin = pad.h < LINE_STYLES.medium.height;
        return (
          <div
            key={pad.id}
            data-pad
            data-pad-thin={thin ? "true" : undefined}
            onPointerDown={(event) => onBeginDrag(event, pad, "move")}
            onClick={(event) => {
              // The layer is inert; this pad is not. Stopping here keeps the page's own click (which
              // deselects) from immediately undoing the selection.
              event.stopPropagation();
              onSelect(pad.id);
            }}
            title={
              thin
                ? `${PAD_TONES[pad.tone].label} line — drag anywhere near it to move it, or its ends to change its length`
                : `${PAD_TONES[pad.tone].label} pad — drag to move, or a corner to resize`
            }
            className={cn(
              "pointer-events-auto absolute",
              selected ? "cursor-move" : "cursor-pointer",
            )}
            style={{
              left: `${pad.x * 100}%`,
              top: `${pad.y * 100}%`,
              width: `${pad.w * 100}%`,
              height: `${pad.h * 100}%`,
              backgroundColor: pad.outline ? undefined : tone.fill,
              border: outline ? "1px solid #c9d2de" : undefined,
              borderRadius: pad.radius ?? 0,
              // Selection, drawn where it can be seen. A panel gets an inset ring — it cannot shift the pad's
              // geometry by a pixel — but an inset ring on a three-pixel line is invisible, so a line gets a
              // dashed ring *around* itself instead. Outlines do not affect layout either.
              boxShadow: selected && !thin ? "inset 0 0 0 1.5px #0f766e" : undefined,
              outline: selected && thin ? "1.5px dashed #0f766e" : undefined,
              outlineOffset: selected && thin ? 4 : undefined,
            }}
          >
            {/*
              The grab band: an invisible strip that reaches a few pixels past the pad on every side, wired to
              the same drag and the same selection.
              It is here because a line is three pixels tall and nothing that thin can be grabbed reliably —
              you had to hit the line itself, and the corner handles of a three-pixel strip sat on top of each
              other. It changes the *hit* area and nothing else: the pad is still drawn exactly where it will
              print. Where a section's own words overlap the band the section wins, because the sections layer
              is above the pads layer — so this never steals a click from a caption.
            */}
            <span
              data-pad-band
              aria-hidden
              onPointerDown={(event) => onBeginDrag(event, pad, "move")}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(pad.id);
              }}
              className={cn(
                "absolute cursor-move",
                thin ? "-inset-y-2 -left-2 -right-2" : "-inset-y-0.5 -left-0.5 -right-0.5",
              )}
            />
            {/* The pad's own word, typed where it is read. It is the one piece of a pad that is text,
                so it is editable in place like every other word on the page — the inspector's label
                field and this are the same field, which is why typing in one shows in the other.
                `relative` keeps the word above the grab band, so clicking the word puts the caret in it. */}
            {pad.label || (selected && editable) ? (
              <EditableText
                as="span"
                editable={selected && editable}
                value={pad.label ?? ""}
                className="relative block px-1 pt-0.5 text-[8px] uppercase leading-tight tracking-[0.14em]"
                style={{ color: tone.ink }}
                placeholder="label"
                onCommit={(next) => onLabel(pad.id, next)}
              />
            ) : null}
            {selected ? (
              thin ? (
                // A line resizes from its ends: its thickness is the **line style** dropdown above, so a corner
                // handle on a three-pixel strip would only be in the way of the other three.
                (["w", "e"] as const).map((end) => (
                  <span
                    key={end}
                    data-pad-handle={end}
                    onPointerDown={(event) => onBeginDrag(event, pad, end)}
                    title="Drag to move this end — the line's length, snapped to the page's columns"
                    className={cn(
                      "absolute top-1/2 h-4 w-3 -translate-y-1/2 cursor-ew-resize rounded-[2px] border border-white bg-teal-600",
                      end === "w" ? "-left-1.5" : "-right-1.5",
                    )}
                  />
                ))
              ) : (
                (["nw", "ne", "sw", "se"] as const).map((corner) => (
                  <span
                    key={corner}
                    data-pad-handle={corner}
                    onPointerDown={(event) => onBeginDrag(event, pad, corner)}
                    className={cn(
                      "absolute h-3 w-3 rounded-[2px] border border-white bg-teal-600",
                      corner === "nw" && "-left-1.5 -top-1.5 cursor-nwse-resize",
                      corner === "ne" && "-right-1.5 -top-1.5 cursor-nesw-resize",
                      corner === "sw" && "-bottom-1.5 -left-1.5 cursor-nesw-resize",
                      corner === "se" && "-bottom-1.5 -right-1.5 cursor-nwse-resize",
                    )}
                  />
                ))
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A frame: the picture, or the panel that prints in its place.
 *
 * An empty frame is drawn as the *printed* panel rather than as a dark dashed hole, so the space you
 * reserved looks like the space you will get. The label sits underneath it, outside the frame, which
 * is why the panel itself can be an honest match: nothing editor-only is drawn inside it. The colour
 * comes from `.proj-empty`, which is the PDF's own panel colour.
 *
 * Exported so a test can mount one frame and ask the only question that matters about it: with pixels for
 * that id, is this a picture, and without, is it the printed panel? Both halves are asserted, because a
 * preview that shows a panel where the file will show a photograph is worse than no preview.
 */
export function Frame({
  id,
  data,
  className,
  ratio,
  label,
}: {
  id?: string;
  data: Record<string, string>;
  className?: string;
  ratio?: number;
  /** What to say underneath an empty frame. */
  label?: string;
}) {
  const source = id ? data[id] : undefined;
  return (
    <div className={cn("min-w-0", className)}>
      {source ? (
        <div className="overflow-hidden rounded-[3px]" style={{ aspectRatio: ratio ? String(ratio) : undefined }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={source} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        // The panel the PDF paints in this frame's place: same colour, same hairline, same size and
        // shape. The label goes underneath, outside the panel, so nothing editor-only is drawn
        // inside the thing you are matching against the print.
        <div
          className="proj-empty rounded-[3px]"
          style={{ aspectRatio: ratio ? String(ratio) : undefined }}
        />
      )}
      {!source && label ? (
        <p className="proj-soft mt-0.5 flex items-center gap-0.5 text-[8px] leading-tight">
          <ImageOff className="h-2.5 w-2.5" />
          {label}
        </p>
      ) : null}
    </div>
  );
}

/** The room a variation wants, in two or three words, for the chip that offers it. */
function spaceHint(option: { ownsPages: boolean; frames?: number }): string {
  if (option.ownsPages) return "own pages";
  return option.frames ? `${option.frames} frame${option.frames === 1 ? "" : "s"}` : "no frames";
}

/**
 * A picture from the machine, straight into this frame.
 *
 * The file is imported *and* kept: the pixels go to the image store and an asset appears in the
 * library, so it can be pulled into any other section later without importing it twice. Doing it here
 * rather than in the store first is the whole point — you are looking at the hole you want to fill.
 */
function ImportButton({ label, onPick }: { label: string; onPick: (file: File) => void }) {
  return (
    <label className="proj-rule mt-0.5 flex cursor-pointer items-center justify-center gap-0.5 rounded border border-dashed px-1 py-0.5 text-[8px] proj-soft hover:border-slate-500 hover:text-slate-900">
      <Upload className="h-2.5 w-2.5" />
      {label}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared first: picking the same file twice in a row has to fire twice.
          event.target.value = "";
          if (file) onPick(file);
        }}
      />
    </label>
  );
}

/**
 * The section's text, set the way the section asked for.
 *
 * Mirrors `BlockBody` in the PDF document, so a bulleted list is a list on screen and on paper. The
 * text is editable in place when its section is the selected one: what you type is what prints.
 */
function SectionBody({
  block,
  editable,
  edits,
}: {
  block: PortfolioBlock;
  editable: boolean;
  edits: WorkspaceEdits;
}) {
  /**
   * The words' style, chosen or drawn.
   *
   * A chosen style *replaces* the look so the picker means something; with nothing chosen this is the
   * same class the section has always used, so an untouched page is unchanged.
   */
  const words = resolveTextStyle(block.textStyles, "body");
  const wordsWords = (text: string) => styleWords(words, text);
  /** Told which characters were highlighted in the body, in the body's own numbers. */
  const reportBodyWords = (range: { start: number; end: number } | null, words: string) =>
    edits.selectText(
      { kind: "block", blockId: block.id, slot: "body", text: block.body ?? "" },
      range,
      words,
    );
  if (block.bodyStyle === "bullets") {
    const lines = (block.body ?? "").split(/\n+/).filter((line) => line.trim());
    return (
      <ul className="space-y-[2%]">
        {(lines.length ? lines : [""]).map((line, index) => (
          <li key={index} className="flex gap-1">
            <span className="proj-accent">•</span>
            <EditableText
              as="span"
              multiline={false}
              editable={editable}
              value={wordsWords(line.replace(/^[-•*]\s*/, ""))}
              segments={textRuns(line.replace(/^[-•*]\s*/, ""), words, block.textMarks?.body)}
              onSelectRange={reportBodyWords}
              className={cn(words ? words.className : "proj-ink text-[9.5px] leading-snug")}
              placeholder="a point"
              onCommit={(next) => {
                // Committed as one list, because a list is one body: editing the third point
                // rewrites the third line rather than inventing a second field to keep in step.
                const merged = (lines.length ? lines : [""]).map((entry, position) =>
                  position === index ? next.replace(/\n+/g, " ") : entry.replace(/^[-•*]\s*/, ""),
                );
                edits.blockText(block.id, { body: merged.join("\n") });
              }}
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <EditableText
      as="p"
      multiline
      editable={editable}
      value={wordsWords(block.body ?? "")}
      segments={textRuns(block.body ?? "", words, block.textMarks?.body)}
      onSelectRange={reportBodyWords}
      className={cn(
        "leading-snug",
        words
          ? words.className
          : block.bodyStyle === "lead"
            ? "proj-navy text-[12px]"
            : "proj-ink text-[10px]",
      )}
      placeholder="type here"
      onCommit={(next) => edits.blockText(block.id, { body: next })}
    />
  );
}

/** The frame arrangements, mirroring what the PDF renderer does with the same block. */
function BlockFrames({
  block,
  data,
  editable,
  edits,
}: {
  block: PortfolioBlock;
  data: Record<string, string>;
  /** True when this section is the one being edited, so its captions can be typed on the page. */
  editable: boolean;
  edits: WorkspaceEdits;
}) {
  /**
   * The frames, placeholders included, from the same count the renderer uses.
   *
   * If the two disagreed the preview would stop being a preview — you would arrange four frames and
   * export two — so `frameSlots` is shared rather than re-derived here.
   */
  const frames = Array.from(
    { length: frameSlots(block) },
    (_, index) => block.images[index] as PortfolioBlock["images"][number] | undefined,
  );
  /** The description's style, for the captions under cards. */
  const captionStyle = resolveTextStyle(block.textStyles, "caption");

  if (block.metrics?.length) {
    return (
      <div className="flex gap-[2%]">
        {block.metrics.slice(0, 4).map((metric, index) => (
          <div key={`${index}-${metric.label}`} className="min-w-0 flex-1">
            <EditableText
              as="p"
              editable={editable}
              value={metric.value}
              className="proj-navy text-[15px] font-semibold leading-none"
              onCommit={(next) => edits.metric(block.id, index, { value: next })}
            />
            <EditableText
              as="p"
              editable={editable}
              value={metric.label}
              className="proj-soft mt-0.5 text-[9px] leading-snug"
              onCommit={(next) => edits.metric(block.id, index, { label: next })}
            />
          </div>
        ))}
      </div>
    );
  }

  if (!frames.length) {
    return (
      <div className="space-y-1">
        <SectionBody block={block} editable={editable} edits={edits} />
        {/* A section with no frames and no words is somewhere to put a picture: say so, and make it
            one click rather than a trip to the store and back. */}
        {block.body ? null : (
          <ImportButton
            label="add a picture"
            onPick={(file) => edits.importImage(block.id, 0, file)}
          />
        )}
      </div>
    );
  }

  // Cards keep their own description under each frame; a plain row does not. Both wrap at the
  // section's column count, so four across stays four across.
  const perRow =
    block.layout === "cards"
      ? Math.max(1, Math.min(4, block.columns ?? frames.length))
      : Math.max(1, Math.min(4, block.columns ?? 1));
  const rows: (typeof frames)[] = [];
  for (let start = 0; start < frames.length; start += perRow) {
    rows.push(frames.slice(start, start + perRow));
  }

  return (
    <div className="space-y-[2%]">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-[1.5%]">
          {row.map((image, index) => {
            const position = rowIndex * perRow + index + 1;
            /**
             * The before/after labels, which a pair draws above its two frames.
             *
             * Only the first two frames are labelled, matching the renderer: a pair is a comparison of
             * two, and labelling a third would promise something the file does not show.
             */
            const side =
              block.kind === "pair" && index < 2 ? (index === 0 ? "before" : "after") : undefined;
            return (
              <div key={image?.id ?? `slot-${position}`} className="min-w-0 flex-1">
                {side ? (
                  <EditableText
                    as="p"
                    editable={editable}
                    value={(side === "before"
                      ? block.beforeLabel ?? "Before"
                      : block.afterLabel ?? "After"
                    ).toUpperCase()}
                    className="proj-accent mb-0.5 text-[8px] font-semibold uppercase tracking-[0.14em]"
                    placeholder={side}
                    onCommit={(next) => edits.blockLabel(block.id, side, next)}
                  />
                ) : null}
                <Frame
                  id={image?.id}
                  data={data}
                  ratio={frameAspect(block.shape)}
                  label={`frame ${position}`}
                />
                {/* Every empty frame can be filled from here. The picture is imported into the store
                    as it lands, so the same shot is available to every other section afterwards. */}
                {image?.id ? null : (
                  <ImportButton
                    label="add a picture"
                    onPick={(file) => edits.importImage(block.id, position - 1, file)}
                  />
                )}
                {block.layout === "cards" ? (
                  image?.id ? (
                    <EditableText
                      as="p"
                      editable={editable}
                      value={styleWords(captionStyle, image.caption ?? "")}
                      segments={textRuns(
                        image.caption ?? "",
                        captionStyle,
                        block.textMarks?.caption,
                      )}
                      onSelectRange={(range, words) =>
                        edits.selectText(
                          {
                            kind: "block",
                            blockId: block.id,
                            slot: "caption",
                            text: image.caption ?? "",
                          },
                          range,
                          words,
                        )
                      }
                      className={cn(
                        "mt-1 text-[9px] leading-snug",
                        captionStyle ? captionStyle.className : "proj-soft",
                      )}
                      placeholder="describe it"
                      onCommit={(next) => edits.caption(block.id, image.id, next)}
                    />
                  ) : (
                    <p className="proj-soft mt-1 text-[9px] italic leading-snug opacity-70">
                      waiting for a picture
                    </p>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * The selected pad's controls: which tone, what it says, and nothing that would make it inconsistent.
 *
 * No colour picker, on purpose: six tones from one palette look like they belong together, and every tone
 * carries the ink that is legible on it, so a pad's own label cannot be set in something unreadable. Its
 * *shape* — thickness and corner roundness — is the **line style** and **pad style** dropdowns, which live
 * with the rest of the modifiers in the left panel.
 */
export function PadInspector({
  pad,
  page,
  onUpdate,
  onDelete,
  onClose,
}: {
  pad: PagePad;
  page: PlannedPage;
  onUpdate: (patch: Partial<PagePad>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const tone = PAD_TONES[pad.tone];
  /** The fractions are the storage; a reader wants percentages. */
  const at = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <div className="space-y-2">
      {/*
        The pad's controls, laid out for the width they actually have.
        They used to sit in a four-column grid inside a 19rem panel — the breakpoints were the *window's*, so
        on any normal screen each group was about 65px wide and the tone names, the chips and the label field
        were all crushed into slivers. One full-width group per row, with two equal columns only where the
        choices are short and equal (six tones, filled or outline), is what makes them readable without making
        the panel any wider.
      */}
      <div className="flex items-center gap-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
          pad
        </span>
        <span className="min-w-0 truncate text-xs font-semibold">
          {tone.label} · page {page.pageNumber}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-[11px]" onClick={onClose}>
          Done
        </Button>
      </div>

      {/* Where it sits, in the page's own percentages: two short lines rather than one that wraps. */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded border border-border bg-background/60 p-1.5 text-[11px] text-muted-foreground">
        <span>left {at(pad.x)}</span>
        <span>top {at(pad.y)}</span>
        <span>{at(pad.w)} wide</span>
        <span>{at(pad.h)} tall</span>
      </div>

      <ControlGroup
        label="tone"
        hint="One palette, so every page stays consistent. Each tone brings its own ink for the label."
        columns={2}
      >
        {PAD_TONE_ORDER.map((id) => (
          <button
            key={id}
            type="button"
            title={PAD_TONES[id].hint}
            onClick={() => onUpdate({ tone: id })}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded border px-1.5 py-1 text-[11px]",
              pad.tone === id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
            )}
          >
            <span
              className="h-3 w-3 shrink-0 rounded-[2px] border border-black/10"
              style={{ backgroundColor: PAD_TONES[id].fill }}
            />
            <span className="truncate">{PAD_TONES[id].label}</span>
          </button>
        ))}
      </ControlGroup>

      <ControlGroup
        label="fill"
        hint="Outline leaves the page showing through, which is what a rule usually wants."
        columns={2}
      >
        <Pill
          className="w-full"
          title="Solid, in the tone's fill colour"
          active={!pad.outline}
          onClick={() => onUpdate({ outline: false })}
        >
          filled
        </Pill>
        <Pill
          className="w-full"
          title="Outline only — the tone's line, no fill"
          active={Boolean(pad.outline)}
          onClick={() => onUpdate({ outline: true })}
        >
          outline
        </Pill>
      </ControlGroup>

      <ControlGroup
        label="width"
        hint="Snaps to the same twelve columns the sections use, so panels line up."
        columns={2}
      >
        <Pill
          className="col-span-2 w-full"
          title="Full printable width"
          active={pad.w === 1 && pad.x === 0}
          onClick={() => onUpdate({ x: 0, w: 1 })}
        >
          full width
        </Pill>
        <Pill
          className="w-full"
          title="Half the printable width, from the left margin"
          active={Math.abs(pad.w - 0.5) < 0.02}
          onClick={() => onUpdate({ x: 0, w: 0.5 })}
        >
          half
        </Pill>
        <Pill
          className="w-full"
          title="A third — three fit across"
          active={Math.abs(pad.w - 1 / 3) < 0.02}
          onClick={() => onUpdate({ w: 1 / 3 })}
        >
          a third
        </Pill>
      </ControlGroup>

      <ControlGroup label="label" hint="Drawn in the tone's own ink, so it is legible on the fill.">
        <input
          value={pad.label ?? ""}
          placeholder="Before, Existing, Proposal…"
          aria-label="Pad label"
          onChange={(event) => onUpdate({ label: event.target.value })}
          className="h-7 w-full rounded border border-input bg-background px-1.5 text-[11px]"
        />
      </ControlGroup>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        How thick it is and how round its corners are: <b>line style</b> and <b>pad style</b>, above. Drag it
        to move it — or drag <i>near</i> a line, because a hairline is three pixels tall and the strip around
        it is what you can actually catch. <b>Arrow keys</b> nudge it half a percent at a time, ⌥+arrow moves a
        whole column, and ⇧+arrow resizes it from the ends.
      </p>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-full text-xs text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        Delete pad
      </Button>
    </div>
  );
}

/**
 * The selected section's controls.
 *
 * These used to be drawn inside the page, floating over the artwork in theme colours on a white sheet —
 * which in a dark theme meant light grey text on white, and a row of chips fighting whatever image was
 * underneath. Arranging tools do not belong on the page anyway: the page is the print. They were then a
 * panel at the top of the workspace; they are now composed by the **left panel**, with every other
 * modifier, so there is one place to look.
 */
export function SectionInspector({
  block,
  page,
  pages,
  place,
  canMoveRowUp,
  canMoveRowDown,
  edits,
  onChoose,
  onSpan,
  onColumns,
  onSlots,
  onShape,
  onMoveBlock,
  onMoveAcross,
  onDelete,
  onClose,
  onPreviewPage,
}: {
  block: PortfolioBlock;
  page: PlannedPage;
  /** Every page, so the section can be sent to any of them. */
  pages: PlannedPage[];
  place: string;
  canMoveRowUp: boolean;
  canMoveRowDown: boolean;
  edits: WorkspaceEdits;
  /** Which way the section is presented: full bleed, framed, cards, a flip, a filmstrip. */
  onChoose: (blockId: string, presentation: PresentationId) => void;
  /** Moves a block one place, or past a whole row. Both are the same gesture at different scales. */
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onMoveAcross: (blockId: string, direction: -1 | 1) => void;
  /** How much room a block's frames take. */
  onShape: (blockId: string, shape: FrameShape) => void;
  /** How much of the page's width a section takes, in twelfths. */
  onSpan: (blockId: string, span: number) => void;
  /** How many frames sit side by side inside a section. */
  onColumns: (blockId: string, columns: 1 | 2 | 3 | 4) => void;
  /** How many frames a section holds, so the space can be reserved before the pictures arrive. */
  onSlots: (blockId: string, slots: number) => void;
  onDelete: (blockId: string) => void;
  onClose: () => void;
  onPreviewPage: (pageNumber: number) => void;
}) {
  const frames = frameSlots(block);
  const filled = block.images.length;
  const index = page.blocks.findIndex((entry) => entry.id === block.id);
  return (
    <div className="sticky top-2 z-30 rounded-lg border border-border bg-card p-3 text-card-foreground shadow-lg">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
          editing
        </span>
        <span className="text-sm font-semibold">
          {block.title ?? block.kind} · {place} · page {page.pageNumber}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {blockSpan(block)}/{GRID_SPAN} wide
          {frames ? ` · ${filled} of ${frames} frame${frames === 1 ? "" : "s"} filled` : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            title="Show this page as it will print"
            onClick={() => onPreviewPage(page.pageNumber)}
          >
            <Eye className="mr-1 h-3.5 w-3.5" />
            See it printed
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      {/* The variations, each saying how much room it wants, so choosing one is informed. */}
      <div className="flex flex-wrap gap-1">
        {PRESENTATION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            title={`${option.summary} ${option.caveat} Space: ${spaceHint(option)}.`}
            onClick={() => onChoose(block.id, option.id)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px]",
              (block.presentation ?? inferPresentation(block)) === option.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
            )}
          >
            {option.label}
            <span className="ml-1 opacity-60">{spaceHint(option)}</span>
          </button>
        ))}
      </div>
      {/*
        One group per row, full width of the panel.
        These were in a four-column grid whose breakpoints were the *window's*, not the panel's: at 19rem, on
        any normal screen, every group was about 65px wide and its chips wrapped to one word per line. Same
        reasoning as the pad's controls above — the panel is a narrow fixed column, so a group gets the width
        it has and the two-column shape is only for short, equal choices.
      */}
      <div className="mt-2 grid gap-2">
        <ControlGroup label="width" hint="How much of the page this section takes, in twelfths.">
          {BLOCK_SPANS.map((entry) => (
            <Pill
              key={entry.span}
              title={`${entry.hint} — ${entry.span} of ${GRID_SPAN}`}
              active={blockSpan(block) === entry.span}
              onClick={() => onSpan(block.id, entry.span)}
            >
              {entry.label}
            </Pill>
          ))}
        </ControlGroup>
        <ControlGroup
          label="frames across"
          hint="How many frames sit side by side inside this section."
        >
          {([1, 2, 3, 4] as const).map((count) => (
            <Pill
              key={count}
              title={`${count} frame${count === 1 ? "" : "s"} side by side inside this section`}
              active={(block.columns ?? 1) === count}
              onClick={() => onColumns(block.id, count)}
            >
              {String(count)}
            </Pill>
          ))}
        </ControlGroup>
        <ControlGroup
          label="frames it holds"
          hint="The space this section reserves — add frames before the pictures arrive."
        >
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-6 p-0"
            // Never below what is actually placed: a count that dropped a picture would look like
            // data loss, which is a worse confusion than not being able to decrement.
            disabled={frames <= Math.max(1, filled)}
            title="One fewer frame in this section"
            onClick={() => onSlots(block.id, frames - 1)}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <span className="px-1 text-xs tabular-nums">{frames || "none"}</span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 w-6 p-0"
            title="One more frame — reserve the space now, drop the picture in later"
            onClick={() => onSlots(block.id, frames + 1)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </ControlGroup>
        <ControlGroup
          label="video link"
          hint="A PDF cannot play the film: the link a reader follows."
        >
          <input
            value={block.videoUrl ?? ""}
            placeholder="https://…"
            aria-label="Video link"
            className="h-6 w-full rounded border border-input bg-background px-1 text-[11px]"
            onChange={(event) => edits.blockText(block.id, { videoUrl: event.target.value })}
          />
        </ControlGroup>
        <ControlGroup label="height" hint="How much room the frames take up the page.">
          {(["wide", "standard", "tall"] as FrameShape[]).map((shape) => (
            <Pill
              key={shape}
              title={`${shape} frames`}
              active={(block.shape ?? "standard") === shape}
              onClick={() => onShape(block.id, shape)}
            >
              {shape}
            </Pill>
          ))}
        </ControlGroup>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">text sits</span>
        {(["below", "right", "left", "above", "none"] as const).map((placement) => (
          <Pill
            key={placement}
            title={
              placement === "none"
                ? "no text on this section"
                : `${placement} the frames`
            }
            active={(block.textPlacement ?? "below") === placement}
            onClick={() => edits.textPlacement(block.id, placement)}
          >
            {placement}
          </Pill>
        ))}
        <span className="text-[11px] font-medium text-muted-foreground">set as</span>
        {(["paragraph", "lead", "bullets"] as const).map((style) => (
          <Pill
            key={style}
            title={
              style === "bullets"
                ? "each line of the text becomes a bullet point"
                : style === "lead"
                  ? "a larger opening line"
                  : "ordinary body text"
            }
            active={(block.bodyStyle ?? "paragraph") === style}
            onClick={() => edits.bodyStyle(block.id, style)}
          >
            {style}
          </Pill>
        ))}
        <span className="ml-auto text-[11px] font-medium text-muted-foreground">move to page</span>
        <select
          value=""
          title="Move this whole section onto another page, in this project or another"
          className="h-7 rounded border border-input bg-background px-1 text-[11px]"
          onChange={(event) => {
            if (event.target.value) edits.moveToPage(block.id, event.target.value);
          }}
        >
          <option value="">another page…</option>
          {pages
            .filter((entry) => entry.id !== page.id && entry.id !== "cover")
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                p{entry.pageNumber} · {entry.title || entry.kind}
              </option>
            ))}
        </select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">move</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={index === 0}
          title="One place earlier — left, or onto the previous row"
          onClick={() => onMoveBlock(block.id, -1)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={index === page.blocks.length - 1}
          title="One place later — right, or onto the next row"
          onClick={() => onMoveBlock(block.id, 1)}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[11px] text-muted-foreground">one place</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={!canMoveRowUp}
          title="Up past the whole row above"
          onClick={() => onMoveAcross(block.id, -1)}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={!canMoveRowDown}
          title="Down past the whole row below"
          onClick={() => onMoveAcross(block.id, 1)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[11px] text-muted-foreground">a row</span>
        {block.body ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            title="Save these words to the clipboard as a text module, to drop anywhere"
            onClick={() => edits.saveText(block.id)}
          >
            <ClipboardIcon className="mr-1 h-3.5 w-3.5" />
            Save as text module
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-xs text-muted-foreground hover:text-destructive"
          title="Delete this section"
          onClick={() => onDelete(block.id)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Delete section
        </Button>
      </div>
    </div>
  );
}

/**
 * Where a text selection sits, so the style dropdown can act on exactly what was highlighted.
 *
 * The three owners are the three things whose words a style can be set on, and the same shape travels to
 * the document: a section's slot, a page's own slot, or the document's. `text` carries the string the
 * range refers to when it is not simply the slot's own field — a caption lives per photograph, and the
 * range has to be measured against the caption that was highlighted.
 */
export type TextStyleTarget =
  | { kind: "document"; slot: TextStyleSlot }
  | { kind: "page"; pageId: string; slot: TextStyleSlot }
  | { kind: "block"; blockId: string; slot: TextStyleSlot; text?: string };

/** A slot's text as the runs the page draws — the same split the file is drawn from. */
function textRuns(
  text: string,
  base: TextStyle | undefined,
  marks: TextStyleRange[] | undefined,
): { text: string; className?: string }[] {
  return segmentsOf(text, base, marks).map((run) => ({
    text: run.text,
    className: run.style?.className,
  }));
}

/**
 * The six styles are chosen from the **style bar** above the pages, acting on whatever words are
 * highlighted — so a section's controls no longer carry style pickers of their own. What used to be here
 * was two of them ("heading style" and "text style") plus two more under every page and two on the cover:
 * six controls doing one job, and no way to style three words rather than a whole field.
 */

/** A labelled group of small choices. */

/**
 * A labelled group of controls.
 *
 * `columns` exists because the panel is a fixed, narrow column: with every group in a single row, the chips
 * get the panel's whole width and stop wrapping into what looks like debris. Two columns are for a short list
 * of equal choices — six pad tones, filled or outline — where one column would be three screens of scrolling.
 *
 * `hint` moves the explanation off the label and onto the hover text, because at this width a label like
 * "tone — one palette, so pages stay consistent" wraps to two lines before you have read a single choice.
 */
export function ControlGroup({
  label,
  hint,
  columns,
  children,
}: {
  label: string;
  /** What the group does, on hover: a label here can only be a couple of words. */
  hint?: string;
  /** How many equal columns the children share. Omitted, they sit in one wrapping row. */
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-background/60 p-1.5" title={hint}>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className={cn(
          columns ? "grid gap-1" : "flex flex-wrap items-center gap-1",
          columns === 2 && "grid-cols-2",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One small choice on the panel. */
export function Pill({
  active = false,
  title,
  onClick,
  className,
  children,
}: {
  /** Omitted for a button that does something rather than choosing between states. */
  active?: boolean;
  title: string;
  onClick: () => void;
  /** For the width a chip needs in a grid — a full-width row, or a cell that spans two. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "rounded border px-2 py-1 text-[11px]",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** One page of the export, drawn to scale with its blocks editable in place. */
function PageCanvas({
  page,
  library,
  data,
  selectedBlockId,
  draggingAssetId,
  overIndex,
  onSelectBlock,
  onPreviewPage,
  onActivatePage,
  editable,
  edits,
  footer,
  selectedPadId,
  onSelectPad,
  handle,
  onDragStartBlock,
  onDragOverBlock,
  onDropOn,
}: {
  page: PlannedPage;
  library: MediaLibrary;
  data: Record<string, string>;
  selectedBlockId: string | null;
  draggingAssetId: string | null;
  overIndex: number | null;
  onSelectBlock: (blockId: string | null) => void;
  /** Opens the live PDF at this page. */
  onPreviewPage: (pageNumber: number) => void;
  /** Told when this page is the one being worked on, so the left panel follows the reader. */
  onActivatePage: (pageId: string) => void;
  /** Which pad is being worked on, if any. */
  selectedPadId: string | null;
  onSelectPad: (padId: string | null) => void;
  editable: boolean;
  edits: WorkspaceEdits;
  /** The footer the file prints on this page, drawn so the card cannot hide it. */
  footer: { title: string; projects: string[]; pageCount: number; navigable: boolean };
  /** The corner grip that drags this page to another position, when there is one. */
  handle?: React.ReactNode;
  onDragStartBlock: (blockId: string) => void;
  onDragOverBlock: (index: number) => void;
  onDropOn: (blockId: string | null) => void;
}) {
  /**
   * What this page's own words are set in.
   *
   * The fallbacks come from the one table that names them, and they differ by surface: the cover's title
   * is drawn as a headline and its tag as the label, while a page's heading is a header and its line is
   * the drawn soft note. That is why `page.textStyles` is carried on the plan — the slot names mean
   * different things on a cover and a page, and the plan is the thing that knows which it is.
   */
  const surface = page.kind === "cover" ? SLOT_DRAWN_AS.document : SLOT_DRAWN_AS.page;
  const headingStyle = resolveTextStyle(page.textStyles, "title", surface.title);
  const tag = resolveTextStyle(page.textStyles, "subtitle", surface.subtitle);
  const lineStyle = resolveTextStyle(page.textStyles, "body");
  /** On a flip half, the plan's `subtitle` is the section's heading, so it takes the title style. */
  const flipHeading = resolveTextStyle(page.textStyles, "subtitle");
  const flipCaption = resolveTextStyle(page.textStyles, "caption");
  /** On a filmstrip row, the plan's `title` is the section's heading and `body` its line. */
  const filmstripHeading = resolveTextStyle(page.textStyles, "title");
  const filmstripWords = resolveTextStyle(page.textStyles, "body");
  const rows = rowsOf(page.blocks);
  /**
   * The footer the file prints, drawn where the file prints it.
   *
   * Twice wrong before this: it was drawn *inside* the printable box, so it sat in the text area among the
   * sections instead of in the bottom margin; and its project names were dressed up as links, which on a
   * card can only ever look like a link that does not work. So it is drawn against the *page*, at the same
   * bottom margin the PDF uses (`bottom: 24pt`, `left/right: 54pt`), and it carries what the file's footer
   * now carries: the document's title and the page number, plain text.
   */
  const printedFooter =
    footer.navigable && page.kind !== "cover" ? (
      <div
        className="pointer-events-none absolute flex items-baseline justify-between text-[9px] text-slate-500"
        style={{ left: PAGE_MARGIN_X, right: PAGE_MARGIN_X, bottom: FOOTER_MARGIN_Y }}
        title={
          hyperlinksNote
        }
      >
        <span className="min-w-0 truncate">{footer.title}</span>
        <span className="whitespace-nowrap">
          Page {page.pageNumber} of {footer.pageCount}
        </span>
      </div>
    ) : null;

  /** The pad as it looks mid-drag. Local, so one gesture is one undo step rather than a hundred. */
  const [previewPad, setPreviewPad] = React.useState<PagePad | null>(null);
  const padDrag = React.useRef<{
    mode: PadDragMode;
    start: PagePad;
    rect: DOMRect;
    x: number;
    y: number;
    box: HTMLElement;
    pointerId: number;
    captured: boolean;
  } | null>(null);
  const previewRef = React.useRef<PagePad | null>(null);
  /**
   * True while a press that began on a pad is still in flight.
   *
   * The page box's click needs to know, because with pointer capture the browser delivers that click to
   * the *box* rather than to the pad — so "is the target a pad?" is not a question that can be answered
   * from the event alone.
   */
  const padPressRef = React.useRef(false);

  const beginPadDrag = (event: React.PointerEvent, pad: PagePad, mode: PadDragMode) => {
    // Typing into the pad's own label must not drag the pad out from under the caret: the label sits
    // inside the pad, so a press on it would otherwise start a move.
    if ((event.target as HTMLElement).isContentEditable) return;
    const box = (event.currentTarget as HTMLElement).closest("[data-page-box]") as HTMLElement | null;
    if (!box) return;
    event.preventDefault();
    event.stopPropagation();
    /**
     * Capture is taken on the *first move*, not here.
     *
     * Capturing on pointer-down makes the browser deliver the release's `click` to the capturing element
     * — the page box — so the pad's own click never fires. Two guards make selection survive that, and
     * both live in `clickClearsTools`: the capture is not taken until the pointer has really travelled,
     * and the box's click asks where the press *began* (recorded in the capture phase) instead of trusting
     * where the click landed, because with capture the two differ.
     */
    padDrag.current = {
      mode,
      start: pad,
      rect: box.getBoundingClientRect(),
      x: event.clientX,
      y: event.clientY,
      box,
      pointerId: event.pointerId,
      captured: false,
    };
    onSelectPad(pad.id);
  };

  const movePadDrag = (event: React.PointerEvent) => {
    const drag = padDrag.current;
    if (!drag) return;
    const travelled = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
    // Capture only once the pointer has really moved: capturing on a click that never went anywhere is
    // what retargets the click and breaks selecting a pad.
    if (!drag.captured && travelled > 3) {
      drag.box.setPointerCapture?.(drag.pointerId);
      drag.captured = true;
    }
    if (!drag.captured) return;
    const dx = (event.clientX - drag.x) / drag.rect.width;
    const dy = (event.clientY - drag.y) / drag.rect.height;
    // Snapped while dragging, so the pad lands on a twelfth when you mean it to and stays free when
    // you aim between the marks.
    const next = snapPad(dragPad(drag.start, drag.mode, dx, dy));
    previewRef.current = next;
    setPreviewPad(next);
  };

  const endPadDrag = () => {
    const drag = padDrag.current;
    const next = previewRef.current;
    padDrag.current = null;
    previewRef.current = null;
    setPreviewPad(null);
    if (drag && next) edits.pad(drag.start.id, next);
  };

  const pads = (page.pads ?? []).map((pad) =>
    previewPad && previewPad.id === pad.id ? previewPad : pad,
  );

  return (
    <figure className="w-full">
      <div
        className={cn(
          "proj-page relative rounded-sm border shadow-sm",
          page.kind === "filmstrip" && "bg-slate-50",
        )}
        style={{ aspectRatio: `${page.width} / ${page.height}` }}
      >
        {handle}
        {/* The footer is drawn against the *page*, in its bottom margin — see `printedFooter`. */}
        {printedFooter}
        {/*
          One printable box for every kind of page: the same 54pt margins the PDF lays its content out
          in, expressed as percentages so the drawing is proportional. The pads are positioned against
          this box, and the content sits above them — the three layers, in both surfaces.
        */}
        <div
          data-page-box
          className="absolute"
          style={{
            top: PAGE_MARGIN_Y,
            bottom: PAGE_MARGIN_Y,
            left: PAGE_MARGIN_X,
            right: PAGE_MARGIN_X,
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onDropOn(null);
          }}
          onPointerMove={movePadDrag}
          onPointerUp={endPadDrag}
          /**
           * Record where *this* press began, in the capture phase so it is set before anything inside can
           * react. Doing it here rather than on the pad itself means the answer is always fresh: a press
           * that begins on the page clears it, so a click that was swallowed after a drag cannot leave a
           * stale flag behind to swallow the next one.
           */
          onPointerDownCapture={(event) => {
            padPressRef.current = Boolean((event.target as HTMLElement).closest("[data-pad]"));
          }}
          onPointerCancel={endPadDrag}
          onClick={(event) => {
            // Clicking the sheet itself puts the tools away — unless the press began on a pad. With
            // pointer capture the click arrives here even when it was aimed at a pad, so the event
            // alone cannot say; the ref can. See `clickClearsTools`.
            const clears = clickClearsTools({
              startedOnPad: padPressRef.current,
              targetIsPad: Boolean((event.target as HTMLElement).closest("[data-pad]")),
            });
            padPressRef.current = false;
            // Whichever way that goes, this is the page the reader is working on: the left panel acts on
            // *this* page, so the panel follows the click even when the click also cleared the selection.
            onActivatePage(page.id);
            if (!clears) return;
            onSelectBlock(null);
            onSelectPad(null);
          }}
        >
          <PagePads
            pads={pads}
            selectedId={selectedPadId}
            editable={editable}
            onSelect={onSelectPad}
            onBeginDrag={beginPadDrag}
            onLabel={(padId, label) => edits.pad(padId, { label })}
          />
          <div
            className={cn(
              // Inert so the pads underneath stay clickable in the gaps between sections; the
              // sections and the page's own controls take events back where they are drawn.
              "pointer-events-none relative z-[1] flex h-full flex-col gap-[3%]",
              page.fillPage && "justify-between",
            )}
          >
            {page.kind === "cover" ? (
              /*
                The cover is centred, because that is how the file draws it: the PDF puts the tag, the
                title, the name, an accent rule, the meta line and the frames in one column centred in the
                printable area. Drawing it at the top of the card instead was the difference the reader
                noticed — and the *rule* below the name was drawn in the file and in nothing else.
              */
              <div className="pointer-events-none flex h-full flex-col justify-center gap-[3%] px-[3.6%]">
                {/* The cover's words are the document's own: editing them here edits the portfolio,
                    which is why the header's title changes as you type. */}
                <EditableText
                  as="p"
                  editable={editable}
                  value={styleWords(tag, page.subtitle ?? "Portfolio")}
                  segments={textRuns(page.subtitle ?? "Portfolio", tag, page.textMarks?.subtitle)}
                  onSelectRange={(range, words) =>
                    edits.selectText({ kind: "document", slot: "subtitle" }, range, words)
                  }
                  className={cn(
                    "pointer-events-auto",
                    tag?.className ?? "proj-accent text-[9px] uppercase tracking-[0.2em]",
                  )}
                  placeholder="portfolio"
                  onCommit={(next) => edits.portfolioText({ subtitle: next })}
                />
                <EditableText
                  as="p"
                  editable={editable}
                  value={styleWords(headingStyle, page.title)}
                  segments={textRuns(page.title, headingStyle, page.textMarks?.title)}
                  onSelectRange={(range, words) =>
                    edits.selectText({ kind: "document", slot: "title" }, range, words)
                  }
                  className={cn(
                    "pointer-events-auto",
                    headingStyle?.className ?? "proj-navy text-[19px] font-semibold leading-tight",
                  )}
                  placeholder="the title"
                  onCommit={(next) => edits.portfolioText({ title: next })}
                />
                <EditableText
                  as="p"
                  editable={editable}
                  value={page.author ?? ""}
                  className="proj-soft pointer-events-auto text-[10px]"
                  placeholder="your name"
                  onCommit={(next) => edits.portfolioText({ author: next })}
                />
                {/*
                  The contact block, from the plan — so this and the file draw the same words in the same order.
                  None of it is editable here: the tagline, the ways to reply and the links are structure, and
                  structure lives in the panel rather than in a text field on a page.
                */}
                {page.tagline ? <p className="proj-navy text-[10px]">{page.tagline}</p> : null}
                {page.contactLine ? <p className="proj-soft text-[9px]">{page.contactLine}</p> : null}
                {page.links?.length ? (
                  <p className="flex flex-wrap gap-[3%] text-[9px]">
                    {page.links.map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="proj-accent pointer-events-auto font-semibold underline"
                      >
                        {link.label}
                      </a>
                    ))}
                  </p>
                ) : null}
                {page.body ? <p className="proj-soft text-[9px]">{page.body}</p> : null}
                <div className="pointer-events-auto space-y-[2%]">
                  <div className="flex gap-[2%]">
                    {(page.frames ?? []).map((frame, index) => (
                      <div key={frame.id || `slot-${index}`} className="relative min-w-0 flex-1">
                        <Frame id={frame.id} data={data} ratio={1.4} label="cover frame" />
                        {frame.id && data[frame.id] ? (
                          <button
                            type="button"
                            title="Take this picture off the cover"
                            className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border border-slate-300 bg-white text-[9px] leading-none text-slate-500 hover:text-red-600"
                            onClick={() => edits.clearCoverImage(index)}
                          >
                            ×
                          </button>
                        ) : null}
                        {!frame.id || !data[frame.id] ? (
                          // An empty slot offers to be filled: that is the slot you just cleared, and a panel
                          // with no way to put a picture back in it is a dead end you made yourself.
                          <ImportButton
                            label="add a picture"
                            onPick={(file) => edits.coverImage(index, file)}
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {(page.frames ?? []).length < 3 ? (
                    <ImportButton
                      label="add a cover picture"
                      onPick={(file) => edits.coverImage(-1, file)}
                    />
                  ) : null}
                </div>
                {/* The accent rule under the name, which the file has always drawn. */}
                <div
                  className="h-[2px] w-[32px] shrink-0"
                  style={{ backgroundColor: PORTFOLIO_INK.accent }}
                />
              </div>
            ) : page.kind === "flip" && page.flip ? (
          <>
            {/* The words on a flip half are the *section's* words, which is why typing here edits the
                section: the label names the comparison, the heading is the section's title and the
                caption is what this section says about this photograph. */}
            <EditableText
              as="p"
              editable={editable}
              value={styleWords(flipHeading ?? TEXT_STYLES.label, page.flip.label)}
              className={cn(
                "pointer-events-auto",
                flipHeading
                  ? flipHeading.className
                  : "proj-accent text-[9px] font-semibold uppercase tracking-[0.2em]",
              )}
              placeholder="before"
              onCommit={(next) => {
                const blockId = pageBlockId(page.id);
                if (blockId) edits.blockLabel(blockId, page.flip!.side, next);
              }}
            />
            <Frame id={page.flip.image.id} data={data} ratio={2.4} />
            <EditableText
              as="p"
              multiline
              editable={editable}
              value={styleWords(flipCaption, page.flip.caption ?? page.subtitle ?? "")}
              className={cn(
                "pointer-events-auto",
                flipCaption ? flipCaption.className : "proj-soft text-[9px]",
              )}
              placeholder="describe this view"
              onCommit={(next) => {
                const blockId = pageBlockId(page.id);
                if (blockId) edits.caption(blockId, page.flip!.image.id, next);
              }}
            />
            {/* The file appends this line to the caption of every flip half. It was invisible here, which
                is exactly the sort of hidden text that must not be — see the note about the footer. */}
            <p className="proj-soft text-[9px] italic">
              {page.flip.side === "before"
                ? "· turn the page for the same view after"
                : "· the same view before this work"}
            </p>
          </>
        ) : page.kind === "filmstrip" ? (
          <>
            {/* A filmstrip's heading and line are the section's too — the section owns this page. */}
            <EditableText
              as="p"
              editable={editable}
              value={styleWords(filmstripHeading, page.title)}
              className={cn(
                "pointer-events-auto",
                filmstripHeading?.className ?? "text-[10px] font-medium",
              )}
              placeholder="section heading"
              onCommit={(next) => {
                const blockId = pageBlockId(page.id);
                if (blockId) edits.blockText(blockId, { title: next });
              }}
            />
            <div className="flex flex-1 gap-[1.5%]">
              {(page.frames ?? []).map((frame) => (
                <Frame key={frame.id} id={frame.id} data={data} className="min-w-0 flex-1" />
              ))}
            </div>
            {page.subtitle || editable ? (
              <EditableText
                as="p"
                multiline
                editable={editable}
                value={styleWords(filmstripWords, page.subtitle ?? "")}
                className={cn(
                  "pointer-events-auto",
                  filmstripWords ? filmstripWords.className : "proj-soft text-[9px]",
                )}
                placeholder="a line about this row"
                onCommit={(next) => {
                  const blockId = pageBlockId(page.id);
                  if (blockId) edits.blockText(blockId, { body: next });
                }}
              />
            ) : null}
            {/* The note the file prints under every filmstrip row. */}
            <p className="proj-soft text-[9px] italic">
              frames read left to right; every viewer shows this row, and none scrolls it
            </p>
          </>
        ) : (
          <>
            {/* The page box above handles the drops and the pad selection; this branch is just the
                page's own content: its heading, its sections, and its controls. */}
            <EditableText
              as="p"
              editable={editable}
              value={styleWords(headingStyle, page.title)}
              segments={textRuns(page.title, headingStyle, page.textMarks?.title)}
              onSelectRange={(range, words) =>
                edits.selectText({ kind: "page", pageId: page.id, slot: "title" }, range, words)
              }
              className={cn(
                "pointer-events-auto",
                headingStyle?.className ?? "proj-ink text-[12px] font-semibold",
              )}
              placeholder="page heading"
              onCommit={(next) => edits.slideText(page.id, { title: next })}
            />
            {page.body || editable ? (
              <EditableText
                as="p"
                multiline
                editable={editable}
                value={styleWords(lineStyle, page.body ?? "")}
                segments={textRuns(page.body ?? "", lineStyle, page.textMarks?.body)}
                onSelectRange={(range, words) =>
                  edits.selectText({ kind: "page", pageId: page.id, slot: "body" }, range, words)
                }
                className={cn(
                  "pointer-events-auto text-[9px] leading-snug",
                  lineStyle ? lineStyle.className : "proj-soft",
                )}
                placeholder="a line about this page"
                onCommit={(next) => edits.slideText(page.id, { body: next })}
              />
            ) : null}
            {/*
              The page as a twelve-column grid, which is the same rule `rowsOf` applies: a section
              claims its twelfths and the next one either fits beside it or starts a new row. The
              renderer walks the same rows, so what is beside what here is what is beside what there.
            */}
            <div
              className="grid gap-[2%]"
              style={{ gridTemplateColumns: `repeat(${GRID_SPAN}, minmax(0, 1fr))` }}
            >
              {rows.flatMap((row, rowIndex) =>
                row.map((block, columnIndex) => (
                  <div
                    key={block.id}
                    className="min-w-0"
                    style={{ gridColumn: `span ${blockSpan(block)}` }}
                  >
                    <BlockOnPage
                      block={block}
                      index={page.blocks.findIndex((entry) => entry.id === block.id)}
                      data={data}
                      editable={editable && block.id === selectedBlockId}
                      edits={edits}
                      selected={block.id === selectedBlockId}
                      draggingAssetId={draggingAssetId}
                      overTarget={overIndex === page.blocks.findIndex((entry) => entry.id === block.id)}
                      onSelect={onSelectBlock}
                      onDragStartBlock={onDragStartBlock}
                      onDragOverBlock={onDragOverBlock}
                      onDropOn={onDropOn}
                    />
                  </div>
                )),
              )}
            </div>
          </>
        )}
          </div>
        </div>
      </div>
      {/* The panel is that way. */}
      <div className="mt-1.5 space-y-1">
        {/*
          A page a section owns cannot be clicked into — there is no section drawn on it — so this is the
          way to reach the words on it. Everything that *modifies* a page lives in the left panel now,
          which is why there is no toolbar under the page any more: one panel, one target, one place to
          look.
        */}
        {page.kind === "flip" || page.kind === "filmstrip" ? (
          <button
            type="button"
            className="rounded border border-dashed px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary"
            title="Select the section this page belongs to, so the panel shows its controls"
            onClick={() => onSelectBlock(pageBlockId(page.id) ?? null)}
          >
            select the section this page belongs to
          </button>
        ) : null}
      </div>
      <figcaption className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">p{page.pageNumber}</span>
        <span>
          {page.kind === "filmstrip" ? "wide row" : page.kind} · {page.width / 72}×{page.height / 72}
          in
        </span>
        {page.title ? <span className="min-w-0 flex-1 truncate">{page.title}</span> : null}
        <button
          type="button"
          className="ml-auto flex items-center gap-1 rounded border px-1.5 py-0.5 hover:border-primary hover:text-primary"
          title="Open the live PDF at this page — the real file, not this drawing of it"
          onClick={() => onPreviewPage(page.pageNumber)}
        >
          <Eye className="h-3 w-3" />
          read this page
        </button>
      </figcaption>
    </figure>
  );
}

/** A block on a page. Its controls are on the panel above, not floating over the artwork. */
function BlockOnPage({
  block,
  index,
  selected,
  data,
  editable,
  edits,
  draggingAssetId,
  overTarget,
  onSelect,
  onDragStartBlock,
  onDragOverBlock,
  onDropOn,
}: {
  block: PortfolioBlock;
  index: number;
  selected: boolean;
  data: Record<string, string>;
  /**
   * True when this page's text is typeable — which is now every page, always.
   *
   * Kept as a prop rather than deleted because the *pads* still read it together with their own selection,
   * and because the day a page needs to be read-only (a preview, a shared link) this is the single switch.
   */
  editable: boolean;
  edits: WorkspaceEdits;
  /** Set while an asset is being dragged out of the store. */
  draggingAssetId: string | null;
  /** True when a dragged block or asset is hovering this block. */
  overTarget: boolean;
  onSelect: (blockId: string | null) => void;
  onDragStartBlock: (blockId: string) => void;
  onDragOverBlock: (index: number) => void;
  onDropOn: (blockId: string | null) => void;
}) {
  /**
   * The words and the frames, arranged the way the section asks for.
   *
   * This mirrors `Block` in the PDF document — including the three-fifths split when the text sits
   * beside the frames — so choosing a placement on the panel moves the text on screen the same way it
   * will move it on paper.
   */
  const placement = block.textPlacement ?? "below";
  const beside = placement === "left" || placement === "right";
  /** The heading's style: chosen, or the one a section title is drawn in. */
  const heading = resolveTextStyle(block.textStyles, "title", "title");
  const title = (
    <EditableText
      as="p"
      editable={editable}
      value={styleWords(heading, block.title ?? "")}
      segments={textRuns(block.title ?? "", heading, block.textMarks?.title)}
      onSelectRange={(range, words) =>
        edits.selectText(
          { kind: "block", blockId: block.id, slot: "title", text: block.title ?? "" },
          range,
          words,
        )
      }
      className={cn(heading?.className ?? "proj-ink text-[10px] font-medium")}
      placeholder="section heading"
      onCommit={(next) => edits.blockText(block.id, { title: next })}
    />
  );
  const words = <SectionBody block={block} editable={editable} edits={edits} />;
  const frames = <BlockFrames block={block} data={data} editable={editable} edits={edits} />;

  return (
    <div
      // Draggable only when it is *not* the selected section: while its words are editable a drag
      // inside the text has to select text, not start moving the section. While selected, the arrows
      // on the panel move it — which is also the more precise way to place it.
      draggable={!selected}
      onDragStart={(event) => {
        // A press that starts in text is a caret, not a drag — the same rule the pads follow. Every page's
        // text is editable now, so without this a press into the words would start moving the section
        // instead of typing into it.
        if ((event.target as HTMLElement).isContentEditable) {
          event.preventDefault();
          return;
        }
        // The id travels in React state as well as the drag payload: dataTransfer types are
        // restricted differently in each browser, and a drop that silently does nothing is worse
        // than no drag at all.
        event.dataTransfer?.setData("text/plain", block.id);
        onDragStartBlock(block.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverBlock(index);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDropOn(block.id);
      }}
      onClick={(event) => {
        // Clicking *into* text should put a caret there, not re-select the section.
        const target = event.target as HTMLElement;
        if (target.isContentEditable) return;
        event.stopPropagation();
        onSelect(selected ? null : block.id);
      }}
      className={cn(
        // Takes pointer events back from the inert content box, so a section is clickable and
        // draggable while the gaps around it still belong to the pads underneath.
        "pointer-events-auto cursor-grab space-y-[2%] rounded-sm p-[2%] active:cursor-grabbing",
        selected ? "ring-2 ring-primary" : "hover:bg-slate-50",
        // A dashed outline rather than a ring: rings cannot be dashed, and the drop target has to
        // look different from the selected block at a glance.
        overTarget && "outline outline-2 outline-dashed outline-primary",
      )}
    >
      {title}
      {beside ? (
        <div className="flex items-start gap-[2%]">
          {placement === "left" ? (
            <>
              <div className="w-[35%]">{words}</div>
              <div className="min-w-0 flex-[1.6]">{frames}</div>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-[1.6]">{frames}</div>
              <div className="w-[35%]">{words}</div>
            </>
          )}
        </div>
      ) : (
        <>
          {placement === "above" ? words : null}
          {frames}
          {placement === "none" ? null : placement === "below" ? words : null}
        </>
      )}
      {/* What the file prints under a mark-up section or a video: the note and, for a video, the link a
          reader can actually follow. Both used to exist only in the PDF. */}
      {block.kind === "markup" && block.annotations.length ? (
        <p className="proj-soft text-[9px] italic">
          {block.annotations.length} mark-up{block.annotations.length === 1 ? "" : "s"} drawn into the
          page — visible in every viewer, not an editable annotation
        </p>
      ) : null}
      {block.kind === "video" ? (
        <p className="flex flex-wrap items-baseline gap-1 text-[9px]">
          {/* Drawn as the file draws it: the address in the accent, as text. No underline, because on a card
              an underline is a promise that clicking works — and hyperlinks are out of scope for now. */}
          {block.videoUrl ? (
            <span className="proj-accent break-all" title={hyperlinksNote}>
              {block.videoUrl}
            </span>
          ) : null}
          <span className="proj-soft italic">
            video does not play in most viewers; the frame above is the poster
          </span>
        </p>
      ) : null}
      {draggingAssetId ? (
        <p className="rounded border border-dashed border-blue-400 bg-blue-50 py-1 text-center text-[9px] text-blue-700">
          drop to place here
        </p>
      ) : null}

      {selected ? (
        <p className="rounded border border-dashed border-slate-400 bg-slate-50 py-0.5 text-center text-[9px] text-slate-500">
          editing above ↑
        </p>
      ) : null}
    </div>
  );
}

export function PortfolioWorkspace({
  pages,
  library,
  selectedBlockId,
  draggingAssetId,
  onSelectBlock,
  onReorder,
  onDropAsset,
  onMovePage,
  onPreviewPage,
  onActivatePage,
  edits,
  selectedPadId,
  onSelectPad,
  footer,
}: {
  pages: PlannedPage[];
  library: MediaLibrary;
  selectedBlockId: string | null;
  /** An asset id while it is being dragged out of the store, otherwise null. */
  draggingAssetId: string | null;
  onSelectBlock: (blockId: string | null) => void;
  /** A drop that reorders the sections on a page. */
  onReorder: (blockId: string, index: number) => void;
  onDropAsset: (blockId: string | null, pageId: string) => void;
  onMovePage: (pageId: string, targetPageId: string, position: "before" | "after") => void;
  onPreviewPage: (pageNumber: number) => void;
  /**
   * The page the reader is on, so the left panel knows what to act on — clicked, or holding the selection.
   */
  onActivatePage: (pageId: string) => void;
  edits: WorkspaceEdits;
  selectedPadId: string | null;
  onSelectPad: (padId: string | null) => void;
  /** What the file prints as a footer: title, project links, page number. See `PageCanvas`. */
  footer: { title: string; projects: string[]; pageCount: number; navigable: boolean };
}) {
  // What the pages will draw, from the plan — the same call the PDF preview makes, so the two surfaces cannot
  // come to different conclusions about which pictures exist. (They did: this read the plan and the preview
  // read the raw document, so a picture placed from the clipboard was fetched here and not there, and the card
  // showed a photograph the file drew as an empty frame.)
  const needed = React.useMemo(() => planImageIds(pages), [pages]);
  const data = useImageData(needed);

  /** The block being dragged, and which block on which page it is currently over. */
  const [dragBlockId, setDragBlockId] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<{ pageId: string; index: number } | null>(null);
  /** The page being dragged, and which page it is currently hovering, on which side. */
  const [dragPageId, setDragPageId] = React.useState<string | null>(null);
  const [pageOver, setPageOver] = React.useState<{ pageId: string; side: "before" | "after" } | null>(
    null,
  );

  /**
   * A drop from the store, or a section dragged in from another page.
   *
   * The same handler serves both kinds of drag, because from the reader's point of view they are the same
   * gesture: "put this here". Whether "this" came from the store or from another page decides what happens
   * next.
   */
  const dropOn = (pageId: string) => (blockId: string | null) => {
    const target = pages.find((page) => page.id === pageId);
    if (draggingAssetId) {
      onDropAsset(blockId, pageId);
    } else if (dragBlockId && target) {
      const index = blockId
        ? target.blocks.findIndex((block) => block.id === blockId)
        : target.blocks.length;
      const at = index < 0 ? target.blocks.length : index;
      // A section dragged onto a *different* page is a move, not a reorder: it can go to any page in any
      // project, which is what makes the layout rearrangeable rather than merely sortable.
      const home = pages.find((page) => page.blocks.some((block) => block.id === dragBlockId));
      if (home && home.id !== pageId) edits.moveToPage(dragBlockId, pageId, at);
      else onReorder(dragBlockId, at);
    }
    setDragBlockId(null);
    setOver(null);
  };

  if (!pages.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Pick a template or add a page and the pages appear here, at their real proportions.
      </div>
    );
  }

  return (
    <div className="print-hide space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold">The pages</h2>
        <span className="text-xs text-muted-foreground">
          {pages.length} page{pages.length === 1 ? "" : "s"} · click a section to work on it, drag the
          corner grip to move a page, and use <b>read this page</b> to see it printed
        </span>
      </div>
      {/*
        Two pages across, not three — and each one stops growing at the size it was.
        Fewer pages per row was meant to leave room for the panels beside the document, not to make the pages
        bigger: a grid column with no ceiling turns the extra room into a larger page, and the panels then eat
        it back, so the page ends up the same size as before and the panels have made it smaller for nothing.
        The cap is what a Letter page measured at three across, so the pages look as they did and the slack
        goes to the rails.
      */}
      <div className="grid gap-5 sm:grid-cols-2">
        {pages.map((page) => {
          // A cover is not a page of the document you can move; everything else belongs to a section.
          const movable = page.id !== "cover";
          const dragging = dragPageId === page.id;
          const side = pageOver?.pageId === page.id ? pageOver.side : null;
          /** Which half of the card the pointer is in decides whether it lands before or after. */
          const sideAt = (event: React.DragEvent<HTMLDivElement>): "before" | "after" => {
            const bounds = event.currentTarget.getBoundingClientRect();
            return event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
          };
          return (
            <div
              key={page.id}
              className={cn("relative mx-auto w-full min-w-0", dragging && "opacity-40")}
              style={{ maxWidth: PAGE_CARD_MAX_PX }}
              onDragOver={(event) => {
                if (!dragPageId || !movable || dragging) return;
                event.preventDefault();
                setPageOver({ pageId: page.id, side: sideAt(event) });
              }}
              onDragLeave={() => {
                if (pageOver?.pageId === page.id) setPageOver(null);
              }}
              onDrop={(event) => {
                if (!dragPageId || !movable || dragging) return;
                event.preventDefault();
                onMovePage(dragPageId, page.id, sideAt(event));
                setDragPageId(null);
                setPageOver(null);
              }}
            >
              {side ? (
                <span
                  className={cn(
                    "pointer-events-none absolute inset-y-3 z-20 w-1.5 rounded-full bg-primary shadow",
                    side === "before" ? "-left-3" : "-right-3",
                  )}
                />
              ) : null}
              <PageCanvas
                page={page}
                library={library}
                data={data}
                selectedBlockId={selectedBlockId}
                draggingAssetId={draggingAssetId}
                overIndex={over?.pageId === page.id ? over.index : null}
                onSelectBlock={onSelectBlock}
                onPreviewPage={onPreviewPage}
                onActivatePage={onActivatePage}
                // Every page's words are typeable, on the page they are on.
                //
                // This used to require selecting a *section* first, which meant the cover — a page with no
                // sections on it — could never be typed into at all, and a page you had not clicked into yet
                // looked like a picture of a document rather than a document. If it is on the page, it is
                // editable; the only thing selection still gates is typing into a *pad's* label, because a
                // pad is dragged by its body and a press has to mean one thing at a time.
                editable
                footer={footer}
                edits={edits}
                selectedPadId={selectedPadId}
                onSelectPad={onSelectPad}
                onDragStartBlock={setDragBlockId}
                onDragOverBlock={(index) => setOver({ pageId: page.id, index })}
                onDropOn={dropOn(page.id)}
                handle={
                  movable ? (
                    <span
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer?.setData("text/plain", page.id);
                        setDragPageId(page.id);
                      }}
                      onDragEnd={() => {
                        setDragPageId(null);
                        setPageOver(null);
                      }}
                      title="Drag this page by its corner to move it — it lands between any two pages, in this project or another"
                      className="absolute right-1 top-1 z-20 flex cursor-grab items-center gap-0.5 rounded border border-slate-300 bg-white/95 px-1 py-0.5 text-[8px] text-slate-500 hover:border-slate-500 hover:text-slate-900 active:cursor-grabbing"
                    >
                      <GripVertical className="h-3 w-3" />
                      page
                    </span>
                  ) : null
                }
              />
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Click a section to work on it: the panel above carries its variations, its <b>width</b>, how
        many <b>frames</b> it holds and the arrows — left and right for one place, up and down to jump
        a row. Widths add up to a row (two halves, three thirds, four quarters), so sections sit beside
        each other exactly as they print. An empty frame is space you have reserved: it is drawn in the
        panel colour the export paints, and it fills as the pictures arrive. Drag a section to reorder
        the page, drag a page by its corner, or drag an asset out of the store onto a section — or onto
        empty space on a page, which adds one for it.
      </p>
    </div>
  );
}
