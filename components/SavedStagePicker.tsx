"use client";

import { Button } from "@/components/ui/button";
import type { ApplicationStage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Inline stage picker. A row of small buttons rather than a Select: the stages
 * are few, always visible, and one click away during a phone screen.
 */
export function SelectlessStagePicker({
  value,
  onChange,
  stages,
}: {
  value: ApplicationStage;
  onChange: (stage: ApplicationStage) => void;
  stages: ApplicationStage[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Pipeline</span>
      {stages.map((stage) => (
        <Button
          key={stage}
          size="sm"
          variant={value === stage ? "secondary" : "ghost"}
          className={cn("h-6 px-2 text-[10px]", value === stage && "font-semibold")}
          onClick={() => onChange(stage)}
        >
          {stage}
        </Button>
      ))}
    </div>
  );
}
