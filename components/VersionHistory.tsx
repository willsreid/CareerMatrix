"use client";

import * as React from "react";
import { BookmarkPlus, History, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { SaveVariantDialog } from "@/components/SaveVariantDialog";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { versionSummary } from "@/lib/versions";
import { relativeTime } from "@/lib/utils";
import type { VersionSnapshot } from "@/lib/types";

/**
 * Version shelf.
 *
 * The provider snapshots the sheet automatically 1.5s after you stop changing
 * it, so refining is always reversible. Pinning keeps a checkpoint through the
 * eviction that bounds the list; "Save as variant" freezes the version as a
 * saved application, which is the point at which a draft becomes the resume you
 * actually sent.
 */
export function VersionHistory() {
  const {
    versions,
    snapshotVersion,
    restoreVersion,
    deleteVersion,
    togglePinVersion,
    saveVersionAsApplication,
    canSnapshot,
  } = useWorkspace();
  const [label, setLabel] = React.useState("");
  const [pendingVersion, setPendingVersion] = React.useState<VersionSnapshot | null>(null);
  const latest = versions[0];

  return (
    <CollapsibleCard
      title="Versions"
      icon={History}
      meta={
        <>
          <Badge variant="muted">{versions.length}/40</Badge>
          {latest ? <Badge variant="outline">{latest.label}</Badge> : null}
        </>
      }
      description={
        versions.length
          ? "Newest first. A checkpoint is taken automatically 1.5s after you stop changing the sheet."
          : "No checkpoints yet — one is taken automatically 1.5s after each change."
      }
    >
      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label this checkpoint (optional)"
          className="h-8 text-xs"
        />
        <Button
          size="sm"
          className="shrink-0"
          disabled={!canSnapshot}
          onClick={() => {
            const created = snapshotVersion(label.trim() || undefined);
            if (created) {
              toast.success(`Saved ${created.label}.`);
              setLabel("");
            } else {
              toast.info("Nothing has changed since the last checkpoint.");
            }
          }}
        >
          Snapshot now
        </Button>
      </div>

      {versions.map((version, index) => (
        <VersionRow
          key={version.id}
          version={version}
          isLatest={index === 0}
          onRestore={() => {
            restoreVersion(version.id);
            toast.success(`Restored ${version.label}.`);
          }}
          onSaveVariant={() => setPendingVersion(version)}
          onPin={() => togglePinVersion(version.id)}
          onDelete={() => {
            if (!window.confirm(`Delete checkpoint ${version.label}?`)) return;
            deleteVersion(version.id);
            toast.success("Checkpoint deleted.");
          }}
        />
      ))}

      {versions.length ? (
        <p className="text-[10px] text-muted-foreground">
          Restoring a checkpoint brings back its posting, intensity, tone, type size and manual edits
          together, so a version is never shown against the wrong job. The oldest unpinned
          checkpoints fall off past 40.
        </p>
      ) : null}

      <SaveVariantDialog
        open={pendingVersion !== null}
        onOpenChange={(open) => {
          if (!open) setPendingVersion(null);
        }}
        jobTitle={pendingVersion?.jobTitle ?? "this role"}
        company={pendingVersion?.company ?? ""}
        description={
          <>
            Freezes checkpoint{" "}
            <span className="font-medium text-foreground">{pendingVersion?.label}</span> as a saved
            application. The dates here are what the follow-up calendar will use.
          </>
        }
        onSave={(details) => {
          if (!pendingVersion) return;
          const created = saveVersionAsApplication(pendingVersion.id, details);
          setPendingVersion(null);
          if (created) toast.success(`Saved ${created.jobTitle} as a variant.`);
        }}
      />
    </CollapsibleCard>
  );
}

function VersionRow({
  version,
  isLatest,
  onRestore,
  onSaveVariant,
  onPin,
  onDelete,
}: {
  version: VersionSnapshot;
  isLatest: boolean;
  onRestore: () => void;
  onSaveVariant: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={
        isLatest
          ? "space-y-1.5 rounded-md border border-primary/40 p-2 text-[11px]"
          : "space-y-1.5 rounded-md border p-2 text-[11px]"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{version.label}</span>
        {isLatest ? (
          <Badge variant="success" className="text-[10px]">
            current
          </Badge>
        ) : null}
        {version.pinned ? (
          <Badge variant="warn" className="text-[10px]">
            pinned
          </Badge>
        ) : null}
        <span className="ml-auto text-muted-foreground">{relativeTime(version.createdAt)}</span>
      </div>

      <p className="text-muted-foreground">{versionSummary(version)}</p>
      <p className="text-muted-foreground">
        {version.company} · {version.jobTitle}
      </p>

      {version.changes.length ? (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">vs previous: </span>
          {version.changes.join(", ")}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onRestore}>
          <RotateCcw className="h-3 w-3" />
          Restore
        </Button>
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onSaveVariant}>
          <BookmarkPlus className="h-3 w-3" />
          Save as variant
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onPin}>
          {version.pinned ? (
            <>
              <PinOff className="h-3 w-3" />
              Unpin
            </>
          ) : (
            <>
              <Pin className="h-3 w-3" />
              Pin
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 text-[10px] text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
          Delete
        </Button>
      </div>
    </div>
  );
}
