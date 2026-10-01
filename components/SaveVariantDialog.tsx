"use client";

import * as React from "react";
import { CalendarDays, CalendarPlus, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPLICATION_STAGES, type ApplicationStage, type SaveVariantDetails } from "@/lib/types";
import { validateSaveDetails } from "@/lib/applications";
import {
  FOLLOW_UP_PRESETS,
  addDays,
  daysBetween,
  describeOffset,
  formatIsoDateWithWeekday,
  isIsoDate,
  relativeDayLabel,
  todayIso,
} from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The Save variant form.
 *
 * The dates are the point: a record with no dates cannot appear on a follow-up
 * calendar, and free-text notes cannot be turned back into dates later. Both can be
 * typed, or set from a hot key — Today for the application, and an offset in days
 * or weeks for the follow-up, which is how people actually think about chasing
 * something ("if I have not heard in two weeks").
 */
export function SaveVariantDialog({
  open,
  onOpenChange,
  jobTitle,
  company,
  onSave,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobTitle: string;
  company: string;
  /** Called with the collected details when the form is valid. */
  onSave: (details: SaveVariantDetails) => void;
  description?: React.ReactNode;
}) {
  const [appliedAt, setAppliedAt] = React.useState("");
  const [followUpAt, setFollowUpAt] = React.useState("");
  const [offsetValue, setOffsetValue] = React.useState(2);
  const [offsetUnit, setOffsetUnit] = React.useState<"days" | "weeks">("weeks");
  const [notes, setNotes] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [source, setSource] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [stage, setStage] = React.useState<ApplicationStage>("Saved");

  // A fresh form each time it opens, so a previous save cannot leak into this one.
  React.useEffect(() => {
    if (!open) return;
    setAppliedAt("");
    setFollowUpAt("");
    setOffsetValue(2);
    setOffsetUnit("weeks");
    setNotes("");
    setContact("");
    setSource("");
    setAddress("");
    setStage("Saved");
  }, [open]);

  const today = todayIso();
  const offsetDays = Math.max(0, Math.trunc(offsetValue || 0)) * (offsetUnit === "weeks" ? 7 : 1);
  // Offsets count from the applied date when there is one, which is what makes
  // "follow up two weeks after applying" land on the right day.
  const offsetBase = isIsoDate(appliedAt) ? appliedAt : today;
  const hasFollowUp = isIsoDate(followUpAt);

  const details: SaveVariantDetails = {
    notes,
    appliedAt: appliedAt || undefined,
    followUpAt: followUpAt || undefined,
    contact,
    source,
    address,
    stage,
  };
  const error = validateSaveDetails(details);

  /**
   * Re-derives the follow-up date from the interval the user just changed.
   *
   * Deliberately unconditional: this is only ever called from a control the user
   * actually touched, so an offset of 0 means "same day", not "no opinion".
   */
  const recalcFollowUp = (nextBase: string, nextValue: number, nextUnit: "days" | "weeks") => {
    if (!Number.isFinite(nextValue)) return;
    const days = Math.max(0, Math.trunc(nextValue)) * (nextUnit === "weeks" ? 7 : 1);
    setFollowUpAt(addDays(nextBase, days));
  };

  /**
   * Moves an existing follow-up when the applied date changes, so a two-week gap
   * stays two weeks. Never invents one: if no follow-up was set, changing the
   * applied date leaves it unset rather than scheduling something unasked.
   */
  const shiftFollowUpTo = (nextBase: string) => {
    if (!hasFollowUp) return;
    const days = Math.max(0, Math.trunc(offsetValue || 0)) * (offsetUnit === "weeks" ? 7 : 1);
    setFollowUpAt(addDays(nextBase, days));
  };

  const setAppliedToday = () => {
    setAppliedAt(today);
    // Recording an application *is* applying, so the stage follows the date unless
    // a later stage was already chosen.
    if (stage === "Saved") setStage("Applied");
    shiftFollowUpTo(today);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Save this variant</DialogTitle>
          <DialogDescription>
            {description ?? (
              <>
                Freezes the sheet as it looks now for{" "}
                <span className="font-medium text-foreground">{jobTitle}</span>
                {company ? ` at ${company}` : ""}. The dates here are what the follow-up
                calendar will use.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <AppliedDateRow
            appliedAt={appliedAt}
            today={today}
            onToday={setAppliedToday}
            onChange={(next) => {
              setAppliedAt(next);
              if (next && stage === "Saved") setStage("Applied");
              shiftFollowUpTo(next || today);
            }}
          />

          <FollowUpRow
            appliedAt={appliedAt}
            today={today}
            followUpAt={followUpAt}
            setFollowUpAt={setFollowUpAt}
            offsetValue={offsetValue}
            setOffsetValue={setOffsetValue}
            offsetUnit={offsetUnit}
            setOffsetUnit={setOffsetUnit}
            offsetDays={offsetDays}
            hasFollowUp={hasFollowUp}
            offsetBase={offsetBase}
            recalcFollowUp={recalcFollowUp}
          />

          <DetailsFields
            notes={notes}
            setNotes={setNotes}
            contact={contact}
            setContact={setContact}
            source={source}
            setSource={setSource}
            address={address}
            setAddress={setAddress}
            stage={stage}
            setStage={setStage}
          />

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <span className="mr-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            Saved locally, like everything else here.
          </span>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={Boolean(error)}
            onClick={() => {
              onSave(details);
              onOpenChange(false);
            }}
          >
            <CalendarPlus className="h-4 w-4" />
            Save variant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* The three sections                                                         */
/* -------------------------------------------------------------------------- */

/** "Today" / "Yesterday" hot keys plus a plain date input. */
function AppliedDateRow({
  appliedAt,
  today,
  onChange,
  onToday,
}: {
  appliedAt: string;
  today: string;
  onChange: (next: string) => void;
  onToday: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="applied-date" className="text-xs">
        Date applied
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="applied-date"
          type="date"
          value={appliedAt}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-40 text-xs"
        />
        <Button size="sm" variant="outline" onClick={onToday}>
          <CalendarDays className="h-3.5 w-3.5" />
          Today
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onChange(addDays(today, -1))}>
          Yesterday
        </Button>
        {appliedAt ? (
          <Button size="sm" variant="ghost" onClick={() => onChange("")}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {appliedAt
          ? `${formatIsoDateWithWeekday(appliedAt)} · ${relativeDayLabel(appliedAt)}`
          : "Leave empty for a variant you have not sent yet."}
      </p>
    </div>
  );
}


/** Preset offsets, a days/weeks interval, and a direct date override. */
function FollowUpRow({
  appliedAt,
  today,
  followUpAt,
  setFollowUpAt,
  offsetValue,
  setOffsetValue,
  offsetUnit,
  setOffsetUnit,
  offsetDays,
  hasFollowUp,
  offsetBase,
  recalcFollowUp,
}: {
  appliedAt: string;
  today: string;
  followUpAt: string;
  setFollowUpAt: (next: string) => void;
  offsetValue: number;
  setOffsetValue: (next: number) => void;
  offsetUnit: "days" | "weeks";
  setOffsetUnit: (next: "days" | "weeks") => void;
  offsetDays: number;
  hasFollowUp: boolean;
  offsetBase: string;
  recalcFollowUp: (base: string, value: number, unit: "days" | "weeks") => void;
}) {
  const appliedValid = isIsoDate(appliedAt);
  const gap = appliedValid && isIsoDate(followUpAt) ? daysBetween(appliedAt, followUpAt) : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor="follow-up-date" className="text-xs">
        Follow up
      </Label>

      <div className="flex flex-wrap gap-1.5">
        {FOLLOW_UP_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            variant="outline"
            className={cn(
              "h-7 text-[11px]",
              hasFollowUp && offsetDays === preset.days && "border-primary text-foreground",
            )}
            onClick={() => {
              setOffsetUnit("days");
              setOffsetValue(preset.days);
              setFollowUpAt(addDays(offsetBase, preset.days));
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Input
          type="number"
          min={0}
          max={365}
          value={offsetValue}
          aria-label="Follow-up interval"
          onChange={(event) => {
            const next = Number(event.target.value);
            setOffsetValue(next);
            if (Number.isFinite(next) && next >= 0) recalcFollowUp(offsetBase, next, offsetUnit);
          }}
          className="h-8 w-20 text-xs"
        />
        <div className="flex overflow-hidden rounded-md border">
          {(["days", "weeks"] as const).map((unit) => (
            <button
              key={unit}
              type="button"
              onClick={() => {
                setOffsetUnit(unit);
                recalcFollowUp(offsetBase, offsetValue, unit);
              }}
              className={cn(
                "px-2 py-1 text-[11px] capitalize",
                offsetUnit === unit
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {unit}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          after {appliedValid ? "applying" : "today"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Input
          id="follow-up-date"
          type="date"
          value={followUpAt}
          onChange={(event) => setFollowUpAt(event.target.value)}
          className="h-8 w-40 text-xs"
        />
        <span className="text-[11px] text-muted-foreground">or pick a date</span>
        {followUpAt ? (
          <Button size="sm" variant="ghost" onClick={() => setFollowUpAt("")}>
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        ) : null}
      </div>

      <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {isIsoDate(followUpAt) ? (
          <>
            <Badge variant="outline">{formatIsoDateWithWeekday(followUpAt)}</Badge>
            <span className="text-muted-foreground">
              {gap !== undefined
                ? `${describeOffset(gap)} after applying`
                : relativeDayLabel(followUpAt, today)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            No follow-up date yet. Anything set here lands on the pipeline list and, later, the
            calendar.
          </span>
        )}
      </p>
    </div>
  );
}

/** Notes, contact, source and the pipeline stage. */
function DetailsFields({
  notes,
  setNotes,
  contact,
  setContact,
  source,
  setSource,
  address,
  setAddress,
  stage,
  setStage,
}: {
  notes: string;
  setNotes: (next: string) => void;
  contact: string;
  setContact: (next: string) => void;
  source: string;
  setSource: (next: string) => void;
  address: string;
  setAddress: (next: string) => void;
  stage: ApplicationStage;
  setStage: (next: ApplicationStage) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="variant-address" className="text-xs">
          Office address
        </Label>
        <Input
          id="variant-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="1201 SW 5th Ave, Portland, OR 97201 — if you know it yet"
          className="h-8 text-xs"
        />
        <p className="text-[10px] leading-snug text-muted-foreground">
          The building you would actually work in, not the line the ad carried. It is what you navigate to on
          interview morning, and the calendar can pin it on the map later if you want it there.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="variant-notes" className="text-xs">
          Notes
        </Label>
        <Textarea
          id="variant-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="What you sent, who you spoke to, what they said, next step…"
          className="min-h-[70px] text-xs"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="variant-contact" className="text-xs">
            Contact
          </Label>
          <Input
            id="variant-contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="Recruiter, referral, hiring manager"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="variant-source" className="text-xs">
            Source
          </Label>
          <Input
            id="variant-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="LinkedIn, referral, company site"
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Stage</Label>
        <div className="flex flex-wrap gap-1.5">
          {APPLICATION_STAGES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStage(option)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px]",
                stage === option
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
