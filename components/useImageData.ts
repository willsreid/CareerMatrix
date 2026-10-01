"use client";

import * as React from "react";

import { blobToDataUrl, imageStore } from "@/lib/imageStore";

/**
 * Pulls the pixels for a set of image ids out of the store, caching as it goes.
 *
 * A hook rather than a helper in either component, because the workspace and the PDF preview both
 * need it and they must agree: the preview is only a preview if it draws the same images, and two
 * copies of this loader is how one of them quietly stops reading something the other shows.
 *
 * Keyed by the ids rather than by the array, so a new array holding the same ids does not re-run the
 * effect — which would read every blob again on every render of the pages.
 */
export function useImageData(ids: string[]): Record<string, string> {
  const [data, setData] = React.useState<Record<string, string>>({});
  const key = ids.join(",");

  React.useEffect(() => {
    let cancelled = false;
    const wanted = key ? key.split(",") : [];
    const missing = wanted.filter((id) => id && !data[id]);
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (id) => {
        const stored = await imageStore.get(id);
        return stored ? ([id, await blobToDataUrl(stored.blob)] as const) : null;
      }),
    ).then((entries) => {
      if (cancelled) return;
      const found = Object.fromEntries(entries.filter(Boolean) as (readonly [string, string])[]);
      if (Object.keys(found).length) setData((current) => ({ ...current, ...found }));
    });
    return () => {
      cancelled = true;
    };
  }, [key, data]);

  return data;
}
