"use client";

import * as React from "react";
import { pdf } from "@react-pdf/renderer";
import { Check, Download, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import { buildPortfolioPdfDocument } from "@/components/PortfolioPdfDocument";
import { Button } from "@/components/ui/button";
import { planImageIds, planPortfolio } from "@/lib/portfolio";
import type { Portfolio } from "@/lib/portfolioTypes";
import { bytesToString, stringToBytes, withPageTransitions } from "@/lib/pdfPatch";
import type { MediaLibrary } from "@/lib/mediaLibrary";
import { useImageData } from "@/components/useImageData";
import { cn } from "@/lib/utils";

/**
 * The real PDF, rendered in the browser, live.
 *
 * Not a mock-up and not a second renderer: this calls `pdf()` on the exact document component the
 * export writes, so what you see here is the file — same fonts, same page breaks, same page count.
 * It has to be debounced, because rendering a PDF costs tens of milliseconds and re-running it on
 * every keystroke is the difference between a preview and a stutter.
 *
 * The bytes shown are the bytes the download writes, down to the `/Trans` patch, so nobody has to
 * take it on trust that the file matches the preview.
 */
export function PortfolioPdfPreview({
  portfolio,
  library,
  page,
  className,
}: {
  portfolio: Portfolio;
  library: MediaLibrary;
  /** Jump the viewer to this page number when it changes. */
  page?: number;
  className?: string;
}) {
  const [images, setImages] = React.useState<Record<string, string>>({});
  const [url, setUrl] = React.useState<string | null>(null);
  const [size, setSize] = React.useState<number | null>(null);
  const [state, setState] = React.useState<"rendering" | "ready" | "failed">("rendering");
  const [generation, setGeneration] = React.useState(0);

  /**
   * Every image the *file* will draw, taken from the plan with the store.
   *
   * The same function the workspace uses on the plan it draws, so the two surfaces agree by construction: a
   * section holding an asset id has no pixels of its own until it is resolved with the library, and this is
   * the list the preview fetches pixels for.
   */
  const plan = React.useMemo(() => planPortfolio(portfolio, library), [portfolio, library]);
  const needed = React.useMemo(() => planImageIds(plan), [plan]);
  const data = useImageData(needed);
  React.useEffect(() => setImages(data), [data]);

  /**
   * The change signature. Both stores stamp `updatedAt` on every write, which is exactly the
   * granularity we want: any edit re-renders, and a re-render that changes nothing does not.
   */
  const signature = `${portfolio.updatedAt}|${library.updatedAt}|${Object.keys(images).length}|${generation}`;

  React.useEffect(() => {
    let cancelled = false;
    setState("rendering");
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const blob = await pdf(
            buildPortfolioPdfDocument({ portfolio, images, library }),
          ).toBlob();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          // Patch the transitions into the real bytes, the same way the export does: the preview is
          // the file, so it must not be a diagram of the file.
          const text = bytesToString(bytes);
          const patched = portfolio.transitions ? withPageTransitions(text) : text;
          const finalBlob = new Blob([stringToBytes(patched) as unknown as BlobPart], {
            type: "application/pdf",
          });
          if (cancelled) return;
          setUrl((previous) => {
            if (previous) URL.revokeObjectURL(previous);
            return URL.createObjectURL(finalBlob);
          });
          setSize(finalBlob.size);
          setState("ready");
        } catch (error) {
          if (cancelled) return;
          console.error("Could not render the portfolio preview", error);
          setState("failed");
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `signature` is the whole dependency on purpose: re-rendering on a new object identity would
    // make this loop, which is the mistake the store subscription already taught us once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  /** Writes the file. The bytes are the ones already on screen, patched the same way. */
  const download = () => {
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `${portfolio.title.replace(/[^\w\s-]+/g, "").trim() || "portfolio"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className={cn("rounded-lg border bg-card p-3 text-card-foreground", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">The PDF, live</h3>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {state === "rendering" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              rendering…
            </>
          ) : state === "ready" ? (
            <>
              <Check className="h-3.5 w-3.5 text-primary" />
              {size ? `${Math.round(size / 1024)} KB` : ""} · {generation} render
              {generation === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <TriangleAlert className="h-3.5 w-3.5 text-destructive" />
              could not render — your arrangement is still saved
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            title="Render it again now"
            onClick={() => setGeneration((count) => count + 1)}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Re-render
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={!url}
            title="Write this exact file to your downloads"
            onClick={download}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>
      {url ? (
        <iframe
          // The key forces the viewer to reload when the bytes change; the `#page` fragment is how a
          // PDF viewer is asked to open at a page, which is what makes the per-page "see it printed"
          // link land somewhere useful.
          key={`${generation}-${page ?? 1}`}
          src={`${url}#page=${page ?? 1}&view=FitH&toolbar=0`}
          title="The exported PDF"
          className="h-[68vh] w-full rounded border bg-white"
        />
      ) : (
        <p className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
          {state === "failed"
            ? "The preview could not be rendered in this browser. The download uses the same pipeline, so if this fails the download will too."
            : "Rendering the document…"}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        This is the document the export writes, rendered by the same component and patched the same
        way — not a second preview that could drift from it. The page cards are the arrangement: they
        are HTML, so they can be dragged and clicked, and they are proportional rather than
        pixel-identical. When the two disagree about a millimetre, this is the truth.
      </p>
    </div>
  );
}
