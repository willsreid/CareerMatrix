"use client";

import * as React from "react";
import { LayoutTemplate, Minus, PanelLeftClose, PanelLeftOpen, Plus, Square, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ControlGroup,
  PadInspector,
  Pill,
  SectionInspector,
  type TextStyleTarget,
  type WorkspaceEdits,
} from "@/components/PortfolioWorkspace";
import {
  LINE_STYLES,
  LINE_STYLE_ORDER,
  PAD_STYLES,
  PAD_STYLE_ORDER,
  PAD_TONES,
  lineStyleFor,
  padStyleFor,
  rowsOf,
  type LineStyle,
  type PadStyle,
  type PlannedPage,
} from "@/lib/portfolio";
import type { FrameShape, PagePad } from "@/lib/portfolioTypes";
import { PRESENTATION_OPTIONS, type PresentationId } from "@/lib/presentationOptions";
import { TEXT_STYLES, TEXT_STYLE_ORDER, type TextStyleId } from "@/lib/textStyles";
import { spanFraction } from "@/lib/portfolio";
import { dpiVerdict, sourceRect } from "@/lib/images";
import { cn } from "@/lib/utils";
import {
  formatLinks,
  parseLinks,
  type PortfolioContact,
} from "@/lib/portfolioContact";
import {
  DEFAULT_THEME,
  INK_SCHEMES,
  INK_SCHEME_ORDER,
  TYPE_PAIRINGS,
  TYPE_PAIRING_ORDER,
  TYPE_SCALES,
  TYPE_SCALE_ORDER,
  isDefaultTheme,
  themeOf,
  type InkSchemeId,
  type PortfolioTheme,
  type TypePairingId,
  type TypeScaleId,
} from "@/lib/portfolioTheme";

/**
 * The left panel: everything that modifies a page, in one place.
 *
 * It used to be scattered — style dropdowns in a bar above the pages, a page's own controls in a strip under
 * the page they belonged to, a section's controls in a panel at the top of the workspace, a pad's in another.
 * The thing you wanted was never where you were looking, and "which page does this act on?" had a different
 * answer in each strip. Here there is one panel with one target: the page you are working on, and whatever
 * is selected on it.
 *
 * The style dropdowns stay at the top of it, because they are the ones reached for constantly and because
 * they act on a *highlight* rather than on a selection.
 */
export interface InspectorTarget {
  /** The page the panel acts on: the one holding the selection, or the last one touched. */
  page: PlannedPage | null;
  /** The section selected in it, if any. */
  blockId: string | null;
  /** The pad selected in it, if any. A pad and a section are never selected at once. */
  padId: string | null;
}

/**
 * The six styles, offered as three dropdowns — one per kind of thing on a page.
 *
 * **text style** acts on the highlighted words (or, with the caret merely in a field, on that whole field);
 * **line style** on how thick a line is; **pad style** on how round a panel's corners are. Naming them this
 * way is what let six pickers and two pill rows of numbers go away: a style is a *format*, so the control is
 * the name of a format rather than a size you have to know.
 */
function StyleBar({
  selection,
  currentStyle,
  drawnAs,
  pad,
  onTextStyle,
  onLineStyle,
  onPadStyle,
}: {
  selection: TextStyleTarget | null;
  /** The style under the selection, or "mixed" when the highlighted words disagree. */
  currentStyle: TextStyleId | "mixed" | undefined;
  /** What this slot is drawn as when nobody has chosen, so "as designed" can say what it means. */
  drawnAs?: TextStyleId;
  pad: PagePad | null;
  onTextStyle: (style: TextStyleId | null) => void;
  onLineStyle: (preset: LineStyle["id"]) => void;
  onPadStyle: (preset: PadStyle["id"]) => void;
}) {
  const line = pad ? lineStyleFor(pad.h) : null;
  const shape = pad ? padStyleFor(pad.radius) : null;
  return (
    <div className="space-y-2">
      <ControlGroup label="text style — acts on the words you highlight">
        <select
          value={currentStyle === "mixed" ? "" : currentStyle ?? ""}
          disabled={!selection}
          className="h-7 w-full rounded border border-input bg-background px-1 text-[11px] disabled:opacity-50"
          onChange={(event) =>
            onTextStyle(event.target.value ? (event.target.value as TextStyleId) : null)
          }
          title={
            selection
              ? "Sets the style of the highlighted words — with nothing highlighted, of that whole field"
              : "Highlight some words on a page, then choose from here"
          }
        >
          <option value="">
            {currentStyle === "mixed"
              ? "mixed styles"
              : selection
                ? `as designed${drawnAs ? ` (${TEXT_STYLES[drawnAs].name})` : ""}`
                : "highlight words to style them"}
          </option>
          {TEXT_STYLE_ORDER.map((id) => (
            <option key={id} value={id}>
              {TEXT_STYLES[id].name} — {TEXT_STYLES[id].menu}
            </option>
          ))}
        </select>
      </ControlGroup>

      <ControlGroup label="line style — how thick a line is">
        <select
          value={line?.id ?? ""}
          disabled={!pad}
          className="h-7 w-full rounded border border-input bg-background px-1 text-[11px] disabled:opacity-50"
          onChange={(event) => onLineStyle(event.target.value as LineStyle["id"])}
          title={pad ? LINE_STYLES[line!.id].hint : "Select a line or a panel, on a page, first"}
        >
          {!line ? <option value="">no line selected</option> : null}
          {LINE_STYLE_ORDER.map((id) => (
            <option key={id} value={id}>
              {LINE_STYLES[id].name} · {LINE_STYLES[id].points}pt
            </option>
          ))}
        </select>
      </ControlGroup>

      <ControlGroup label="pad style — how round the corners are">
        <select
          value={shape?.id ?? ""}
          disabled={!pad}
          className="h-7 w-full rounded border border-input bg-background px-1 text-[11px] disabled:opacity-50"
          onChange={(event) => onPadStyle(event.target.value as PadStyle["id"])}
          title={pad ? PAD_STYLES[shape!.id].hint : "Select a line or a panel, on a page, first"}
        >
          {!shape ? <option value="">no pad selected</option> : null}
          {PAD_STYLE_ORDER.map((id) => (
            <option key={id} value={id}>
              {PAD_STYLES[id].name}
            </option>
          ))}
        </select>
      </ControlGroup>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {selection
          ? `Words highlighted: ${
              currentStyle === "mixed"
                ? "several styles"
                : currentStyle
                  ? TEXT_STYLES[currentStyle].name
                  : "as designed"
            }.`
          : pad
            ? `${line?.name} line, ${shape?.name} corners, ${PAD_TONES[pad.tone].label} tone.`
            : "Highlight words on a page to style them, or select a line or panel to shape it."}
      </p>
    </div>
  );
}

/**
 * The cover's contact block, as a form.
 *
 * Drafts are local and written on blur, like every other free-text field in this app: the document is re-planned
 * on every change, and a plan per keystroke is a lot of arithmetic to spend on a field nobody has finished typing.
 * The links field is text rather than a row of inputs — one per line, `label | url` — because a link is one
 * thought and a pair of boxes is two.
 */
function ContactFields({
  contact,
  onChange,
}: {
  contact: PortfolioContact | undefined;
  onChange: (next: PortfolioContact) => void;
}) {
  const [draft, setDraft] = React.useState({
    tagline: "",
    email: "",
    phone: "",
    location: "",
    links: "",
  });

  React.useEffect(() => {
    setDraft({
      tagline: contact?.tagline ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      location: contact?.location ?? "",
      links: formatLinks(contact?.links),
    });
  }, [contact?.tagline, contact?.email, contact?.phone, contact?.location, contact?.links]);

  const commit = (field: "tagline" | "email" | "phone" | "location") => {
    const value = draft[field].trim();
    if (value === (contact?.[field] ?? "").trim()) return;
    onChange({ ...contact, [field]: value || undefined });
  };

  const commitLinks = () => {
    const parsed = parseLinks(draft.links);
    if (formatLinks(parsed) === formatLinks(contact?.links)) return;
    onChange({ ...contact, links: parsed.length ? parsed : undefined });
  };

  // A line that is not a safe link is dropped when it is read, so say so rather than letting it vanish.
  const typedLines = draft.links.split(/\r?\n/).filter((line) => line.trim()).length;
  const kept = parseLinks(draft.links).length;

  return (
    <div className="grid gap-1.5">
      {(
        [
          ["tagline", "What you do", "VDC Coordinator — available from June", false],
          ["email", "Email", "you@example.com", false],
          ["phone", "Phone", "555 0100", false],
          ["location", "Where you are", "Portland, OR", false],
        ] as const
      ).map(([field, label, placeholder]) => (
        <label key={field} className="grid gap-0.5 text-[10px] text-muted-foreground">
          {label}
          <input
            value={draft[field]}
            aria-label={label}
            placeholder={placeholder}
            className="h-7 rounded border border-input bg-background px-1 text-[11px] text-foreground"
            onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
            onBlur={() => commit(field)}
          />
        </label>
      ))}
      <label className="grid gap-0.5 text-[10px] text-muted-foreground">
        Links — one per line, <code>label | url</code>
        <textarea
          value={draft.links}
          aria-label="Links"
          placeholder={"LinkedIn | https://linkedin.com/in/you\nportfolio | https://you.example.com"}
          className="min-h-[54px] rounded border border-input bg-background px-1 py-0.5 text-[11px] text-foreground"
          onChange={(event) => setDraft((current) => ({ ...current, links: event.target.value }))}
          onBlur={commitLinks}
        />
      </label>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {typedLines === kept
          ? `${kept} link${kept === 1 ? "" : "s"}.`
          : `${kept} of ${typedLines} lines kept — only http, https and mailto links can go in a document.`}
      </p>
    </div>
  );
}

/**
 * The panel itself: the styles, then whatever the panel's target has.
 *
 * One target, three states, in the order a reader asks for them: *what am I styling* (top), *what have I
 * selected* (a section or a pad, with all of its controls), and *what is the page itself* (add a section, a
 * line, a panel; change its shape; spread it; or delete it). Only one of the latter two shows at a time,
 * because a pad and a section are never selected together.
 */
export function PortfolioInspector({
  page,
  pages,
  selectedBlockId,
  selectedPadId,
  projectName,
  selection,
  currentStyle,
  drawnAs,
  activePad,
  edits,
  onTextStyle,
  onLineStyle,
  onPadStyle,
  onChoose,
  onSpan,
  onColumns,
  onSlots,
  onShape,
  onMoveBlock,
  onMoveAcross,
  onDeleteBlock,
  onSelectBlock,
  onSelectPad,
  onAddSection,
  onLayout,
  onAddPad,
  onFillPage,
  onDeletePage,
  onPreviewPage,
  theme,
  onTheme,
  contact,
  onContact,
}: {
  /** The page this panel acts on, or null when the document has no pages yet. */
  page: PlannedPage | null;
  pages: PlannedPage[];
  selectedBlockId: string | null;
  selectedPadId: string | null;
  projectName?: string;
  selection: TextStyleTarget | null;
  currentStyle: TextStyleId | "mixed" | undefined;
  drawnAs?: TextStyleId;
  activePad: PagePad | null;
  edits: WorkspaceEdits;
  onTextStyle: (style: TextStyleId | null) => void;
  onLineStyle: (preset: LineStyle["id"]) => void;
  onPadStyle: (preset: PadStyle["id"]) => void;
  onChoose: (blockId: string, presentation: PresentationId) => void;
  onSpan: (blockId: string, span: number) => void;
  onColumns: (blockId: string, columns: 1 | 2 | 3 | 4) => void;
  onSlots: (blockId: string, slots: number) => void;
  onShape: (blockId: string, shape: FrameShape) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onMoveAcross: (blockId: string, direction: -1 | 1) => void;
  onDeleteBlock: (blockId: string) => void;
  onSelectBlock: (blockId: string | null) => void;
  onSelectPad: (padId: string | null) => void;
  onAddSection: (pageId: string, presentation: PresentationId) => void;
  onLayout: (pageId: string) => void;
  onAddPad: (pageId: string, kind?: "rule") => void;
  onFillPage: (pageId: string, fillPage: boolean) => void;
  onDeletePage: (pageId: string) => void;
  onPreviewPage: (pageNumber: number) => void;
  /** The document's look, and where a change to it goes. */
  theme: PortfolioTheme | undefined;
  onTheme: (next: PortfolioTheme) => void;
  /** The cover's contact block, and where a change to it goes. */
  contact: PortfolioContact | undefined;
  onContact: (next: PortfolioContact) => void;
}) {
  const [open, setOpen] = React.useState(true);
  const block = page?.blocks.find((entry) => entry.id === selectedBlockId) ?? null;
  const pad = page?.pads?.find((entry) => entry.id === selectedPadId) ?? null;
  /** Where the section sits on its page, in the same row language the layout uses. */
  const place = React.useMemo(() => {
    if (!page || !block) return null;
    const rows = rowsOf(page.blocks);
    const rowIndex = rows.findIndex((row) => row.some((entry) => entry.id === block.id));
    const row = rows[rowIndex] ?? [];
    const column = row.findIndex((entry) => entry.id === block.id);
    return {
      text: `row ${rowIndex + 1} of ${rows.length}${
        row.length > 1
          ? ` · ${column === 0 ? "left" : column === row.length - 1 ? "right" : "middle"}`
          : ""
      }`,
      canMoveRowUp: rowIndex > 0,
      canMoveRowDown: rowIndex < rows.length - 1,
    };
  }, [page, block]);

  /** The look with every axis filled in, so the three controls show a value even on an untouched document. */
  const resolvedLook = themeOf(theme);

  if (!open) {
    // Collapsed to a rail down the side, not to a button at the top: closed, the panel should take width off
    // the page and nothing else — no height, no position of its own, nothing to scroll past. The tab is
    // written sideways so the rail can say what it is without needing to be wide.
    return (
      <aside className="print-hide sticky top-4 z-30 flex w-9 shrink-0 flex-col items-center gap-2 self-start rounded-xl border bg-background/95 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen(true)}
          title="Show the style and page panel"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          style &amp; page
        </span>
      </aside>
    );
  }

  return (
    /*
      A rail beside the pages, pinned and above them.
      Three things it needed: `sticky` (it stays put while the document scrolls), `top-4` (it does not float
      over the top of a page, and there is no longer a sticky bar above the pages for it to slide under), and
      a height limit with its own scrollbar, so a long panel is still reachable on a short window. Open or
      closed it is a flex sibling of the pages, so its width comes out of the workspace — the same way the
      clipboard works on the other side.
    */
    <aside className="print-hide sticky top-4 z-30 max-h-[calc(100vh-2rem)] w-[19rem] shrink-0 space-y-3 self-start overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Style &amp; page</h2>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={() => setOpen(false)}
          title="Collapse"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <StyleBar
        selection={selection}
        currentStyle={currentStyle}
        drawnAs={drawnAs}
        pad={activePad}
        onTextStyle={onTextStyle}
        onLineStyle={onLineStyle}
        onPadStyle={onPadStyle}
      />

      {pad && page ? (
        <PadInspector
          pad={pad}
          page={page}
          onUpdate={(patch) => edits.pad(pad.id, patch)}
          onDelete={() => {
            edits.removePad(pad.id);
            onSelectPad(null);
          }}
          onClose={() => onSelectPad(null)}
        />
      ) : block && page && place ? (
        <SectionInspector
          block={block}
          page={page}
          pages={pages}
          place={place.text}
          canMoveRowUp={place.canMoveRowUp}
          canMoveRowDown={place.canMoveRowDown}
          edits={edits}
          onChoose={onChoose}
          onSpan={onSpan}
          onColumns={onColumns}
          onSlots={onSlots}
          onShape={onShape}
          onMoveBlock={onMoveBlock}
          onMoveAcross={onMoveAcross}
          onDelete={(blockId) => {
            onDeleteBlock(blockId);
            onSelectBlock(null);
          }}
          onClose={() => onSelectBlock(null)}
          onPreviewPage={onPreviewPage}
        />
      ) : null}

      {page ? (
        <PagePanel
          page={page}
          projectName={projectName}
          onAddSection={(presentation) => onAddSection(page.id, presentation)}
          onLayout={() => onLayout(page.id)}
          onAddPad={(kind) => onAddPad(page.id, kind)}
          onFillPage={(fillPage) => onFillPage(page.id, fillPage)}
          onDeletePage={() => onDeletePage(page.id)}
          onPreviewPage={() => onPreviewPage(page.pageNumber)}
        />
      ) : null}

      {/* ------------------------------------------------------------------ *
       * Who the portfolio is from.
       *
       * The cover is the page a hiring manager sees first, and a portfolio that cannot say what you do, how to
       * reply or where else to look is a portfolio nobody can act on. The words of that block are drawn on the
       * cover and read from the plan, so this and the exported file cannot disagree about the order of them.
       * ------------------------------------------------------------------ */}
      <ControlGroup label="who this is from">
        <ContactFields contact={contact} onChange={onContact} />
      </ControlGroup>

      {/* ------------------------------------------------------------------ *
       * The document's own look.
       *
       * At the foot of the panel rather than inside the page section, because it is not a property of a page and
       * not part of a selection: it has to be reachable whatever is selected, including on a document with no
       * pages at all. Three choices, each judged rather than free — five palettes, four pairings, three scales —
       * because a colour wheel produces a decorated page and a chosen palette produces a designed one. Every
       * page, both surfaces and the exported file change together; see `lib/portfolioTheme.ts`.
       * ------------------------------------------------------------------ */}
      <ControlGroup label="the document's look">
        <div className="grid gap-1.5">
          <select
            value={resolvedLook.scheme}
            aria-label="Palette"
            className="h-7 w-full rounded border border-input bg-background px-1 text-[11px]"
            onChange={(event) => onTheme({ ...theme, scheme: event.target.value as InkSchemeId })}
            title="The palette: body ink, headings, captions, one accent, and the hairlines"
          >
            {INK_SCHEME_ORDER.map((id) => (
              <option key={id} value={id}>
                {INK_SCHEMES[id].name} — {INK_SCHEMES[id].note}
              </option>
            ))}
          </select>
          <select
            value={resolvedLook.type}
            aria-label="Typeface"
            className="h-7 w-full rounded border border-input bg-background px-1 text-[11px]"
            onChange={(event) => onTheme({ ...theme, type: event.target.value as TypePairingId })}
            title="The typeface pairing, drawn with the standard PDF fonts so nothing has to be embedded"
          >
            {TYPE_PAIRING_ORDER.map((id) => (
              <option key={id} value={id}>
                {TYPE_PAIRINGS[id].name} — {TYPE_PAIRINGS[id].note}
              </option>
            ))}
          </select>
          <select
            value={resolvedLook.scale}
            aria-label="Type scale"
            className="h-7 w-full rounded border border-input bg-background px-1 text-[11px]"
            onChange={(event) => onTheme({ ...theme, scale: event.target.value as TypeScaleId })}
            title="The type scale — every size in the document, multiplied"
          >
            {TYPE_SCALE_ORDER.map((id) => (
              <option key={id} value={id}>
                {TYPE_SCALES[id].name} — {TYPE_SCALES[id].note}
              </option>
            ))}
          </select>
        </div>
      </ControlGroup>
      <p className="text-[11px] leading-relaxed text-muted-foreground" data-look-summary>
        {INK_SCHEMES[resolvedLook.scheme].name} · {TYPE_PAIRINGS[resolvedLook.type].name} ·{" "}
        {TYPE_SCALES[resolvedLook.scale].name}
        {isDefaultTheme(theme)
          ? ` — the look this composer has always drawn (${DEFAULT_THEME.scheme}/${DEFAULT_THEME.type}/${DEFAULT_THEME.scale}).`
          : "."}
      </p>
    </aside>
  );
}

/**
 * Whether the pictures on this page will print as sharply as they look on screen.
 *
 * This is the half of "crop and resolution" that is worth having first, and the answer to what it is *for*: a
 * photograph is placed by width, and the pixels it carries then have to cover that width at print size. A 1400px
 * frame six inches wide is 233 DPI and looks the same in the file as on the screen; the same frame cropped to a
 * quarter of its width carries 350px and prints visibly soft — and nothing on a page tells you which of those you
 * are looking at until it is printed.
 *
 * The arithmetic is `lib/images.ts` — `sourceRect`, `placedDpi`, `dpiVerdict` — which had been written and tested
 * and called by nothing. The width is worked out the way the renderers work it out: the printable width, times the
 * section's share of the row, divided between the frames that share it.
 */
function PrintSize({ page }: { page: PlannedPage }) {
  const frames = page.blocks.flatMap((block) =>
    block.images.map((image) => ({
      image,
      // The same rule the layout uses: the printable width, this section's share of it, split between the
      // frames the section carries.
      placedIn: ((page.width - 108) * spanFraction(block)) / Math.max(1, block.images.length) / 72,
    })),
  );
  if (!frames.length) return null;

  return (
    <ControlGroup label="print size — how sharp these frames will be">
      <ul className="grid gap-1" data-print-size>
        {frames.map(({ image, placedIn }) => {
          const verdict = dpiVerdict(image, placedIn);
          const rect = sourceRect(image);
          const cropped = image.crop && (image.crop.w < 1 || image.crop.h < 1);
          return (
            <li key={image.id} className="grid gap-0.5 text-[10px] leading-snug">
              <span className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    verdict.level === "good"
                      ? "bg-emerald-500"
                      : verdict.level === "acceptable"
                        ? "bg-amber-500"
                        : "bg-destructive",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{image.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {placedIn.toFixed(1)} in wide
                </span>
              </span>
              <span
                className={cn(
                  "pl-3",
                  verdict.level === "good" ? "text-muted-foreground" : "text-foreground",
                )}
                data-verdict={verdict.level}
              >
                {verdict.message}
              </span>
              <span className="pl-3 text-muted-foreground">
                {image.width}×{image.height}px source
                {cropped
                  ? `, cropped to ${rect.sw}×${rect.sh}px (${Math.round(image.crop.w * 100)}% × ${Math.round(image.crop.h * 100)}%)`
                  : ", whole frame"}
              </span>
            </li>
          );
        })}
      </ul>
    </ControlGroup>
  );
}

export function PagePanel({
  page,
  projectName,
  onAddSection,
  onLayout,
  onAddPad,
  onFillPage,
  onDeletePage,
  onPreviewPage,
}: {
  page: PlannedPage;
  projectName?: string;
  onAddSection: (presentation: PresentationId) => void;
  onLayout: () => void;
  onAddPad: (kind?: "rule") => void;
  onFillPage: (fillPage: boolean) => void;
  onDeletePage: () => void;
  onPreviewPage: () => void;
}) {
  const ownsItself = page.kind === "flip" || page.kind === "filmstrip";
  return (
    <div className="space-y-2 rounded-lg border bg-card p-2.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
          page {page.pageNumber}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{page.title || page.kind}</span>
        <span className="text-[11px] text-muted-foreground">
          {page.kind === "filmstrip" ? "wide row" : page.kind} · {page.width / 72}×{page.height / 72} in
        </span>
      </div>

      <PrintSize page={page} />

      {ownsItself ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          This page belongs to a section: its words are that section&apos;s words, so they are typed on the
          page itself and its layout comes from the section&apos;s presentation. Nothing to add here.
        </p>
      ) : (
        <>
          <ControlGroup label="add to this page">
            <Pill title="Add another section to this page" onClick={() => onAddSection("cards")}>
              <Plus className="mr-0.5 inline h-3 w-3" />
              section
            </Pill>
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) onAddSection(event.target.value as PresentationId);
              }}
              className="rounded border border-input bg-background px-1 py-0.5 text-[11px]"
              title="Add a section of a particular kind to this page"
            >
              <option value="">of a kind…</option>
              {PRESENTATION_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </ControlGroup>

          <ControlGroup label="the page's shape and grouping">
            <Pill title="Change this page's layout — every other page is untouched" onClick={onLayout}>
              <LayoutTemplate className="mr-0.5 inline h-3 w-3" />
              layout
            </Pill>
            <Pill
              title="A panel behind the sections, to group them — drag it and its corners to place it"
              onClick={() => onAddPad(undefined)}
            >
              <Square className="mr-0.5 inline h-3 w-3" />
              panel
            </Pill>
            <Pill title="A line or a bar — the same layer, made thin" onClick={() => onAddPad("rule")}>
              <Minus className="mr-0.5 inline h-3 w-3" />
              line
            </Pill>
            <Pill
              title="Spread the sections over the page instead of packing them at the top"
              active={page.fillPage ?? false}
              onClick={() => onFillPage(!(page.fillPage ?? false))}
            >
              spread over the page
            </Pill>
          </ControlGroup>
        </>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          title="Open the live PDF at this page — the real file, not the drawing of it"
          onClick={onPreviewPage}
        >
          read this page
        </Button>
        {page.kind === "cover" ? null : (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs text-muted-foreground hover:text-destructive"
            title="Delete this page and everything on it"
            onClick={onDeletePage}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            delete this page
          </Button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {projectName ? `In ${projectName}. ` : ""}A section added here is an ordinary section: move it, size
        it, re-present it, delete it.
      </p>
    </div>
  );
}


