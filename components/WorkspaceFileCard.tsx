"use client";

import * as React from "react";
import { FolderOpen, HardDriveDownload, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { imageStore } from "@/lib/imageStore";
import { STORAGE_KEYS, buildBackup, parseImport, subscribe, type StorageKey } from "@/lib/storage";
import {
  chooseWorkspaceFolder,
  folderPermission,
  readWorkspaceFile,
  readWorkspaceImages,
  recallFolder,
  rememberFolder,
  requestFolderPermission,
  supportsWorkspaceFolder,
  syncWorkspaceImages,
  writeWorkspaceFile,
} from "@/lib/workspaceFile";

/**
 * How long after the last change the file is rewritten.
 *
 * Long enough that typing a sentence is one write rather than forty, short enough that "did that save?" never has
 * a wrong answer. The file is small — a couple of hundred kilobytes — because the pictures live beside it.
 */
const SAVE_DELAY_MS = 700;

type Status = "off" | "saving" | "saved" | "error";

/**
 * The workspace as a folder on disk.
 *
 * `localStorage` is local and private and completely invisible: clearing the browser's site data takes the whole
 * job search with it, and there is nothing to copy to a backup drive. Pointing this panel at a folder turns the
 * workspace into files anyone understands — `workspace.json` and an `images/` directory — and keeps them up to
 * date as you work, so the answer to "where is my data" is a directory you can open in Finder.
 *
 * Chromium-only, because `showDirectoryPicker` is: Chrome, Edge, Brave, Vivaldi. Safari and Firefox get the
 * Export/Import JSON this app has always had, and a sentence saying why.
 */
export function WorkspaceFileCard({ onOpen }: { onOpen: (result: ReturnType<typeof parseImport>) => void }) {
  /** False until the browser has been asked: this renders on the server, where there is no `window`. */
  const [mounted, setMounted] = React.useState(false);
  const [supported, setSupported] = React.useState(false);
  const [folder, setFolder] = React.useState<FileSystemDirectoryHandle | null>(null);
  /** A folder chosen on a previous visit: remembered, but not yet permitted to be written to. */
  const [remembered, setRemembered] = React.useState<FileSystemDirectoryHandle | null>(null);
  const [status, setStatus] = React.useState<Status>("off");
  const [busy, setBusy] = React.useState(false);
  const [lastSaved, setLastSaved] = React.useState<Date | null>(null);
  const [images, setImages] = React.useState(0);

  const timer = React.useRef<number | null>(null);

  React.useEffect(() => {
    setMounted(true);
    setSupported(supportsWorkspaceFolder());
    void recallFolder().then(async (handle) => {
      if (!handle) return;
      // A remembered folder that still has permission is simply live again; one that does not is offered as
      // "reconnect", because the browser requires a click to re-grant it.
      if (await folderPermission(handle, "readwrite")) setFolder(handle);
      else setRemembered(handle);
    });
  }, []);

  /** Writes the bundle and any pictures the folder is missing. */
  const write = React.useCallback(async (handle: FileSystemDirectoryHandle) => {
    setStatus("saving");
    try {
      await writeWorkspaceFile(handle, JSON.stringify(buildBackup(), null, 2));
      const written = await syncWorkspaceImages(handle);
      if (written) setImages((current) => current + written);
      setLastSaved(new Date());
      setStatus("saved");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }, []);

  /**
   * One write per quiet moment, whatever changed.
   *
   * Every key in `STORAGE_KEYS` is subscribed to rather than a hand-written list of the ones that seemed to
   * matter: a store added later is saved by this line without anybody remembering to come back here.
   */
  React.useEffect(() => {
    if (!folder) return;
    const schedule = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void write(folder), SAVE_DELAY_MS);
    };
    const offs = Object.values(STORAGE_KEYS).map((key) => subscribe(key as StorageKey, schedule));
    return () => {
      offs.forEach((off) => off());
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [folder, write]);

  const connect = async () => {
    setBusy(true);
    try {
      const handle = await chooseWorkspaceFolder();
      if (!handle) return;
      if (!(await requestFolderPermission(handle, "readwrite"))) {
        toast.error("The browser did not grant write access to that folder.");
        return;
      }
      setFolder(handle);
      setRemembered(null);
      await rememberFolder(handle);
      await write(handle);
      toast.success(`Saving to “${handle.name}” from now on.`);
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    if (!remembered) return;
    setBusy(true);
    try {
      if (!(await requestFolderPermission(remembered, "readwrite"))) {
        toast.error("The browser did not grant write access to that folder.");
        return;
      }
      setFolder(remembered);
      setRemembered(null);
      await write(remembered);
      toast.success(`Saving to “${remembered.name}” again.`);
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    setBusy(true);
    try {
      const handle = await chooseWorkspaceFolder();
      if (!handle) return;
      if (!(await requestFolderPermission(handle, "readwrite"))) {
        toast.error("The browser did not grant access to that folder.");
        return;
      }
      const text = await readWorkspaceFile(handle);
      if (!text) {
        toast.error(`There is no workspace.json in “${handle.name}”.`);
        return;
      }
      // The pictures first, so the portfolio's references resolve the moment the bundle lands. Width and height
      // are not stored with the bytes: the document's own image references carry those.
      const pictures = await readWorkspaceImages(handle);
      for (const picture of pictures) await imageStore.put(picture);
      setFolder(handle);
      setRemembered(null);
      await rememberFolder(handle);
      onOpen(parseImport(text));
      toast.success(
        `Opened “${handle.name}”${pictures.length ? ` with ${pictures.length} picture${pictures.length === 1 ? "" : "s"}` : ""}.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setFolder(null);
    setRemembered(null);
    setStatus("off");
    setImages(0);
    await rememberFolder(null);
    toast.success("Stopped saving to that folder. Everything is still in this browser.");
  };

  // Nothing until the browser has answered: a server render cannot know whether the picker exists, and guessing
  // would flash the wrong message on the way in.
  if (!mounted) return null;



  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <HardDriveDownload className="h-4 w-4 text-primary" />
          Keep it in a folder
        </CardTitle>
        <CardDescription>
          {supported
            ? "Point this at a folder and every change is written to it as you work — one workspace.json, and the pictures beside it. Nothing to export, nothing to remember, and clearing your browser data cannot touch it."
            : "This browser cannot write to a folder, so use Export and Import below. Chrome, Edge, Brave and Vivaldi can."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void connect()} disabled={!supported || busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HardDriveDownload className="h-4 w-4" />
            )}
            {folder ? "Change folder…" : "Save to a folder…"}
          </Button>

          {remembered && !folder ? (
            <Button size="sm" variant="outline" onClick={() => void reconnect()} disabled={busy}>
              Reconnect to “{remembered.name}”
            </Button>
          ) : null}

          <Button size="sm" variant="outline" onClick={() => void open()} disabled={!supported || busy}>
            <FolderOpen className="h-4 w-4" />
            Open a workspace folder…
          </Button>

          {folder ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => void write(folder)} disabled={busy}>
                Save now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void disconnect()} disabled={busy}>
                <Unplug className="h-4 w-4" />
                Stop
              </Button>
            </>
          ) : null}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground" data-workspace-file-status>
          {folder ? (
            <>
              Saving to <span className="text-foreground">“{folder.name}”</span> —{" "}
              {status === "saving"
                ? "writing…"
                : status === "error"
                  ? "the last write failed. It may be a folder that has been moved or renamed."
                  : lastSaved
                    ? `last written at ${lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}${images ? ` · ${images} picture${images === 1 ? "" : "s"} copied` : ""}`
                    : "nothing written yet."}
            </>
          ) : (
            "Until you choose a folder, everything stays in this browser's storage — which works, and is invisible."
          )}
        </p>
      </CardContent>
    </Card>
  );
}
