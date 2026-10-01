"use client";

import * as React from "react";
import {
  Clipboard as ClipboardIcon,
  ImagePlus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLIPBOARD_KINDS,
  MEDIA_KIND_LABELS,
  addAsset,
  filterAssets,
  imageAsset,
  libraryStats,
  libraryTags,
  removeAsset,
  textAsset,
  updateAsset,
  type MediaAsset,
  type MediaAssetKind,
  type MediaLibrary,
} from "@/lib/mediaLibrary";
import { imageStore, blobToDataUrl } from "@/lib/imageStore";
import { importImageFile } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * The clipboard: pictures and text, and nothing else.
 *
 * It is meant to behave like a clipboard — you put something in it, you take it out — so it holds exactly
 * what the author put there: **images** they imported, and **text modules** they typed, pasted, or saved off
 * a page. Nothing appears because the app thought it might be useful, which is why the panel no longer offers
 * to make before/after pairs, metrics, links or saved sections. A number or a link belongs to the section it
 * is set on (the link field in the panel, the numbers typed on the page), and a whole section is rearranged
 * by dragging it rather than by saving a copy of it.
 *
 * Two ways in, both explicit:
 *
 *  - **Import images** — files from this machine, downscaled and kept in the browser's own store.
 *  - **Add snippet** — a field you paste into, saved as a text module; or **save the words you highlighted**
 *    on a page, which is how a paragraph you are proud of becomes reusable the moment you notice it.
 *
 * Once in, either kind is dragged onto a page: a picture lands in the frame you drop it on, and a text module
 * joins that section's words (or becomes a text section of its own on empty page space).
 */
export function MediaLibraryPanel({
  library,
  onChange,
  onPlace,
  targetLabel,
  onDragAsset,
  selectionText,
  onSaveSelection,
}: {
  library: MediaLibrary;
  onChange: (updater: (library: MediaLibrary) => MediaLibrary) => void;
  /** Places an item in whichever section is selected, for people who would rather press than drag. */
  onPlace: (asset: MediaAsset) => void;
  /** What the place button will act on, so the panel can say it. */
  targetLabel?: string;
  /** Reports the asset being dragged into the pages, or null when the drag ends. */
  onDragAsset?: (assetId: string | null) => void;
  /** The words highlighted on a page, so they can be kept as a text module. */
  selectionText?: string;
  /** Saves those highlighted words to the clipboard. */
  onSaveSelection?: () => void;
}) {
  const [open, setOpen] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<MediaAssetKind | "all">("all");
  const [tag, setTag] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [snippetOpen, setSnippetOpen] = React.useState(false);
  const [draftText, setDraftText] = React.useState("");
  const [notes, setNotes] = React.useState<string[]>([]);
  const [previews, setPreviews] = React.useState<Record<string, string>>({});

  const stats = libraryStats(library);
  const tags = libraryTags(library);
  const visible = filterAssets(library, { kind, tag, query });
  /** What is in the clipboard: the two kinds it holds, and only the ones with something in them. */
  const kinds = CLIPBOARD_KINDS.filter((entry) => visible.some((asset) => asset.kind === entry));
  const items = stats.byKind.image + stats.byKind.text;

  /* Thumbnails come out of IndexedDB on demand and are cached, because reading a blob per
     render would make the list flicker while typing in the search box. Data URLs rather than
     object URLs, so nothing has to be revoked when a thumbnail scrolls out of relevance. */
  React.useEffect(() => {
    let cancelled = false;
    const missing = library.assets
      .flatMap((asset) => asset.images)
      .filter((image) => !previews[image.id])
      .slice(0, 12);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (image) => {
        const stored = await imageStore.get(image.id);
        if (!stored) return null;
        return [image.id, await blobToDataUrl(stored.blob)] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next = Object.fromEntries(entries.filter(Boolean) as (readonly [string, string])[]);
      if (Object.keys(next).length) setPreviews((current) => ({ ...current, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [library.assets, previews]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const collected: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const imported = await importImageFile(file);
        collected.push(...imported.notes);
        // One asset per image, tagged with the section it was imported for when there is one.
        onChange((current) => addAsset(current, imageAsset(imported.ref, { tags: [] })));
      }
    } catch {
      collected.push("That file could not be read as an image.");
    }
    setNotes(collected);
    setBusy(false);
    toast.success(
      `Added ${Array.from(files).length} image${files.length === 1 ? "" : "s"} to the clipboard.`,
    );
  };

  const saveSnippet = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    onChange((current) => addAsset(current, textAsset(clean, nameFrom(clean))));
    setDraftText("");
    setSnippetOpen(false);
    toast.success("Saved as a text module.");
  };

  /**
   * Reads the system clipboard into the snippet field.
   *
   * The point of the button: whatever you copied anywhere — a paragraph from a document, a line from a site —
   * arrives as material you can drop onto a page. The browser asks permission the first time, and a refusal is
   * reported rather than swallowed.
   */
  const pasteIntoDraft = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast("Nothing to paste — the system clipboard has no text in it.");
        return;
      }
      setDraftText((current) => (current ? `${current}\n\n${text}` : text));
      setSnippetOpen(true);
    } catch {
      toast.error("The browser would not let this page read the clipboard.");
    }
  };

  if (!open) {
    // The same rail on the other side: closed, it is a tab, and the pages get the width back.
    return (
      <aside className="print-hide sticky top-4 z-30 flex w-9 shrink-0 flex-col items-center gap-2 self-start rounded-xl border bg-card py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setOpen(true)}
          title="Show the clipboard"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">
          clipboard
        </span>
        {items ? (
          <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{items}</span>
        ) : null}
      </aside>
    );
  }

  return (
    // Pinned beside the pages, above them, scrolling inside itself — the same three rules as the panel on the
    // left, because a rail that floats over the work or slides out of reach reads as a broken panel.
    <aside className="print-hide sticky top-4 z-30 max-h-[calc(100vh-2rem)] w-80 shrink-0 self-start overflow-y-auto rounded-lg border bg-card text-card-foreground shadow-sm">
      <header className="flex items-center gap-2 border-b p-3">
        <ClipboardIcon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Clipboard</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {stats.byKind.image} image{stats.byKind.image === 1 ? "" : "s"} · {stats.byKind.text} text
          {stats.byKind.text === 1 ? "" : "s"}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} title="Collapse">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </header>

      <div className="space-y-3 p-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Images and text modules. Drag either onto a page — a picture lands in the frame you drop it on, a
          text module joins that section&apos;s words.
        </p>

        {/* ------------------------------ two ways in ----------------------------- */}
        <div className="flex gap-2">
          <label
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-2 text-xs",
              busy ? "opacity-60" : "hover:border-primary hover:text-primary",
            )}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {busy ? "Importing…" : "Import images"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </label>
          <button
            type="button"
            onClick={() => setSnippetOpen((value) => !value)}
            title="Type or paste a paragraph and keep it as a text module"
            className="flex items-center justify-center gap-1 rounded-md border border-dashed px-3 text-xs hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            Add snippet
          </button>
        </div>

        {snippetOpen ? (
          <div className="space-y-2 rounded-md border p-2">
            <textarea
              autoFocus
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              placeholder="Paste or type a paragraph, a caption, a quote…"
              className="h-24 w-full resize-none rounded-md border bg-background p-2 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={!draftText.trim()}
                onClick={() => saveSnippet(draftText)}
              >
                Save snippet
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                title="Read the text on your system clipboard into this field"
                onClick={() => void pasteIntoDraft()}
              >
                <ClipboardIcon className="mr-1 h-3 w-3" />
                Paste
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 text-xs text-muted-foreground"
                onClick={() => setSnippetOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {/* ------------------------------ off a page ----------------------------- */}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!selectionText || !onSaveSelection}
          title={
            selectionText
              ? "Keep the words you highlighted on the page as a text module"
              : "Highlight some words on a page, then press this to keep them"
          }
          onClick={() => onSaveSelection?.()}
        >
          <Type className="mr-1.5 h-3.5 w-3.5" />
          {selectionText
            ? `Save highlighted text (${wordCount(selectionText)} words)`
            : "Save highlighted text"}
        </Button>

        {notes.length ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {notes.slice(0, 3).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}

        {items === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
            Nothing in the clipboard yet. Import a picture, add a snippet, or highlight words on a page and
            save them here — whatever you put in is what comes out.
          </p>
        ) : (
          <>
            {/* ------------------------------ find it ------------------------------ */}
            <Input
              value={query}
              placeholder="Search the clipboard…"
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 text-xs"
            />

            <div className="flex flex-wrap gap-1">
              {(["all", ...CLIPBOARD_KINDS] as (MediaAssetKind | "all")[])
                .filter((option) => option === "all" || stats.byKind[option] > 0)
                .map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKind(option)}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs",
                      kind === option
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    {option === "all" ? "All" : MEDIA_KIND_LABELS[option]}{" "}
                    {option === "all" ? items : stats.byKind[option]}
                  </button>
                ))}
            </div>

            {tags.length ? (
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 8).map((entry) => (
                  <button
                    key={entry.tag}
                    type="button"
                    onClick={() => setTag(tag === entry.tag ? null : entry.tag)}
                    className={cn(
                      "rounded-full bg-muted px-2 py-0.5 text-xs",
                      tag === entry.tag ? "ring-1 ring-primary" : "",
                    )}
                  >
                    #{entry.tag} {entry.count}
                  </button>
                ))}
              </div>
            ) : null}

            {/* ------------------------------- the clipboard ------------------------ */}
            {targetLabel ? (
              <p className="text-xs text-muted-foreground">
                Place adds to <span className="font-medium text-foreground">{targetLabel}</span>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Select a section to place into.</p>
            )}

            {kinds.map((group) => {
              const groupAssets = visible.filter((asset) => asset.kind === group);
              return (
                <section key={group} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{MEDIA_KIND_LABELS[group]}</p>
                  {groupAssets.map((asset) => (
                    <div
                      key={asset.id}
                      draggable
                      onDragStart={(event) => {
                        // Both channels: the drag payload for browsers that keep custom types, and React state
                        // for the drop zones, which is the one this app actually reads.
                        event.dataTransfer?.setData("text/plain", asset.id);
                        onDragAsset?.(asset.id);
                      }}
                      onDragEnd={() => onDragAsset?.(null)}
                      className="flex cursor-grab items-start gap-2 rounded-md border p-1.5 active:cursor-grabbing"
                      title="Drag onto a page to place it"
                    >
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                        {asset.images[0] && previews[asset.images[0].id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previews[asset.images[0].id]}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Type className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium" title={asset.name}>
                          {asset.name}
                        </p>
                        {asset.text ? (
                          <p className="line-clamp-3 text-xs text-muted-foreground">{asset.text}</p>
                        ) : null}
                        {asset.images.length ? (
                          // The line that lands under this photograph wherever it is placed in a cards layout,
                          // so a description is written once, here, instead of per page.
                          <Input
                            value={asset.description ?? ""}
                            placeholder="Description for cards…"
                            className="mt-1 h-6 text-xs"
                            onChange={(event) =>
                              onChange((current) =>
                                updateAsset(current, asset.id, { description: event.target.value }),
                              )
                            }
                          />
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {asset.text ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              title="Copy this text to your system clipboard"
                              onClick={() => {
                                void navigator.clipboard
                                  .writeText(asset.text ?? "")
                                  .then(() => toast.success("Copied."))
                                  .catch(() =>
                                    toast.error("The browser would not let this page write to the clipboard."),
                                  );
                              }}
                            >
                              <ClipboardIcon className="mr-1 h-3 w-3" />
                              copy
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            title={
                              targetLabel
                                ? `Add to ${targetLabel}`
                                : asset.kind === "text"
                                  ? "Add to the selected section's words"
                                  : "Add to the selected section's frames"
                            }
                            onClick={() => onPlace(asset)}
                          >
                            Place
                          </Button>
                          <button
                            type="button"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            title="Remove from the clipboard"
                            onClick={() => onChange((current) => removeAsset(current, asset.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}

            {/* Kinds the clipboard no longer deals in can still be in the store, because documents resolve
                them. Saying so is better than hiding them: a section printing a number is not a mystery if
                the panel admits where numbers come from. */}
            {library.assets.some((asset) => !CLIPBOARD_KINDS.includes(asset.kind)) ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                This store also holds older items — pairs, numbers, links — from before the clipboard was
                images and text. Sections that use them still print them.
              </p>
            ) : null}
          </>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Pixels live in the browser&apos;s own image store and nothing leaves this machine; one image can be
          placed in as many sections as you like.
        </p>
      </div>
    </aside>
  );
}

/** How many words are in a snippet, for the button that says what it will save. */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * A module's name, from its first words: enough to find it by later.
 *
 * Named from the line rather than the whole paragraph, so a snippet that starts with a heading keeps the
 * heading as its handle in the list.
 */
function nameFrom(text: string): string {
  const line = text.trim().split(/\n/)[0] ?? "";
  return line.length > 48 ? `${line.slice(0, 45)}…` : line || "Snippet";
}
