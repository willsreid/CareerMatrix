"use client";

import * as React from "react";
import { Building2, ExternalLink, Loader2, MapPin, MapPinOff, Navigation, Phone } from "lucide-react";
import { toast } from "sonner";

import { useWorkspace } from "@/components/WorkspaceProvider";
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
import { SelectlessStagePicker } from "@/components/SavedStagePicker";
import {
  addressToPlace,
  detailPatch,
  pinnedLabel,
  placedAddress,
  type DetailField,
} from "@/lib/applicationDetails";
import { followUpStatus } from "@/lib/applications";
import { formatIsoDate, formatIsoDateWithWeekday } from "@/lib/dates";
import { formatLatLng } from "@/lib/geo";
import { APPLICATION_STAGES, type SavedApplication } from "@/lib/types";

/**
 * The things you learn about an application *after* you send it.
 *
 * A saved variant freezes what went out; this is the other half — the office you would actually work in, the
 * person who called you, what they said, and when you said you would get back to them. All of it used to live in
 * the free-text notes field, which is fine for a sentence and useless for an address you want to navigate to or a
 * name you want to search for.
 *
 * It opens from the calendar (and from the saved list), writes straight to the record as you go, and does not
 * navigate anywhere on its own: closing it leaves you where you were, which is the point of editing details
 * rather than opening the whole workspace.
 */
export function ApplicationDetailsDialog({
  application,
  onClose,
  onOpenWorkspace,
}: {
  /** Null closes it; the caller owns which record is open. */
  application: SavedApplication | null;
  onClose: () => void;
  /** Optional: hand the record to the workspace. Left to the caller so this stays router-free. */
  onOpenWorkspace?: (applicationId: string) => void;
}) {
  const { updateApplication, geocode } = useWorkspace();
  const [finding, setFinding] = React.useState(false);
  const [draft, setDraft] = React.useState({ address: "", contact: "", notes: "", source: "" });

  // Seeded from the record whenever a different one is opened — and re-seeded if it changes underneath, which
  // is how an edit made in another tab shows up here rather than being silently overwritten.
  React.useEffect(() => {
    setDraft({
      address: application?.address ?? "",
      contact: application?.contact ?? "",
      notes: application?.notes ?? "",
      source: application?.source ?? "",
    });
  }, [application?.id, application?.address, application?.contact, application?.notes, application?.source]);

  if (!application) return null;
  const entry = application;
  const followUp = followUpStatus(entry.followUpAt);

  /** Writes a field when you leave it, which is what the rest of this app does with free text. */
  const commit = (field: DetailField) => {
    const value = draft[field].trim();
    const current = (entry[field] ?? "").trim();
    if (value === current) return;
    updateApplication(entry.id, detailPatch(field, value));
  };

  /**
   * Pins the office on the map, from the address you typed.
   *
   * The one thing here that leaves the machine, and only when asked: the address is looked up through the same
   * route the map's centre field uses — the book of places first, then one cached lookup — and the answer is
   * stored as this application's own point, which beats what the gazetteer made of the posting's location line.
   */
  const findOnMap = async () => {
    const text = addressToPlace(entry, draft.address);
    if (!text) {
      toast.error("Type the office address first, and it can be placed.");
      return;
    }
    setFinding(true);
    const hit = await geocode(text);
    setFinding(false);
    if (!hit) {
      toast.error(`Could not place “${text}”. A city or a ZIP code in there will usually do it.`);
      return;
    }
    updateApplication(entry.id, placedAddress(entry, draft.address, hit.point));
    toast.success(`Pinned to ${hit.label}`);
  };

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent data-details-dialog={entry.id} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            {entry.jobTitle}
            <Badge variant="muted" className="text-[10px]">
              {entry.matchScore}% match
            </Badge>
          </DialogTitle>
          <DialogDescription className="space-y-0.5">
            <span className="block">
              {entry.company} · {entry.workMode}
            </span>
            <span className="block">
              Posting said <span className="text-foreground">{entry.location || "nothing"}</span> — saved{" "}
              {formatIsoDate(entry.savedAt.slice(0, 10))}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* ---------------------------- the office ---------------------------- */}
          <div className="space-y-1.5">
            <Label htmlFor="details-address" className="flex items-center gap-1.5 text-xs">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Office address
            </Label>
            <Input
              id="details-address"
              aria-label="Office address"
              value={draft.address}
              onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
              onBlur={() => commit("address")}
              placeholder="1201 SW 5th Ave, Portland, OR 97201"
              className="h-8 text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                data-find-on-map
                disabled={finding}
                onClick={() => void findOnMap()}
              >
                {finding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Navigation className="h-3.5 w-3.5" />
                )}
                find it on the map
              </Button>
              {entry.coords ? (
                <>
                  <span
                    data-pinned={pinnedLabel(entry.coords)}
                    data-coords-lat={entry.coords.lat}
                    data-coords-lng={entry.coords.lng}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground"
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
                    pinned at {formatLatLng(entry.coords)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-muted-foreground"
                    data-unpin
                    onClick={() => {
                      updateApplication(entry.id, { coords: undefined });
                      toast.success("Unpinned — the map will place the posting's own location again.");
                    }}
                  >
                    <MapPinOff className="h-3.5 w-3.5" />
                    unpin
                  </Button>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Not on the map yet: the pin would come from the posting&apos;s location line.
                </span>
              )}
            </div>
          </div>


          {/* --------------------------- who you spoke to --------------------------- */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="details-contact" className="flex items-center gap-1.5 text-xs">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                Who you spoke to
              </Label>
              <Input
                id="details-contact"
                aria-label="Who you spoke to"
                value={draft.contact}
                onChange={(event) => setDraft((current) => ({ ...current, contact: event.target.value }))}
                onBlur={() => commit("contact")}
                placeholder="Recruiter, referral, hiring manager"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="details-source" className="text-xs">
                Came from
              </Label>
              <Input
                id="details-source"
                aria-label="Came from"
                value={draft.source}
                onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))}
                onBlur={() => commit("source")}
                placeholder="LinkedIn, referral, company site"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* ------------------------------- notes ------------------------------- */}
          <div className="space-y-1.5">
            <Label htmlFor="details-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="details-notes"
              aria-label="Notes"
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              onBlur={() => commit("notes")}
              placeholder="Hiring manager's name, what was said on the call, what they asked for next…"
              className="min-h-[80px] text-xs"
            />
          </div>

          {/* ------------------------------- dates ------------------------------- */}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="details-applied" className="text-xs">
                Date applied
              </Label>
              <Input
                id="details-applied"
                type="date"
                aria-label="Date applied"
                value={entry.appliedAt ?? ""}
                onChange={(event) =>
                  updateApplication(entry.id, { appliedAt: event.target.value || undefined })
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="details-follow-up" className="text-xs">
                Follow up
              </Label>
              <Input
                id="details-follow-up"
                type="date"
                aria-label="Follow up"
                value={entry.followUpAt ?? ""}
                onChange={(event) =>
                  updateApplication(entry.id, { followUpAt: event.target.value || undefined })
                }
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                {followUp.state === "none"
                  ? "Nothing scheduled — only you will remember."
                  : followUp.state === "overdue"
                    ? `${followUp.label}.`
                    : entry.followUpAt
                      ? `Due ${formatIsoDateWithWeekday(entry.followUpAt)}.`
                      : ""}
              </p>
            </div>
          </div>

          {/* ------------------------------- stage ------------------------------- */}
          <div className="space-y-1.5">
            <Label className="text-xs">Stage</Label>
            <SelectlessStagePicker
              value={entry.stage}
              stages={APPLICATION_STAGES}
              onChange={(stage) => updateApplication(entry.id, { stage })}
            />
          </div>

          <p className="text-[10px] leading-snug text-muted-foreground">
            Written to the record as you leave each field — nothing here needs saving, and nothing leaves this
            machine except the address, if you ask for it to be placed.
          </p>
        </div>

        <DialogFooter className="gap-2">
          {/* A plain anchor: this renders wherever the records do, router or no router. */}
          <a
            href={`/saved?open=${encodeURIComponent(entry.id)}`}
            data-open-record={entry.id}
            className="mr-auto flex items-center gap-1 text-[11px] text-primary underline"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            open the full record
          </a>
          {onOpenWorkspace ? (
            <Button size="sm" variant="outline" onClick={() => onOpenWorkspace(entry.id)}>
              Open in workspace
            </Button>
          ) : null}
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

