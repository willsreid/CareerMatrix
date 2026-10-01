/**
 * The screens, compared as pictures.
 *
 * The two suites check bytes and text; this one checks what the pages *look* like, which is the only way to catch
 * a layout regression — a panel that grew over its heading, a column that stopped being a column. It screenshots
 * every route with a real browser and compares the pixels against a baseline kept in `tmp/visual/baseline/`.
 *
 * Three things it is careful about, because a screenshot suite that cries wolf is worse than none at all:
 *
 * - **It never leaves the machine.** The browser is pointed at the dev server *by IP* and at nothing else, so the
 *   map's tiles fail fast and the page shows its no-imagery state: the same picture every run, with no third
 *   party in the loop.
 * - **It uses a throwaway profile**, so every capture is the *first-run* view of the screen — empty localStorage,
 *   empty states, no data from whoever happens to be running it. The populated states are on the manual list.
 * - **It skips rather than fails** when there is no browser to drive, and says how to point it at one.
 *
 * The baseline is written on the first run and reported as a skip rather than a pass — there was nothing to
 * compare against. After that a changed screen fails with the share of pixels that moved and a diff image to look
 * at, and `--accept-screens` rewrites the baseline once you have decided the change was wanted.
 *
 * Baselines are kept per browser (`tmp/visual/baseline/chrome/…`), because two engines do not draw the same
 * pixels: switching from Chrome to Edge, or running the stand-in above, must not read as a layout regression.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { decodePng, diffRasters, encodePng, markDifferences } from "./png.mts";

export interface ScreenTarget {
  name: string;
  path: string;
}

/** The routes worth a picture: the same list the route checks use, in the order the navigation shows them. */
export const SCREENS: ScreenTarget[] = [
  { name: "workspace", path: "/" },
  { name: "cover-letter", path: "/cover-letter" },
  { name: "profile", path: "/profile" },
  { name: "portfolio", path: "/portfolio" },
  { name: "saved", path: "/saved" },
  { name: "pipeline", path: "/pipeline" },
  { name: "calendar", path: "/calendar" },
  { name: "saved-missing-record", path: "/saved?open=does-not-exist" },
];

/** The share of pixels allowed to move before a screen counts as changed: anti-aliasing, not layout. */
export const MOVED_PIXEL_SHARE = 0.002;

const VIEWPORT = { width: 1440, height: 1800 };
const CAPTURE_TIMEOUT_MS = 60_000;
const PNG_SIGNATURE = "89504e47";

/** Where a Chromium browser usually lives, and what to call it when it is found. */
const MAC_BROWSERS: [string, string][] = [
  ["Google Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
  ["Chromium", "/Applications/Chromium.app/Contents/MacOS/Chromium"],
  ["Microsoft Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
  ["Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
];

const PATH_BROWSERS = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

/**
 * The browser to drive, or null.
 *
 * `CHROME_PATH` wins, so any Chromium-family browser can be pointed at — including one this list has never heard
 * of, and including a stand-in that writes pictures of its own. Vivaldi and Arc are deliberately absent: both are
 * Chromium inside and neither honours the headless screenshot flag from a command line, so listing them would
 * turn a skip into a failure.
 */
export function findBrowser(): { path: string; name: string } | null {
  const explicit = process.env.CHROME_PATH;
  if (explicit) return { path: explicit, name: "CHROME_PATH" };
  for (const [name, path] of MAC_BROWSERS) if (existsSync(path)) return { path, name };
  for (const name of PATH_BROWSERS) {
    const found = spawnSync("which", [name], { encoding: "utf8" });
    const path = found.status === 0 ? found.stdout.trim() : "";
    if (path) return { path, name };
  }
  return null;
}

/** `localhost` swapped for its address, so the resolver rule below cannot take the dev server with it. */
function byAddress(base: string): string {
  return base.replace("//localhost", "//127.0.0.1");
}

/**
 * One screenshot.
 *
 * The flags are the ones that make a picture reproducible rather than pretty: one device scale, no scrollbars, a
 * fresh profile, a fixed window, and a resolver that answers nowhere — so a tile request fails in milliseconds
 * instead of putting somebody else's network into the baseline.
 */
export async function capture(
  url: string,
  file: string,
  browser: { path: string; name: string },
  options: { profile: string; headless?: string; timeout?: number },
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: string }> {
  const args = [
    options.headless ?? "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--disable-translate",
    "--host-resolver-rules=MAP * ~NOTFOUND",
    `--user-data-dir=${options.profile}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    "--virtual-time-budget=8000",
    `--screenshot=${file}`,
    url,
  ];

  const finished = await new Promise<{ code: number | null; error?: string }>((resolve) => {
    const child = spawn(browser.path, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, error: `${browser.name} did not finish inside ${CAPTURE_TIMEOUT_MS / 1000}s` });
    }, options.timeout ?? CAPTURE_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, error: `${browser.name} could not be started: ${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code });
    });
  });
  if (finished.error) return { ok: false, error: finished.error };

  if (!existsSync(file)) {
    return {
      ok: false,
      error: `${browser.name} exited (${finished.code}) without writing a screenshot — a Chromium browser is needed, or set CHROME_PATH`,
    };
  }
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 4).toString("hex") !== PNG_SIGNATURE) {
    return { ok: false, error: `${browser.name} wrote something that is not a PNG` };
  }
  return { ok: true, bytes };
}

export interface ScreenOutcome {
  status: "pass" | "fail" | "skip";
  detail: string;
}

/**
 * Every screen, against its baseline.
 *
 * One row rather than eight: the report is read by a person, and "no screen moved" is the only thing it needs to
 * say on a good day. When something did move, the detail names it and the diff image is written beside the
 * capture.
 */
export async function checkScreens({
  base,
  dir = "tmp/visual",
  accept = false,
  screens = SCREENS,
}: {
  base: string;
  dir?: string;
  accept?: boolean;
  screens?: ScreenTarget[];
}): Promise<ScreenOutcome> {
  const browser = findBrowser();
  if (!browser) {
    return {
      status: "skip",
      detail: "no Chromium browser found — install Chrome, or set CHROME_PATH to a Chromium binary",
    };
  }

  const baselineDir = join(dir, "baseline", browser.name.toLowerCase().replace(/\W+/g, "-"));
  const latestDir = join(dir, "latest");
  const diffDir = join(dir, "diff");
  for (const folder of [baselineDir, latestDir, diffDir]) mkdirSync(folder, { recursive: true });

  const changed: string[] = [];
  const broken: string[] = [];
  let seeded = 0;
  let compared = 0;

  for (const screen of screens) {
    const file = join(latestDir, `${screen.name}.png`);
    // A profile thrown away each time, so no screen is ever a second look at somebody's own data.
    const profile = join(dir, "profile");
    rmSync(profile, { recursive: true, force: true });

    const shot = await capture(`${byAddress(base)}${screen.path}`, file, browser, { profile });
    if (!shot.ok) {
      broken.push(`${screen.name}: ${shot.error}`);
      continue;
    }

    const baselineFile = join(baselineDir, `${screen.name}.png`);
    if (accept || !existsSync(baselineFile)) {
      writeFileSync(baselineFile, shot.bytes);
      seeded += 1;
      continue;
    }

    const before = decodePng(readFileSync(baselineFile));
    const after = decodePng(shot.bytes);
    const diff = diffRasters(before, after);
    compared += 1;
    if (diff.resized) {
      changed.push(`${screen.name} (the page is a different size)`);
      continue;
    }
    if (diff.share > MOVED_PIXEL_SHARE) {
      // The picture of what moved, so the next question ("what changed?") has an answer you can look at.
      writeFileSync(join(diffDir, `${screen.name}.png`), encodePng(markDifferences(before, after)));
      changed.push(
        `${screen.name} (${(diff.share * 100).toFixed(2)}% of pixels moved, worst channel ${diff.worst})`,
      );
    }
  }

  if (broken.length) {
    return { status: "fail", detail: `${browser.name} could not draw ${broken.join("; ")}` };
  }
  if (changed.length) {
    return {
      status: "fail",
      detail: `${changed.join(", ")} — look at ${diffDir}/, then re-run with --accept-screens if the change was wanted`,
    };
  }
  if (seeded) {
    return {
      status: "skip",
      detail: accept
        ? `wrote ${seeded} baseline${seeded === 1 ? "" : "s"}`
        : `wrote ${seeded} baseline screenshot${seeded === 1 ? "" : "s"} — run again to compare against them`,
    };
  }
  return {
    status: "pass",
    detail: `${compared} screens, nothing moved (${browser.name}, ${VIEWPORT.width}×${VIEWPORT.height})`,
  };
}

