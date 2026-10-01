"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A card that collapses.
 *
 * Built on native `<details>`/`<summary>` so it is keyboard accessible, needs no
 * state, and survives React re-renders without an `open` prop fighting the user.
 * The summary row stays visible while collapsed and carries the headline numbers,
 * so the panels under the sheet stay useful without eating the column.
 */
export function CollapsibleCard({
  title,
  icon: Icon,
  meta,
  description,
  defaultOpen = false,
  className,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Badges shown on the always-visible summary row. */
  meta?: React.ReactNode;
  description?: string;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group rounded-lg border bg-card text-card-foreground shadow-sm print-hide",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-primary" /> : null}
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5">{meta}</span>
      </summary>
      <div className="space-y-3 border-t px-3 pb-3 pt-3">
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        {children}
      </div>
    </details>
  );
}
