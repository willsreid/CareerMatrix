"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Layers,
  LayoutTemplate,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";
import { PortfolioInspector } from "@/components/PortfolioInspector";
import { PortfolioPdfPreview } from "@/components/PortfolioPdfPreview";
import { PortfolioWorkspace, type WorkspaceEdits } from "@/components/PortfolioWorkspace";
import type { TextStyleTarget } from "@/components/PortfolioWorkspace";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/WorkspaceProvider";
import {
  PRESENTATION_OPTIONS,
  framesForPresentation,
  optionAvailability,
  type PresentationId,
  type SectionContent,
} from "@/lib/presentationOptions";
import { assetById, addAsset, imageAsset, textAsset, type MediaAsset, type MediaLibrary } from "@/lib/mediaLibrary";
import { importImageFile } from "@/lib/images";
import {
  PORTFOLIO_CAPABILITIES,
  SUPPORT_LABELS,
  addSlide,
  addPad,
  addTextSection,
  appendText,
  appendTextToBlock,
  arrangeUnplaced,
  createBlock,
  createPortfolio,
  nextCoverSlot,
  defaultGroupPad,
  defaultRulePad,
  findBlock,
  moveBlockAcrossRows,
  moveBlockToPage,
  moveSlide,
  moveBlock,
  moveBlockTo,
  moveProject,
  moveProjectTo,
  moveSlideTo,
  pageSummary,
  placeAsset as placeAssetIn,
  placeAssetAt,
  planPortfolio,
  removeBlock,
  removePad,
  removeProject,
  removeSlide,
  renameProject,
  renameSlide,
  setBlockBodyStyle,
  setBlockCaption,
  setBlockLabel,
  setBlockTextStyle,
  setBlockColumns,
  setBlockMetric,
  setBlockShape,
  setBlockSlots,
  setBlockSpan,
  setBlockText,
  setBlockTextPlacement,
  setCoverImage,
  clearCoverImage,
  setFillPage,
  setPortfolioText,
  setPortfolioTextStyle,
  setSlideText,
  setSlideTextStyle,
  unplaceAsset,
  unplacedAssets,
  updatePad,
  findPad,
  dragPad,
  LINE_STYLES,
  PAD_STYLES,
  setBlockTextMark,
  setSlideTextMark,
  setPortfolioTextMark,
} from "@/lib/portfolio";
import type { PlannedPage } from "@/lib/portfolio";
import {
  PAGE_TEMPLATES,
  applyPageTemplate,
  pageTemplateRows,
  relayoutPage,
  type PageTemplate,
} from "@/lib/pageTemplates";
import { PORTFOLIO_TEMPLATES, applyTemplate, templatePreview } from "@/lib/portfolioTemplates";
import type { PortfolioBlock, PortfolioSlide } from "@/lib/portfolioTypes";
import {
  SLOT_DRAWN_AS,
  TEXT_STYLES,
  resolveTextStyle,
  styleUnderMarks,
  type TextStyleId,
} from "@/lib/textStyles";
import { themeVariables, cleanTheme } from "@/lib/portfolioTheme";
import { cleanContact } from "@/lib/portfolioContact";
import { cn } from "@/lib/utils";

/**
 * How far one arrow key moves the selected pad, as a fraction of the page.
 *
 * Fine by default — half a percent is about three points on Letter, which is the difference between a line
 * sitting where it looks right and being snapped somewhere else — and a whole grid column with ⌥ held.
 */
const NUDGE_FINE = 0.005;
const NUDGE_COARSE = 1 / 12;

/**
 * The portfolio composer.
 *
 * Left and centre: the document, project by project, each section showing what it holds and the
 * menu of ways to present it. Right: the media store, collapsible, because content is only
 * interesting while you are placing it.
 */
export default function PortfolioPage() {
  const { ready, portfolio, updatePortfolio, mediaLibrary, updateMediaLibrary, profile,
    undoPortfolio, redoPortfolio, canUndo, canRedo } = useWorkspace();
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  /** The asset being dragged out of the store, so the pages can show where it would land. */
  const [draggingAssetId, setDraggingAssetId] = React.useState<string | null>(null);
  /** The project being dragged in the list, and the one it is currently over. */
  const [dragProjectId, setDragProjectId] = React.useState<string | null>(null);
  const [overProjectIndex, setOverProjectIndex] = React.useState<number | null>(null);
  /** The live PDF: whether it is showing, and which page to open it at. */
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewPage, setPreviewPage] = React.useState(1);
  /** Which project the "New page" layout picker is adding to, or null when it is closed. */
  const [pagePickerProjectId, setPagePickerProjectId] = React.useState<string | null>(null);
  /** The pad being worked on, if any. A pad and a section are never selected at once. */
  const [selectedPadId, setSelectedPadId] = React.useState<string | null>(null);
  /** The page whose layout picker is open, if any. One page, never the project. */
  const [layoutFor, setLayoutFor] = React.useState<string | null>(null);
  /**
   * The words the reader has highlighted, and which field they are in.
   *
   * Kept here rather than in the workspace because it is what the *style bar* acts on, and the bar lives
   * above the pages: one selection, one dropdown, wherever on the document the words are.
   */
  const [textSelection, setTextSelection] = React.useState<{
    target: TextStyleTarget;
    range: { start: number; end: number } | null;
    /** The words the range covers, so what was highlighted can be kept as well as styled. */
    words: string;
  } | null>(null);

  const [activePageId, setActivePageId] = React.useState<string | null>(null);

  const doc = portfolio;
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const blocks =
    doc?.projects.flatMap((project) => project.slides.flatMap((slide) => slide.blocks)) ?? [];
  const activeBlock = blocks.find((block) => block.id === selectedBlockId) ?? null;
  const pages = doc ? planPortfolio(doc, mediaLibrary) : [];
  /**
   * The page the left panel acts on.
   *
   * Derived rather than stored twice: a selection wins (the page holding it is the page you are working on),
   * then the page you last clicked, then the first page — so the panel always has a target and never shows a
   * page that is not on screen.
   */
  const activePage: PlannedPage | null = React.useMemo(() => {
    const holding = pages.find(
      (page) =>
        page.blocks.some((block) => block.id === selectedBlockId) ||
        (page.pads ?? []).some((pad) => pad.id === selectedPadId),
    );
    return holding ?? pages.find((page) => page.id === activePageId) ?? pages[0] ?? null;
  }, [pages, selectedBlockId, selectedPadId, activePageId]);
  const activePad = doc && selectedPadId ? findPad(doc, selectedPadId) ?? null : null;

  /**
   * The style the highlighted words are currently set in, and what the dropdown should show.
   *
   * Read from the document rather than from the DOM, so the dropdown says what the *file* will say. A
   * collapsed caret reports the slot's own style — which is also what choosing from the dropdown then sets,
   * because "no range" means the whole field.
   */
  const selectionStyle: TextStyleId | "mixed" | undefined = React.useMemo(() => {
    if (!doc || !textSelection) return undefined;
    const { target, range } = textSelection;
    const collapsed = !range || range.start === range.end;
    const span = collapsed ? undefined : range ?? undefined;
    if (target.kind === "block") {
      const block = blocks.find((entry) => entry.id === target.blockId);
      if (!block) return undefined;
      const base =
        target.slot === "caption"
          ? resolveTextStyle(block.textStyles, "caption")
          : resolveTextStyle(block.textStyles, target.slot, target.slot === "title" ? "title" : undefined);
      return styleUnderMarks(base, block.textMarks?.[target.slot], span);
    }
    if (target.kind === "page") {
      const [, slideId] = target.pageId.split(":");
      const slide = doc.projects
        .flatMap((project) => project.slides)
        .find((entry) => entry.id === slideId);
      const base = slide
        ? resolveTextStyle(slide.textStyles, target.slot, SLOT_DRAWN_AS.page[target.slot])
        : undefined;
      return styleUnderMarks(base, slide?.textMarks?.[target.slot], span);
    }
    const base = resolveTextStyle(doc.textStyles, target.slot, SLOT_DRAWN_AS.document[target.slot]);
    return styleUnderMarks(base, doc.textMarks?.[target.slot], span);
  }, [doc, textSelection, blocks]);

  /**
   * Applies a style to the highlighted words — or to the whole field when nothing is highlighted.
   *
   * One function for all three owners because the *gesture* is one thing: highlight, choose. The setters do
   * the rest, including the rule that a range covering the whole text is stored as the slot's own style, so
   * this can never leave a field looking styled in one place and not another.
   */
  const applyTextStyle = (style: TextStyleId | null) => {
    if (!textSelection) return;
    const { target, range } = textSelection;
    const span = !range || range.start === range.end ? undefined : range;
    if (target.kind === "block") {
      updatePortfolio((current) =>
        setBlockTextMark(current, target.blockId, target.slot, span, style, target.text),
      );
    } else if (target.kind === "page") {
      const [, slideId] = target.pageId.split(":");
      if (!slideId) return;
      updatePortfolio((current) => setSlideTextMark(current, slideId, target.slot, span, style));
    } else {
      updatePortfolio((current) => setPortfolioTextMark(current, target.slot, span, style));
    }
    // The highlight stays where it is, so trying a second style is one more click rather than a re-select.
    toast.success(style ? `Set as ${TEXT_STYLES[style].name}.` : "Back to as designed.");
  };

  /**
   * The words highlighted on a page, if there are any: what the clipboard will keep.
   *
   * Empty for a caret with nothing selected, which is what makes the button in the panel say what it will do
   * rather than offering to save nothing.
   */
  const highlighted = textSelection?.words.trim() ?? "";

  /**
   * Keeps the highlighted words as a text module.
   *
   * The other half of the clipboard: instead of copying a paragraph out to somewhere else, you highlight the
   * paragraph that already works on the page and keep it here, ready to drop into the next page that needs it.
   * The module is named from its first line, so it can be found again in a list of twenty.
   */
  const keepHighlighted = () => {
    if (!highlighted) {
      toast("Highlight some words on a page first.");
      return;
    }
    const asset = textAsset(highlighted, highlighted.split(/\n/)[0]?.slice(0, 48) || "Snippet");
    updateMediaLibrary((current) => addAsset(current, asset));
    toast.success("Saved to the clipboard as a text module.");
  };
  /** Work imported but not yet shown anywhere: what the macro button offers to place. */
  const unplaced = doc ? unplacedAssets(doc, mediaLibrary) : [];

  const patchBlock = (blockId: string, patch: Partial<PortfolioBlock>) => {
    updatePortfolio((current) => ({
      ...current,
      projects: current.projects.map((project) => ({
        ...project,
        slides: project.slides.map((slide) => ({
          ...slide,
          blocks: slide.blocks.map((block) =>
            block.id === blockId ? { ...block, ...patch } : block,
          ),
        })),
      })),
    }));
  };

  /**
   * Places an item from the clipboard.
   *
   * A **text module** is words, not content *for* a section: placed on a section it joins that section's
   * text, and placed on empty page space it becomes a text section of its own. An **image** is content a
   * section shows, so it goes into the selected section's frames.
   */
  const placeAsset = (asset: MediaAsset) => {
    if (asset.kind === "text" && asset.text) {
      if (activeBlock) {
        patchBlock(activeBlock.id, {
          body: appendText(activeBlock.body, asset.text),
        });
        toast.success("Added to the selected section.");
        return;
      }
      toast("Select a section to add this text to, or drag it onto a page.");
      return;
    }
    if (!activeBlock) return;
    patchBlock(activeBlock.id, { assetIds: [...(activeBlock.assetIds ?? []), asset.id] });
  };

  /** The macro step, surfaced as one button: everything imported gets a section. */
  const placeUnplacedNow = () => {
    const waiting = doc ? unplacedAssets(doc, mediaLibrary).length : 0;
    if (!waiting) {
      toast("Nothing is waiting to be placed — every asset is already in the document.");
      return;
    }
    updatePortfolio((current) => arrangeUnplaced(current, mediaLibrary).portfolio);
    toast.success(`Placed ${waiting} asset${waiting === 1 ? "" : "s"} into new sections.`);
  };

  /** A template fills its slots from the store, in the order things were imported. */
  const addFromTemplate = (templateId: string, presetName?: string) => {
    const template = PORTFOLIO_TEMPLATES.find((candidate) => candidate.id === templateId);
    if (!template) return;
    const project = applyTemplate(template, { name: presetName ?? template.name, library: mediaLibrary });
    updatePortfolio((current) => ({ ...current, projects: [...current.projects, project] }));
    const placed = project.slides.reduce(
      (total, slide) => total + (slide.blocks[0]?.assetIds?.length ?? 0),
      0,
    );
    toast.success(`${project.name}: ${project.slides.length} sections, ${placed} assets placed.`);
    setTemplateOpen(false);
  };

  /** Adds a block to the page the workspace names, which is `${projectId}:${slideId}`. */
  const addBlockToPageId = (pageId: string, presentation: PresentationId) => {
    const [projectId, slideId] = pageId.split(":");
    if (!projectId || !slideId) return;
    addBlockToPage(projectId, slideId, presentation);
  };

  /**
   * A drop from the store lands on a block, or on the empty part of a page.
   *
   * Dropping onto empty space adds a section for the asset rather than discarding the gesture — the
   * alternative teaches people that dragging does nothing, which is worse than not offering it.
   */
  const dropAssetOn = (blockId: string | null, pageId: string) => {
    const assetId = draggingAssetId;
    setDraggingAssetId(null);
    if (!assetId) return;
    const [, slideId] = pageId.split(":");
    if (!slideId) return;

    // A text module dropped on a section joins that section's words; dropped on empty page space it
    // becomes a text section of its own, so a page can be built by dragging writing onto it.
    const dropped = doc ? assetById(mediaLibrary, assetId) : undefined;
    if (dropped?.kind === "text" && dropped.text) {
      if (blockId) {
        updatePortfolio((current) =>
          appendTextToBlock(current, blockId, dropped.text ?? ""),
        );
        setSelectedBlockId(blockId);
        toast.success("Added to that section.");
        return;
      }
      updatePortfolio((current) =>
        addTextSection(current, slideId, dropped.text ?? ""),
      );
      toast.success("Added as a text section on that page.");
      return;
    }

    if (blockId) {
      updatePortfolio((current) => placeAssetIn(current, blockId, assetId));
      setSelectedBlockId(blockId);
      toast.success("Placed.");
      return;
    }
    updatePortfolio((current) => ({
      ...current,
      projects: current.projects.map((project) => ({
        ...project,
        slides: project.slides.map((slide) =>
          slide.id !== slideId
            ? slide
            : {
                ...slide,
                blocks: [
                  ...slide.blocks,
                  createBlock("image", { presentation: "cards", assetIds: [assetId] }),
                ],
              },
        ),
      })),
    }));
    toast.success("Added a section for it.");
  };

  /* Undo and redo on the keyboard, which is where hands already are — and the arrow keys, for whatever is
     selected.
     The arrows are here because a line is three pixels tall: dragging one means chasing a target you cannot
     see, and every drag also snaps to the grid. An arrow moves the selected pad by a *fine* step — half a
     percent of the page, about three points on Letter — so a line can be put exactly where it belongs; hold
     ⌥ for a whole grid column, and hold ⇧ to resize instead: the ends of the line, or its thickness. */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (event.key.startsWith("Arrow") && activePad) {
        // Typing in a field: the arrow belongs to the caret, not to the pad.
        if (target?.isContentEditable) return;
        const step = event.altKey ? NUDGE_COARSE : NUDGE_FINE;
        const grows = event.key === "ArrowRight" || event.key === "ArrowDown";
        event.preventDefault();
        updatePortfolio((current) => {
          const pad = findPad(current, activePad.id);
          if (!pad) return current;
          const moved = event.shiftKey
            ? event.key === "ArrowLeft"
              ? dragPad(pad, "w", -step, 0)
              : event.key === "ArrowRight"
                ? dragPad(pad, "e", step, 0)
                : dragPad(pad, "se", 0, grows ? step : -step)
            : dragPad(
                pad,
                "move",
                event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0,
                event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0,
              );
          return updatePad(current, pad.id, moved);
        });
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      // Never steal undo from a field the user is typing in.
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      event.preventDefault();
      if (event.shiftKey) redoPortfolio();
      else undoPortfolio();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoPortfolio, redoPortfolio, activePad, updatePortfolio]);

  /**
   * Adds another block to the page you are already on.
   *
   * This is what makes a page a composition rather than a single section: a cards row, then a line
   * of numbers, then a paragraph, all on one page — which is the shape a portfolio page actually
   * takes, and something the per-section editor could not express.
   */
  const addBlockToPage = (projectId: string, slideId: string, presentation: PresentationId) => {
    updatePortfolio((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id !== projectId
          ? project
          : {
              ...project,
              slides: project.slides.map((slide) =>
                slide.id !== slideId
                  ? slide
                  : {
                      ...slide,
                      // The section arrives with the frames its variation wants, empty. That is the
                      // point of choosing a variation before you have the pictures: the space is
                      // committed at the right size, and the pictures fill it as they arrive.
                      blocks: [
                        ...slide.blocks,
                        createBlock("image", {
                          presentation,
                          slots: framesForPresentation(presentation),
                        }),
                      ],
                    },
              ),
            },
      ),
    }));
    toast.success("Added to the current page.");
  };

  /** A new page with a new section on it, sized for the variation that was chosen. */
  const addNewPage = (projectId: string, presentation: PresentationId) => {
    updatePortfolio((current) => {
      const { portfolio: next } = addSlide(current, projectId);
      return {
        ...next,
        projects: next.projects.map((project) =>
          project.id !== projectId
            ? project
            : {
                ...project,
                slides: project.slides.map((slide, index) =>
                  index !== project.slides.length - 1
                    ? slide
                    : {
                        ...slide,
                        blocks: [
                          createBlock("image", {
                            presentation,
                            title: "New section",
                            slots: framesForPresentation(presentation),
                          }),
                        ],
                      },
                ),
              },
        ),
      };
    });
  };

  /** A page with nothing on it yet, for arranging before you know what goes where. */
  const addEmptyPage = (projectId: string) => {
    updatePortfolio((current) => addSlide(current, projectId).portfolio);
    toast.success("Added a page. Add a section to it, or pick one and set its width.");
  };

  /** Bringing the preview into view when it opens, since it sits below the pages. */
  const previewRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!previewOpen) return;
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [previewOpen, previewPage]);

  /**
   * A picture picked on the page: imported, kept, and placed in the frame it was picked for.
   *
   * `importImageFile` downscales the file and puts the bytes in the image store, so the picture is a
   * library asset from this moment — reusable in any other section, and re-readable after a reload —
   * and the asset is added to the library's metadata. Only then is it placed, into the frame that was
   * clicked rather than at the end, so filling hole three of four does not rearrange the page.
   */
  const importPictureInto = async (blockId: string, index: number, file: File) => {
    try {
      const imported = await importImageFile(file, { placedWidthIn: 4 });
      updateMediaLibrary((current) =>
        addAsset(current, imageAsset(imported.ref, { name: file.name })),
      );
      updatePortfolio((current) => placeAssetAt(current, blockId, imported.ref.id, index));
      toast.success(
        imported.notes.length
          ? `${file.name} placed. ${imported.notes[0]}`
          : `${file.name} placed — it is in the store too, ready to reuse.`,
      );
    } catch {
      toast.error(`${file.name} could not be read as an image.`);
    }
  };

  const edits: WorkspaceEdits = {
    slideText: (pageId, patch) => {
      const [, slideId] = pageId.split(":");
      if (slideId) updatePortfolio((current) => setSlideText(current, slideId, patch));
    },
    blockText: (blockId, patch) =>
      updatePortfolio((current) => setBlockText(current, blockId, patch)),
    caption: (blockId, imageId, caption) =>
      updatePortfolio((current) => setBlockCaption(current, blockId, imageId, caption)),
    metric: (blockId, index, patch) =>
      updatePortfolio((current) => setBlockMetric(current, blockId, index, patch)),
    textPlacement: (blockId, placement) =>
      updatePortfolio((current) => setBlockTextPlacement(current, blockId, placement)),
    bodyStyle: (blockId, style) =>
      updatePortfolio((current) => setBlockBodyStyle(current, blockId, style)),
    importImage: (blockId, index, file) => {
      void importPictureInto(blockId, index, file);
    },
    moveToPage: (blockId, pageId, index) => {
      const [, slideId] = pageId.split(":");
      if (!slideId) return;
      updatePortfolio((current) => moveBlockToPage(current, blockId, slideId, index));
      toast.success("Moved that section to another page.");
    },
    pad: (padId, patch) => updatePortfolio((current) => updatePad(current, padId, patch)),
    addPad: (pageId, kind) => {
      const [, slideId] = pageId.split(":");
      if (!slideId) return;
      const pad = kind === "rule" ? defaultRulePad() : defaultGroupPad();
      updatePortfolio((current) => addPad(current, slideId, pad));
      setSelectedPadId(pad.id);
      toast.success(
        kind === "rule"
          ? "A line added — drag it, or resize it from a corner."
          : "A panel added behind the sections — drag it, or resize it from a corner.",
      );
    },
    removePad: (padId) => updatePortfolio((current) => removePad(current, padId)),
    portfolioText: (patch) => updatePortfolio((current) => setPortfolioText(current, patch)),
    coverImage: (index, file) => {
      void (async () => {
        try {
          const imported = await importImageFile(file, { placedWidthIn: 2 });
          updateMediaLibrary((current) =>
            addAsset(current, imageAsset(imported.ref, { name: file.name, tags: ["cover"] })),
          );
          updatePortfolio((current) =>
            // A slot index when the button was on a slot, else the first free one — filling a hole fills that
            // hole rather than overwriting whatever is last.
            setCoverImage(current, index >= 0 ? index : nextCoverSlot(current), imported.ref.id),
          );
          toast.success(`${file.name} is on the cover — and in the store.`);
        } catch {
          toast.error(`${file.name} could not be read as an image.`);
        }
      })();
    },
    clearCoverImage: (index) => updatePortfolio((current) => clearCoverImage(current, index)),
    saveText: (blockId) => {
      const block = doc ? findBlock(doc, blockId) : undefined;
      if (!block?.body) return;
      const asset = textAsset(block.body, block.title ?? "saved text");
      updateMediaLibrary((current) => addAsset(current, asset));
      toast.success("Saved to the clipboard as a text module — drag it onto any page.");
    },
    chooseLayout: (pageId) => {
      const [, slideId] = pageId.split(":");
      if (slideId) setLayoutFor((open) => (open === slideId ? null : slideId));
    },
    blockTextStyle: (blockId, slot, style) => {
      updatePortfolio((current) => setBlockTextStyle(current, blockId, slot, style));
    },
    slideTextStyle: (pageId, slot, style) => {
      const [, slideId] = pageId.split(":");
      if (!slideId) return;
      updatePortfolio((current) => setSlideTextStyle(current, slideId, slot, style));
    },
    portfolioTextStyle: (slot, style) => {
      updatePortfolio((current) => setPortfolioTextStyle(current, slot, style));
    },
    blockLabel: (blockId, side, label) => {
      updatePortfolio((current) => setBlockLabel(current, blockId, side, label));
    },
    selectText: (target, range, words) => {
      // A collapsed range means the caret is merely in the field, which the bar reads as "the whole
      // field": it keeps the selection so the dropdown knows what to act on, and `applyTextStyle` turns a
      // collapsed range into no range at all.
      setTextSelection({ target, range, words: words ?? "" });
    },
  };

  /** A new page from a layout: one gesture, and every section it makes is editable afterwards. */
  const addPageFromTemplate = (projectId: string, template: PageTemplate) => {
    const stamp = Date.now().toString(36);
    updatePortfolio((current) =>
      applyPageTemplate(current, projectId, template, { stamp, id: `sl-${stamp}` }),
    );
    setPagePickerProjectId(null);
    toast.success(
      `${template.name}: ${template.sections.length} sections added. Move, resize and re-present each one.`,
    );
  };

  if (!ready) {
    return <main className="p-8 text-sm text-muted-foreground">Loading your workspace…</main>;
  }

  return (
    /**
     * The document's own look, as CSS variables on the container both panels sit in.
     *
     * The pages read them through their own classes and the style picker's samples read them across the panel, so
     * choosing "Plum" changes what you are looking at in the same frame you choose it — see `lib/portfolioTheme.ts`.
     * A document with no theme sets nothing here, and the stylesheet's own defaults draw it.
     */
    <main className="mx-auto flex w-full max-w-[1800px] items-start gap-4 p-4"
      style={themeVariables(doc?.theme) as React.CSSProperties}
    >

      {doc ? (
        <PortfolioInspector
          page={activePage}
          pages={pages}
          selectedBlockId={selectedBlockId}
          selectedPadId={selectedPadId}
          theme={doc.theme}
          onTheme={(next) =>
            updatePortfolio((current) => ({ ...current, theme: cleanTheme(next) }))
          }
          contact={doc.contact}
          onContact={(next) =>
            updatePortfolio((current) => ({ ...current, contact: cleanContact(next) }))
          }
          projectName={
            activePage && activePage.projectIndex >= 0
              ? doc.projects[activePage.projectIndex]?.name
              : undefined
          }
          selection={textSelection?.target ?? null}
          currentStyle={selectionStyle}
          drawnAs={
            textSelection
              ? textSelection.target.kind === "block"
                ? SLOT_DRAWN_AS.section[textSelection.target.slot]
                : textSelection.target.kind === "page"
                  ? SLOT_DRAWN_AS.page[textSelection.target.slot]
                  : SLOT_DRAWN_AS.document[textSelection.target.slot]
              : undefined
          }
          activePad={activePad}
          edits={edits}
          onTextStyle={applyTextStyle}
          onLineStyle={(preset) => {
            if (activePad) {
              updatePortfolio((current) =>
                updatePad(current, activePad.id, { h: LINE_STYLES[preset].height }),
              );
            }
          }}
          onPadStyle={(preset) => {
            if (activePad) {
              updatePortfolio((current) =>
                updatePad(current, activePad.id, { radius: PAD_STYLES[preset].radius }),
              );
            }
          }}
          onChoose={(blockId, presentation) => patchBlock(blockId, { presentation })}
          onSpan={(blockId, span) =>
            updatePortfolio((current) => setBlockSpan(current, blockId, span))
          }
          onColumns={(blockId, columns) =>
            updatePortfolio((current) => setBlockColumns(current, blockId, columns))
          }
          onSlots={(blockId, slots) =>
            updatePortfolio((current) => setBlockSlots(current, blockId, slots))
          }
          onShape={(blockId, shape) =>
            updatePortfolio((current) => setBlockShape(current, blockId, shape))
          }
          onMoveBlock={(blockId, direction) =>
            updatePortfolio((current) => moveBlock(current, blockId, direction))
          }
          onMoveAcross={(blockId, direction) =>
            updatePortfolio((current) => moveBlockAcrossRows(current, blockId, direction))
          }
          onDeleteBlock={(blockId) => updatePortfolio((current) => removeBlock(current, blockId))}
          onSelectBlock={(blockId) => {
            setSelectedBlockId(blockId);
            if (blockId) setSelectedPadId(null);
          }}
          onSelectPad={(padId) => {
            setSelectedPadId(padId);
            if (padId) setSelectedBlockId(null);
          }}
          onAddSection={addBlockToPageId}
          onLayout={(pageId) => {
            const [, slideId] = pageId.split(":");
            if (slideId) setLayoutFor((open) => (open === slideId ? null : slideId));
          }}
          onAddPad={(pageId, kind) => edits.addPad(pageId, kind)}
          onFillPage={(pageId, fillPage) => {
            const [, slideId] = pageId.split(":");
            if (slideId) updatePortfolio((current) => setFillPage(current, slideId, fillPage));
          }}
          onDeletePage={(pageId) => {
            const [, slideId] = pageId.split(":");
            if (!slideId) return;
            updatePortfolio((current) => removeSlide(current, slideId));
            toast.success("Removed that page.");
          }}
          onPreviewPage={(pageNumber) => {
            setPreviewPage(pageNumber);
            setPreviewOpen(true);
          }}
        />
      ) : null}

      <div className="min-w-0 flex-1 space-y-4">
        <header className="flex flex-wrap items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">{doc?.title ?? "Portfolio"}</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {doc ? `${pages.length} page${pages.length === 1 ? "" : "s"}` : "not started"}
          </span>
          {doc ? <span className="text-xs text-muted-foreground">{pageSummary(pages)}</span> : null}
          {doc ? (
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={!canUndo}
                title="Undo (⌘Z)"
                onClick={undoPortfolio}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={!canRedo}
                title="Redo (⇧⌘Z)"
                onClick={redoPortfolio}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </span>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {doc ? (
              <>
                {unplaced.length ? (
                  <Button size="sm" onClick={placeUnplacedNow} title="Give every imported asset a section">
                    <Wand2 className="mr-1.5 h-4 w-4" />
                    Place {unplaced.length} unplaced
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setTemplateOpen((open) => !open)}>
                  <LayoutTemplate className="mr-1.5 h-4 w-4" />
                  From a template
                </Button>
                <Button
                  size="sm"
                  variant={previewOpen ? "default" : "outline"}
                  title="Show the real PDF, live, and download it"
                  onClick={() => setPreviewOpen((open) => !open)}
                >
                  <Eye className="mr-1.5 h-4 w-4" />
                  {previewOpen ? "Hide the PDF" : "Preview the PDF"}
                </Button>
                <Button
                  size="sm"
                  variant={pagePickerProjectId ? "default" : "outline"}
                  title="Start a new page from a layout: three across, four squares, a frame with the words beside it"
                  onClick={() => {
                    if (!doc) return;
                    const existing = doc.projects[0]?.id;
                    if (existing) {
                      setPagePickerProjectId((open) => (open ? null : existing));
                      return;
                    }
                    // A page needs a project to live in, so the first page makes one.
                    const project = newProject();
                    updatePortfolio((current) => ({
                      ...current,
                      projects: [...current.projects, project],
                    }));
                    setPagePickerProjectId(project.id);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  New page
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => updatePortfolio(() => createPortfolio({ author: profile.header.name }))}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Start a portfolio
              </Button>
            )}
          </div>
        </header>

        {templateOpen || !doc ? <TemplatePicker onPick={addFromTemplate} library={mediaLibrary} /> : null}

        {layoutFor ? (
          <PagePicker
            title="Change this page's layout"
            intro="This page only. Its sections keep everything they hold — the pictures, the words, the numbers — and take the layout's widths, columns and text placement. A layout with more slots than the page has sections fills it out with empty ones; extra sections keep what they had. Every other page is left exactly as it is."
            onPick={(template) => {
              updatePortfolio((current) => relayoutPage(current, layoutFor, template));
              setLayoutFor(null);
              toast.success(`${template.name} applied — the other pages are untouched.`);
            }}
          />
        ) : null}

        {pagePickerProjectId ? (
          <PagePicker
            onPick={(template) => addPageFromTemplate(pagePickerProjectId, template)}
            onBlank={() => {
              addEmptyPage(pagePickerProjectId);
              setPagePickerProjectId(null);
            }}
          />
        ) : null}


        {doc ? (
          <PortfolioWorkspace
            pages={pages}
            library={mediaLibrary}
            footer={{
              title: doc.title,
              projects: doc.projects.map((project) => project.name),
              pageCount: pages.length,
              navigable: doc.navigable,
            }}
            selectedBlockId={selectedBlockId}
            draggingAssetId={draggingAssetId}
            onSelectBlock={(blockId) => {
              setSelectedBlockId(blockId);
              if (blockId) setSelectedPadId(null);
              // The panel acts on the page you just clicked into, so a section's own page becomes the
              // panel's target as soon as it is selected.
              if (blockId) {
                const page = pages.find((entry) => entry.blocks.some((block) => block.id === blockId));
                if (page) setActivePageId(page.id);
              }
            }}
            onReorder={(blockId, targetIndex) =>
              updatePortfolio((current) => moveBlockTo(current, blockId, targetIndex))
            }
            onMovePage={(pageId, targetPageId, position) => {
              // The page id is `${projectId}:${slideId}` (and owns-pages kinds add more after that),
              // so the section id is always the second part.
              const slideId = pageId.split(":")[1];
              const targetSlideId = targetPageId.split(":")[1];
              if (!slideId || !targetSlideId) return;
              updatePortfolio((current) =>
                moveSlideTo(current, slideId, targetSlideId, position),
              );
              toast.success(position === "before" ? "Moved before that page." : "Moved after that page.");
            }}
            onPreviewPage={(pageNumber) => {
              setPreviewPage(pageNumber);
              setPreviewOpen(true);
            }}
            onActivatePage={setActivePageId}
            onDropAsset={dropAssetOn}
            edits={edits}
            selectedPadId={selectedPadId}
            onSelectPad={(padId) => {
              setSelectedPadId(padId);
              // One tool at a time: picking a pad puts the section panel away, so the page is never
              // showing two different sets of controls for two different things.
              if (padId) setSelectedBlockId(null);
              if (padId) {
                const page = pages.find((entry) => (entry.pads ?? []).some((pad) => pad.id === padId));
                if (page) setActivePageId(page.id);
              }
            }}
          />
        ) : null}

        {doc && previewOpen ? (
          <div ref={previewRef}>
            <PortfolioPdfPreview portfolio={doc} library={mediaLibrary} page={previewPage} />
          </div>
        ) : null}

        {!doc ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            A portfolio is a separate document from your resume: it shows the work rather than
            describing it. Start one blank, or pick a template below and the store&apos;s assets fill
            its slots.
          </p>
        ) : null}

        {doc ? (
          <details className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-semibold">Pages and sections, as a list</span>
              <span className="text-xs text-muted-foreground">
                rename, reorder, delete, add to a page, add a page
              </span>
            </summary>
            <div className="space-y-3 border-t p-3">
        {doc
          ? doc.projects.map((project, projectIndex) => (
              <section
                key={project.id}
                onDragOver={(event) => {
                  // Only a project being dragged makes this a target; the store's asset drag must
                  // fall through to the pages.
                  if (!dragProjectId || dragProjectId === project.id) return;
                  event.preventDefault();
                  setOverProjectIndex(projectIndex);
                }}
                onDrop={(event) => {
                  if (!dragProjectId) return;
                  event.preventDefault();
                  updatePortfolio((current) => moveProjectTo(current, dragProjectId, projectIndex));
                  setDragProjectId(null);
                  setOverProjectIndex(null);
                }}
                className={cn(
                  "rounded-lg border bg-card p-3",
                  overProjectIndex === projectIndex && "outline outline-2 outline-dashed outline-primary",
                  dragProjectId === project.id && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {/*
                    The drag handle is a handle rather than the whole header: dragging from an input
                    starts a text selection, and losing a rename to a stray drag is worse than the
                    extra click.
                  */}
                  <span
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer?.setData("text/plain", project.id);
                      setDragProjectId(project.id);
                    }}
                    onDragEnd={() => {
                      setDragProjectId(null);
                      setOverProjectIndex(null);
                    }}
                    title="Drag to move this project up or down the portfolio"
                    className="flex cursor-grab items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary active:cursor-grabbing"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                    drag
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-xs"
                    disabled={projectIndex === 0}
                    title="Move this project up"
                    onClick={() =>
                      updatePortfolio((current) => moveProject(current, project.id, -1))
                    }
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 text-xs"
                    disabled={projectIndex === doc.projects.length - 1}
                    title="Move this project down"
                    onClick={() => updatePortfolio((current) => moveProject(current, project.id, 1))}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <input
                    value={project.name}
                    onChange={(event) =>
                      updatePortfolio((current) => renameProject(current, project.id, event.target.value))
                    }
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent text-sm font-semibold hover:border-border focus:border-primary focus:outline-none"
                    aria-label="Project name"
                  />
                  <span className="text-xs text-muted-foreground">
                    {project.slides.length} section{project.slides.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    title="Add a page to this project — from a layout, or empty"
                    onClick={() =>
                      setPagePickerProjectId((open) => (open === project.id ? null : project.id))
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    New page
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    title="Delete this project and its pages"
                    onClick={() => {
                      updatePortfolio((current) => removeProject(current, project.id));
                      toast.success(`Removed ${project.name}.`);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete project
                  </Button>
                </div>

                {project.slides.map((slide, index) => (
                  <SectionRow
                    key={slide.id}
                    slide={slide}
                    library={mediaLibrary}
                    selectedBlockId={selectedBlockId}
                    isFirst={index === 0}
                    isLast={index === project.slides.length - 1}
                    onSelect={setSelectedBlockId}
                    onChoose={(blockId, presentation) => patchBlock(blockId, { presentation })}
                    onAddSection={(presentation) => addNewPage(project.id, presentation)}
                    onAddBlock={(presentation) => addBlockToPage(project.id, slide.id, presentation)}
                    onMoveBlock={(blockId, direction) =>
                      updatePortfolio((current) => moveBlock(current, blockId, direction))
                    }
                    onRename={(title) =>
                      updatePortfolio((current) => renameSlide(current, slide.id, title))
                    }
                    onMove={(direction) =>
                      updatePortfolio((current) => moveSlide(current, slide.id, direction))
                    }
                    onDelete={() => {
                      updatePortfolio((current) => removeSlide(current, slide.id));
                      toast.success(`Removed the ${slide.title} section.`);
                    }}
                    onUnplace={(blockId, assetId) =>
                      updatePortfolio((current) => unplaceAsset(current, blockId, assetId))
                    }
                    onDeleteBlock={(blockId) =>
                      updatePortfolio((current) => removeBlock(current, blockId))
                    }
                  />
                ))}
              </section>
            ))
          : null}
            </div>
          </details>
        ) : null}
      </div>

      <MediaLibraryPanel
        library={mediaLibrary}
        onChange={updateMediaLibrary}
        onPlace={placeAsset}
        onDragAsset={setDraggingAssetId}
        targetLabel={activeBlock ? activeBlock.title ?? "the selected section" : undefined}
        selectionText={highlighted || undefined}
        onSaveSelection={keepHighlighted}
      />
    </main>
  );
}

/** An empty project with one section, so there is always somewhere to put the next thing. */
function newProject() {
  const stamp = Date.now().toString(36);
  return {
    id: `pr-${stamp}`,
    name: "New project",
    slides: [{ id: `sl-${stamp}`, title: "Overview", blocks: [] }],
  };
}

/**
 * One section: its own title and controls, then what it holds and the menu of ways to show it.
 *
 * The controls sit on the section rather than behind a settings panel because arranging — moving a
 * section, deleting one that is not working, unplacing a frame — is what happens most often while
 * composing, and the menu of presentations is what happens next.
 */
function SectionRow({
  slide,
  library,
  selectedBlockId,
  isFirst,
  isLast,
  onSelect,
  onChoose,
  onAddSection,
  onAddBlock,
  onMoveBlock,
  onRename,
  onMove,
  onDelete,
  onUnplace,
  onDeleteBlock,
}: {
  slide: PortfolioSlide;
  library: MediaLibrary;
  selectedBlockId: string | null;
  isFirst: boolean;
  isLast: boolean;
  onSelect: (blockId: string | null) => void;
  /** Applies a presentation option to a section. */
  onChoose: (blockId: string, presentation: PresentationId) => void;
  onAddSection: (presentation: PresentationId) => void;
  /** Adds another block to this page, so a page can hold several things. */
  onAddBlock: (presentation: PresentationId) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
  onRename: (title: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onUnplace: (blockId: string, assetId: string) => void;
  onDeleteBlock: (blockId: string) => void;
}) {
  return (
    <div className="mt-2 rounded-md border p-2">
      <div className="flex items-center gap-1">
        <input
          value={slide.title}
          onChange={(event) => onRename(event.target.value)}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent text-xs font-medium hover:border-border focus:border-primary focus:outline-none"
          aria-label="Section title"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-6 w-6 p-0"
          disabled={isFirst}
          title="Move this page up"
          onClick={() => onMove(-1)}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 w-6 p-0"
          disabled={isLast}
          title="Move this page down"
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
          title="Delete this section and its page"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {slide.blocks.map((block, blockIndex) => {
        const content = sectionContent(block, library);
        const menu = optionAvailability(content);
        return (
          <div
            key={block.id}
            onClick={() => onSelect(block.id === selectedBlockId ? null : block.id)}
            className={cn(
              "cursor-pointer space-y-1.5 rounded-md border p-2",
              block.id === selectedBlockId ? "border-primary ring-1 ring-primary" : "",
            )}
          >
            <div className="flex flex-wrap items-center gap-1">
              {(block.assetIds ?? []).map((id) => (
                <span
                  key={id}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {assetById(library, id)?.name ?? "(missing asset)"}
                  <button
                    type="button"
                    title="Remove from this section"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      onUnplace(block.id, id);
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {(block.assetIds ?? []).length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Nothing placed yet — select this section and use Place in the store.
                </span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0"
                disabled={blockIndex === 0}
                title="Move this section one place earlier on the page"
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveBlock(block.id, -1);
                }}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 w-6 p-0"
                disabled={blockIndex === slide.blocks.length - 1}
                title="Move this section one place later on the page"
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveBlock(block.id, 1);
                }}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                title="Delete this block"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteBlock(block.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-1" onClick={(event) => event.stopPropagation()}>
              {menu.map((entry) => (
                <button
                  key={entry.option.id}
                  type="button"
                  disabled={!entry.available}
                  title={entry.available ? entry.option.caveat : entry.reason ?? ""}
                  onClick={() => {
                    onSelect(block.id);
                    onChoose(block.id, entry.option.id);
                  }}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs",
                    block.presentation === entry.option.id
                      ? "border-primary bg-primary/10 text-primary"
                      : entry.available
                        ? "text-muted-foreground hover:border-primary"
                        : "cursor-not-allowed text-muted-foreground/50 line-through",
                  )}
                >
                  {entry.option.label}
                  {entry.option.ownsPages ? " +pages" : ""}
                </button>
              ))}
            </div>

            {block.presentation ? <PresentationNote id={block.presentation} /> : null}
          </div>
        );
      })}

      <div className="mt-1.5 space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-medium text-muted-foreground">Add to this page:</span>
          {PRESENTATION_OPTIONS.slice(0, 6).map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              title={`${option.summary} — goes on this page, under what is already here`}
              onClick={() => onAddBlock(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Or start a new page:</span>
          {PRESENTATION_OPTIONS.slice(0, 4).map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              title={`${option.summary} — on a page of its own`}
              onClick={() => onAddSection(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** What a section currently holds, which is what decides the menu it is offered. */
function sectionContent(block: PortfolioBlock, library: MediaLibrary): SectionContent {
  const placed = block.assetIds?.length ?? 0;
  return (block.assetIds ?? []).reduce<SectionContent>(
    (content, id) => {
      const asset = assetById(library, id);
      if (!asset) return content;
      return {
        images: content.images + asset.images.length,
        hasPair: content.hasPair || Boolean(asset.pair),
        hasText: content.hasText || Boolean(asset.text),
        hasMetric: content.hasMetric || Boolean(asset.metric),
        hasUrl: content.hasUrl || Boolean(asset.link),
      };
    },
    {
      // A section holding loose images with no assets still counts them, or the menu would
      // offer nothing to a section that is already full of pictures.
      images: placed ? 0 : block.images.length,
      hasPair: false,
      hasText: Boolean(block.body),
      hasMetric: Boolean(block.metrics?.length),
      hasUrl: Boolean(block.videoUrl),
    },
  );
}

/** The caveat and support level for the chosen option, so the promise stays visible. */
function PresentationNote({ id }: { id: PresentationId }) {
  const option = PRESENTATION_OPTIONS.find((candidate) => candidate.id === id);
  if (!option) return null;
  const capability = PORTFOLIO_CAPABILITIES.find((entry) => entry.feature === option.capability);
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      {option.summary}
      {capability ? (
        <>
          {" "}
          <span className="rounded bg-muted px-1">{SUPPORT_LABELS[capability.level]}</span>{" "}
          {capability.caveat}
        </>
      ) : null}
    </p>
  );
}

/** The page layouts, as a menu: what shape a page starts in, or becomes. */
function PagePicker({
  onPick,
  onBlank,
  title = "New page",
  intro = "A page layout is a starting shape, not a straitjacket: every section it makes is an ordinary section, so you can move it, resize it, re-present it or delete it straight afterwards.",
}: {
  onPick: (template: PageTemplate) => void;
  onBlank?: () => void;
  title?: string;
  intro?: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{intro}</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {PAGE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onPick(template)}
            className="rounded-md border p-2 text-left hover:border-primary"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
              {template.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{template.summary}</span>
            <TemplateDiagram template={template} />
            <span className="mt-1 block text-[11px] italic text-muted-foreground">
              {template.useWhen}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onBlank}
          className="rounded-md border border-dashed p-2 text-left hover:border-primary"
        >
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Plus className="h-3.5 w-3.5 text-primary" />
            Empty page
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Nothing on it, to arrange from scratch — add sections with{" "}
            <em>+ add a section to this page…</em>.
          </span>
        </button>
      </div>
    </div>
  );
}

/** The layout as blocks, in the widths the page will actually use. */
function TemplateDiagram({ template }: { template: PageTemplate }) {
  return (
    <span className="mt-1.5 flex flex-col gap-0.5">
      {pageTemplateRows(template).map((row, index) => (
        <span key={index} className="flex gap-0.5">
          {row.map((span, position) => (
            <span
              key={position}
              className="h-2.5 rounded-[1px] bg-primary/30"
              style={{ width: `${(span / 12) * 100}%` }}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

/** The template menu: pick a structure and the store's assets fill its slots in order. */
function TemplatePicker({
  onPick,
  library,
}: {
  onPick: (templateId: string) => void;
  library: MediaLibrary;
}) {
  const waiting = {
    images: library.assets.filter((asset) => asset.images.length > 0).length,
    captions: library.assets.filter((asset) => Boolean(asset.text)).length,
    numbers: library.assets.filter((asset) => Boolean(asset.metric)).length,
  };
  const any = waiting.images || waiting.captions || waiting.numbers;

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        A template is a structure, not a picture: it decides how many sections there are and what
        each one shows, then fills them from the store in the order things were imported.
        {any
          ? ` ${waiting.images} images, ${waiting.captions} captions and ${waiting.numbers} numbers are waiting.`
          : " The store is empty, so the sections will start empty for you to place into."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {PORTFOLIO_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onPick(template.id)}
            className="rounded-md border p-2 text-left hover:border-primary"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
              {template.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{template.summary}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {templatePreview(template)}
            </span>
            <span className="mt-1 block text-[11px] italic text-muted-foreground">
              {template.sections.map((slot) => slot.title).join(" · ")}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Pick one and you can still move, rename, delete and re-present every section afterwards —
        the template only chooses the starting shape.
      </p>
    </div>
  );
}
