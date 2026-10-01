"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";

import { PipelineBoard } from "@/components/PipelineBoard";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Card, CardContent } from "@/components/ui/card";

/**
 * How the search is going.
 *
 * A page of its own rather than another panel on the saved list: that list is where you work on one application
 * at a time, and this is the opposite view — every application at once, as counts. Keeping them apart is what
 * stops the two competing for the same space.
 *
 * The board itself takes the records as a prop, so the suite can render it with a fixture; this shell only
 * supplies them from the workspace.
 */
export default function PipelinePage() {
  const { applications, ready } = useWorkspace();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <TrendingUp className="h-4 w-4" aria-hidden /> How the search is going
        </h1>
        <p className="text-xs text-muted-foreground">
          Counts drawn from your own records — what went out, who answered, what has gone quiet, and whether the
          matching is holding up. Where a number cannot be known it says so rather than estimating one.
        </p>
      </header>

      {ready ? (
        <PipelineBoard applications={applications} />
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-xs text-muted-foreground">
            Loading the pipeline…
          </CardContent>
        </Card>
      )}
    </div>
  );
}
