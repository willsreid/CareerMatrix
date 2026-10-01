"use client";

import * as React from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/WorkspaceProvider";
import { createMediaLibrary } from "@/lib/mediaLibrary";
import type { ImportResult } from "@/lib/storage";

/**
 * Applies a parsed import — a bare Master Profile, or a whole backup bundle.
 *
 * Extracted so the two doors into the app agree about what "restore" means: the JSON box in the data card, and a
 * folder of files opened from disk. Both call this, so a bundle that arrives by paste and one that arrives by
 * folder produce exactly the same workspace, down to the toast.
 */
export function useApplyImport(): (result: ImportResult) => void {
  const {
    replaceProfile,
    replaceApplications,
    patchDraft,
    replacePortfolio,
    updateMediaLibrary,
  } = useWorkspace();

  return React.useCallback(
    (result: ImportResult) => {
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.kind === "profile") {
        replaceProfile(result.profile);
        toast.success("Master Profile replaced.");
        return;
      }
      replaceProfile(result.bundle.profile);
      replaceApplications(result.bundle.applications);
      patchDraft(result.bundle.draft);
      // The portfolio and its store arrived after the first release, so they may be absent from an older
      // bundle; restoring null means "no portfolio yet", which is a state the page shows.
      replacePortfolio(result.bundle.portfolio ?? null);
      updateMediaLibrary(() => result.bundle.mediaLibrary ?? createMediaLibrary());
      const assets = result.bundle.mediaLibrary?.assets.length ?? 0;
      toast.success(
        `Full backup restored: profile, draft, applications, portfolio${assets ? ` and ${assets} stored assets` : ""}.`,
      );
    },
    [patchDraft, replaceApplications, replacePortfolio, replaceProfile, updateMediaLibrary],
  );
}
