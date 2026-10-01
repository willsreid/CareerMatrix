/**
 * The whole check, in one command: `npm run verify:all`.
 *
 * The two suites each answer their own question — does the engine reason correctly, does the
 * renderer produce a real PDF — and neither of them can tell you whether the app still boots or
 * whether there is anything to click. This runs both, then type-checks the app, then smoke-tests
 * the routes against a dev server if one is running, then screenshots every screen and compares
 * the pixels if a browser is available, then writes the demo content and a report with the checks
 * only a person can make.
 *
 * Everything it writes lands in `tmp/test-package/` (gitignored), and the exit code is non-zero
 * if anything failed, so it can be wired into a hook or a pipeline unchanged.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import { makePng, pngChunk } from "./fixturePng.mts";
import { decodePng, diffRasters, encodePng, markDifferences, solidRaster } from "./png.mts";
import { checkScreens, type ScreenTarget } from "./screens.mts";

import {
  addAsset,
  createMediaLibrary,
  libraryStats,
  metricAsset,
  textAsset,
  type MediaLibrary,
} from "../lib/mediaLibrary";
import { PORTFOLIO_CAPABILITIES, createBlock, createPortfolio, planPortfolio } from "../lib/portfolio";
import { PRESENTATION_OPTIONS } from "../lib/presentationOptions";
import { createSeedProfile } from "../lib/masterProfileSeed";
import { DEFAULT_DRAFT } from "../lib/storage";

const OUT = join(process.cwd(), "tmp", "test-package");
const ARTIFACTS = join(process.cwd(), "tmp", "pdf-check");

interface Result {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
  ms: number;
}

const results: Result[] = [];

function run(name: string, command: string, args: string[]): Result {
  const started = Date.now();
  const outcome = spawnSync(command, args, { encoding: "utf8", cwd: process.cwd() });
  const output = `${outcome.stdout ?? ""}${outcome.stderr ?? ""}`;
  // Both suites print `PASS|FAIL — N/M …checks…`; the PDF one says "192/192 PDF checks passed".
  const summary = /(PASS|FAIL) — (\d+)\/(\d+) (?:PDF )?checks/.exec(output);
  const failures = output
    .split("\n")
    .filter((line) => /^\s*(FAIL|error)/i.test(line))
    .slice(0, 3)
    .map((line) => line.trim());

  const status = outcome.status === 0 ? "pass" : "fail";
  const detail = summary
    ? `${summary[2]}/${summary[3]} checks${failures.length ? ` · ${failures.join(" · ")}` : ""}`
    : failures.length
      ? failures.join(" · ")
      : status === "pass"
        ? // tsc prints nothing at all when it is happy, and "exit 0" tells a reader nothing.
          "no errors"
        : `exit ${outcome.status}`;
  return { name, status, detail, ms: Date.now() - started };
}

/* -------------------------------------------------------------------------- */
/* Real PNG bytes, so the fixtures are images the browser can actually decode  */
/* -------------------------------------------------------------------------- */

/* The encoder lives in `fixturePng.mts` because the template previews need it too, and two copies
   of a PNG writer is one copy too many. */

/* -------------------------------------------------------------------------- */
/* The demo content, importable from the Master Profile page                  */
/* -------------------------------------------------------------------------- */

/**
 * A portfolio that exercises several presentations, plus a store holding the text and numbers it
 * references.
 *
 * Images are deliberately absent: they cannot travel in a JSON backup (the bytes live in
 * IndexedDB), so the two PNGs written beside it are imported by hand and the store then has
 * something real to place.
 */
function demoContent(): { portfolio: ReturnType<typeof createPortfolio>; library: MediaLibrary } {
  let library = createMediaLibrary();
  for (const asset of [
    textAsset(
      "Four trade packages shared one model. Weekly clash runs caught the ductwork against the ceiling void six weeks before install.",
      "Clash narrative",
      ["coordination"],
    ),
    textAsset(
      "The point was never the model. It was that the foreman could open it on a tablet and know what to build tomorrow.",
      "Pull quote",
      ["coordination"],
    ),
    metricAsset({ label: "clashes resolved before install", value: "1,240" }, ["coordination"]),
    metricAsset({ label: "weeks saved on the programme", value: "6" }, ["coordination"]),
    metricAsset({ label: "hours of manual take-off removed", value: "180" }, ["automation"]),
    metricAsset({ label: "trade packages coordinated", value: "4" }, ["coordination"]),
  ]) {
    library = addAsset(library, asset);
  }

  const idFor = (value: string) =>
    library.assets.find((asset) => asset.metric?.value === value)?.id ?? "";
  const textId = (name: string) => library.assets.find((asset) => asset.name === name)?.id ?? "";

  const portfolio = createPortfolio({
    title: "Selected Work",
    subtitle: "Portfolio",
    author: createSeedProfile().header.name,
    projects: [
      {
        id: "pr-demo-1",
        name: "Data Centre Coordination",
        client: "Hyperscale campus",
        year: "2024",
        role: "VDC lead",
        slides: [
          {
            id: "sl-demo-1",
            title: "The problem",
            blocks: [
              createBlock("text", {
                presentation: "copy",
                title: "Brief",
                assetIds: [textId("Clash narrative")],
              }),
              createBlock("quote", {
                presentation: "quote",
                title: "Why it mattered",
                assetIds: [textId("Pull quote")],
              }),
            ],
          },
          {
            id: "sl-demo-2",
            title: "What changed",
            blocks: [
              {
                ...createBlock("pair", {
                  presentation: "pair-flip",
                  title: "Ceiling void, before and after",
                }),
                beforeLabel: "Week 1",
                afterLabel: "Week 6",
              },
              createBlock("metrics", {
                presentation: "metrics",
                title: "Outcome",
                assetIds: [idFor("1,240"), idFor("6")],
              }),
            ],
          },
        ],
      },
      {
        id: "pr-demo-2",
        name: "Automation Toolkit",
        role: "Built it",
        summary: "Small tools that removed the repetitive parts of coordination.",
        slides: [
          {
            id: "sl-demo-3",
            title: "What it saved",
            blocks: [
              createBlock("metrics", {
                presentation: "metrics",
                title: "Time recovered",
                assetIds: [idFor("180"), idFor("4")],
              }),
            ],
          },
        ],
      },
    ],
  });

  return { portfolio, library };
}

/* -------------------------------------------------------------------------- */
/* Optional: the routes, if a dev server happens to be up                      */
/* -------------------------------------------------------------------------- */

const ROUTES: { path: string; expect: string[]; status?: number }[] = [
  { path: "/", expect: ["Career Matrix"] },
  { path: "/cover-letter", expect: [] },
  { path: "/profile", expect: [] },
  { path: "/portfolio", expect: [] },
  { path: "/saved", expect: [] },
  // A link into a record that is not there: the page has to survive it rather than empty itself.
  { path: "/saved?open=does-not-exist", expect: [] },
  { path: "/pipeline", expect: ["How the search is going"] },
  // The map ships in the server's HTML, tile requests and all — which is the cheapest way to prove that the
  // calendar really is drawing a real map and not a placeholder.
  { path: "/calendar", expect: ["Where you are applying", "tile.openstreetmap.org"] },
  // The lookup route, asked something too short to be a place: a refusal, and nothing sent to anybody.
  { path: "/api/geocode?q=x", expect: [], status: 400 },
];

async function checkRoutes(): Promise<Result[]> {
  const port = process.env.PORT ?? "3000";
  const base = `http://localhost:${port}`;
  const started = Date.now();

  try {
    await fetch(base, { signal: AbortSignal.timeout(2500) });
  } catch {
    return [
      {
        name: `Routes on :${port}`,
        status: "skip",
        detail: "no dev server listening — run `npm run dev`, then this again",
        ms: Date.now() - started,
      },
    ];
  }

  const outcomes: Result[] = [];
  for (const route of ROUTES) {
    const routeStart = Date.now();
    try {
      const response = await fetch(`${base}${route.path}`, { signal: AbortSignal.timeout(30000) });
      const body = await response.text();
      const broken = /Application error|Unhandled Runtime Error|__next_error__/.test(body);
      const missing = route.expect.filter((marker) => !body.includes(marker));
      // Most routes answer 200; the lookup answers 400 to a question it will not pass on.
      const asAsked = route.status ? response.status === route.status : response.ok;
      // The portfolio route renders its hydration shell on the server, so asserting page markers
      // there would only prove the loading line exists. Status and the absence of an error are
      // what a request can honestly confirm; the interactions are on the manual list.
      outcomes.push({
        name: `GET ${route.path}`,
        status: asAsked && !broken && !missing.length ? "pass" : "fail",
        detail: broken
          ? "page rendered an error"
          : missing.length
            ? `missing ${missing.join(", ")}`
            : String(response.status),
        ms: Date.now() - routeStart,
      });
    } catch (error) {
      outcomes.push({
        name: `GET ${route.path}`,
        status: "fail",
        detail: error instanceof Error ? error.message : "request failed",
        ms: Date.now() - routeStart,
      });
    }
  }
  return outcomes;
}

/* -------------------------------------------------------------------------- */
/* The screens, as pictures                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The visual checks: the screenshot suite, and the same code driven by a stand-in browser.
 *
 * The stand-in earns its place. A browser cannot be assumed — this machine has no Chromium at all — and a check
 * that has never once been executed is a check nobody can trust, so the capture → compare → report path is driven
 * here by a script that writes the PNGs a browser would: it seeds a baseline, passes when nothing moves, fails
 * when something does, writes the diff image, and settles again once the change is accepted. When a Chromium
 * browser is found, the same check runs for real against the dev server.
 */
async function checkScreensAndStub(): Promise<Result[]> {
  const outcomes: Result[] = [];
  const base = `http://localhost:${process.env.PORT ?? "3000"}`;

  const realStart = Date.now();
  const real = await checkScreens({ base, accept: process.argv.includes("--accept-screens") });
  outcomes.push({ name: "Screens (pixels)", ...real, ms: Date.now() - realStart });

  const dir = join(process.cwd(), "tmp", "visual-stub");
  const payload = join(dir, "payload.png");
  const stub = join(dir, "stand-in-browser.sh");
  const screens: ScreenTarget[] = [{ name: "stub", path: "/" }];
  const stubStart = Date.now();
  const previous = process.env.CHROME_PATH;

  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(payload, makePng(80, 60, [10, 20, 30]));
  writeFileSync(
    stub,
    [
      "#!/bin/sh",
      "# A stand-in for a browser: it reads the --screenshot= path out of its arguments and puts a picture there,",
      "# so the screenshot suite can be tested on a machine with no Chromium on it.",
      'out=""',
      'for arg in "$@"; do case "$arg" in --screenshot=*) out="${arg#--screenshot=}";; esac; done',
      `cp "${payload}" "$out"`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  process.env.CHROME_PATH = stub;
  try {
    const seeded = await checkScreens({ base, dir, screens });
    const unchanged = await checkScreens({ base, dir, screens });
    // Now the screen changes, the way a layout regression would.
    writeFileSync(payload, makePng(80, 60, [200, 20, 30]));
    const moved = await checkScreens({ base, dir, screens });
    const noticed = existsSync(join(dir, "diff", "stub.png"));
    const accepted = await checkScreens({ base, dir, screens, accept: true });
    const settled = await checkScreens({ base, dir, screens });
    const ok =
      seeded.status === "skip" &&
      seeded.detail.includes("baseline") &&
      unchanged.status === "pass" &&
      moved.status === "fail" &&
      noticed &&
      accepted.detail.includes("wrote 1 baseline") &&
      settled.status === "pass";
    outcomes.push({
      name: "Screens with a stand-in browser",
      status: ok ? "pass" : "fail",
      detail: ok
        ? `seeded, compared, caught a change and settled: ${moved.detail.split(" — ")[0]}`
        : `seeded=${seeded.status} (${seeded.detail}), unchanged=${unchanged.status}, moved=${moved.status}, diff=${noticed}, accepted=${accepted.detail}, settled=${settled.status}`,
      ms: Date.now() - stubStart,
    });
  } finally {
    if (previous === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = previous;
  }

  return outcomes;
}

/* -------------------------------------------------------------------------- */
/* Reading what a browser wrote                                               */
/* -------------------------------------------------------------------------- */

/**
 * The PNG reader, against images built here rather than borrowed from a browser.
 *
 * A screenshot decoder fails in exactly one way that matters: it gets the *filters* wrong. Chrome picks a filter
 * per row (often not "none"), so a reader that only handled filter 0 would return a scrambled image and a diff
 * nobody could trust. So the same pixels are encoded here five ways — once per filter — and read back.
 */
function checkPngReading(): Result {
  const started = Date.now();
  const width = 40;
  const height = 24;
  const raster = solidRaster(width, height, [17, 200, 42]);
  // A stripe, so the rows and columns are not all alike and a wrong predictor cannot cancel itself out.
  for (let x = 0; x < width; x += 1) {
    raster.data[(6 * width + x) * 3] = 240;
    raster.data[(7 * width + x) * 3 + 1] = 5;
  }

  /** One row of pixels with a chosen filter applied, and the chunk around it. */
  const filtered = (source: typeof raster, filter: number): Buffer => {
    const stride = source.width * source.channels;
    const raw = Buffer.alloc((stride + 1) * source.height);
    const paeth = (left: number, above: number, corner: number) => {
      const estimate = left + above - corner;
      const toLeft = Math.abs(estimate - left);
      const toAbove = Math.abs(estimate - above);
      const toCorner = Math.abs(estimate - corner);
      if (toLeft <= toAbove && toLeft <= toCorner) return left;
      return toAbove <= toCorner ? above : corner;
    };
    for (let y = 0; y < source.height; y += 1) {
      raw[y * (stride + 1)] = filter;
      for (let x = 0; x < stride; x += 1) {
        const value = source.data[y * stride + x];
        const left = x >= source.channels ? source.data[y * stride + x - source.channels] : 0;
        const above = y > 0 ? source.data[(y - 1) * stride + x] : 0;
        const corner = y > 0 && x >= source.channels ? source.data[(y - 1) * stride + x - source.channels] : 0;
        const predicted =
          filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? (left + above) >> 1
                : filter === 4
                  ? paeth(left, above, corner)
                  : 0;
        raw[y * (stride + 1) + 1 + x] = (value - predicted) & 0xff;
      }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(source.width, 0);
    header.writeUInt32BE(source.height, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk("IHDR", header),
      pngChunk("IDAT", deflateSync(raw)),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  };

  const samePixels = (decoded: typeof raster) =>
    decoded.width === width &&
    decoded.height === height &&
    decoded.channels === 3 &&
    decoded.data.length === raster.data.length &&
    decoded.data.every((value, index) => value === raster.data[index]);

  const filters = [0, 1, 2, 3, 4].map((filter) => {
    try {
      return samePixels(decodePng(filtered(raster, filter)));
    } catch {
      return false;
    }
  });

  // A difference of one pixel is one pixel, and a resize is not a diff at all.
  const moved = { ...raster, data: Uint8Array.from(raster.data) };
  moved.data[0] = 250;
  const onePixel = diffRasters(raster, moved);
  const resized = diffRasters(raster, solidRaster(width + 1, height, [17, 200, 42]));
  const marked = markDifferences(raster, moved);
  const identical = diffRasters(raster, decodePng(encodePng(raster)));

  const ok =
    filters.every(Boolean) &&
    onePixel.different === 1 &&
    Math.abs(onePixel.share - 1 / (width * height)) < 1e-12 &&
    onePixel.worst === 233 &&
    !onePixel.resized &&
    resized.resized &&
    resized.share === 1 &&
    identical.different === 0 &&
    identical.worst === 0 &&
    marked.data[0] === 255 &&
    marked.data[1] === 0 &&
    marked.data[2] === 0 &&
    marked.data[3] === 8;

  return {
    name: "PNG reading and diffing",
    status: ok ? "pass" : "fail",
    detail: ok
      ? `all five row filters read back byte for byte, and one changed pixel is one changed pixel`
      : `filters=${filters.join(",")} onePixel=${JSON.stringify(onePixel)} resized=${resized.resized}`,
    ms: Date.now() - started,
  };
}

/* -------------------------------------------------------------------------- */
/* The report                                                                 */
/* -------------------------------------------------------------------------- */

const MARK: Record<Result["status"], string> = { pass: "PASS", fail: "FAIL", skip: "SKIP" };

function artifacts(): string {
  const rows: string[] = [];
  const dirs = [
    ARTIFACTS,
    OUT,
    join(process.cwd(), "tmp", "visual", "latest"),
    join(process.cwd(), "tmp", "visual", "diff"),
    join(process.cwd(), "tmp", "visual-stub", "latest"),
    join(process.cwd(), "tmp", "visual-stub", "diff"),
  ];
  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = readdirSync(dir).filter((name) => name.endsWith(".pdf") || name.endsWith(".png"));
    } catch {
      continue;
    }
    for (const name of names) {
      const size = Math.round(statSync(join(dir, name)).size / 1024);
      rows.push(`| \`${join(dir.replace(`${process.cwd()}/`, ""), name)}\` | ${size} KB |`);
    }
  }
  return rows.length ? rows.join("\n") : "| — | none |";
}

function capabilityTable(): string {
  return PRESENTATION_OPTIONS.map((option) => {
    const capability = PORTFOLIO_CAPABILITIES.find((entry) => entry.feature === option.capability);
    return `| ${option.label} | ${option.ownsPages ? "yes" : "no"} | ${option.capability} | **${capability?.level ?? "UNKNOWN"}** |`;
  }).join("\n");
}

const MANUAL_CHECKS = `
**Macro: get the work in**

1. **Open the store.** \`npm run dev\`, then \`/portfolio\`. The store is the collapsible panel on
   the right; collapse it and a \`Store\` rail should stay put.
2. **Load the demo document.** On \`/profile\`, paste
   \`tmp/test-package/portfolio-demo-backup.json\` into the JSON box and import.
3. **Import the two images.** In the panel, *Import images* → pick
   \`before-ceiling-void.png\` and \`after-ceiling-void.png\`. Thumbnails appear, and the header
   count rises.
4. **Pair them.** Tick both and press *Pair the two selected*. A *Before / after pairs* group
   appears. (Pairing is what unlocks the before/after options at all.)
5. **Tie a caption to a frame.** Add a text asset, tick it plus one image, press *Attach text to
   image*. The image row should now read \`carries …\`.

**Structure: let a template do the arranging**

6. **Place the unplaced.** If the header offers *Place N unplaced*, press it: the imported work
   should appear as filmstrip rows, with a toast naming how many assets were placed. Press it
   again and it should decline, because nothing is waiting.
7. **Apply a template.** *From a template* → pick *Case study*. A project appears with its slots
   named (\`Brief\`, \`The view\`, \`The change\`…) and assets filled in import order.
8. **See the pages.** *The pages* is the workspace: every page at its real proportions, in a grid.
   Click any section on a page and its options appear on the panel at the top of the workspace — the
   same menu the export uses, with each option's caveat as its tooltip, and each one saying how many
   frames it wants.

**Micro: sculpt it**

9. **Add a section on a page.** Each page ends with *+ add a section to this page…*. Pick *Numbers*
   and it should appear on that page; the page count in the header should not change.
10. **Adjust how much room things take.** With a block selected, press size *tall*, then *wide*: the
    frames on that page should change shape as you press, without a reload. Then tick **spread over
    the page** on a page with white space at the bottom — the sections should push apart to fill it.
11. **Put sections beside each other.** Select a section and press **width ½**; select the next one
    and press ½ too. They should sit side by side, and the first one should say *row 1 of 1 · left*.
    Three at ⅓, or four at ¼, should do the same. Press **frames across 3** on one of them and it
    should show three frames in that section, not three sections.
12. **Reserve space for a picture you do not have.** Press **+** next to *frames* on a section: a
    labelled dashed hole should appear at the frame's real size and shape, and the section should say
    *frame 1*, *frame 2* and so on. Nothing else on the page should move. The **−** should refuse to
    go below the frames already placed. Add a section from *+ add a section to this page…* and it
    should arrive already holding the frames its variation wants.
13. **Move things with the arrows.** The four arrows on the panel are drawn, not implied: **←** and
    **→** move it one place, **↑** and **↓** move it past the whole row above or below. On the first
    row the up arrow is greyed out. Moving a section whose width differs from its neighbours is
    allowed to re-flow the rows — that is the layout being honest about widths.
14. **Check the panel is readable.** The selected section's controls should be on their own opaque
    panel at the top of the workspace, with normal dark-on-light (or light-on-dark) contrast — no
    chips floating over a photograph, and no text fighting the page behind it.
15. **Move a page by its corner.** Hover a project page: a *page* grip appears in its top-right
    corner. Drag it onto the left half of another page and a bar should mark where it will land; drop
    and the pages reorder. Try it across projects too. Dropping a page back where it was should do
    nothing at all — no jump, no undo step.
16. **Type on the page.** Click a section, then click into its heading, a caption or its body and type.
    The words should appear on the page as you type, at the size they will print, with no reload.
    Clicking into text must *not* re-select the section or start dragging it.
17. **Import a picture into a frame.** Each empty frame has *add a picture*. Pick a file: it should
    appear in *that* frame rather than at the end, and the same picture should now be in the store,
    ready to drag into another section without importing it twice.
18. **Start a page from a layout.** *New page* → *Three across, one big below*. A page should appear
    with three thirds and a full-width section, empty, each with its own *add a picture*. Press width
    ⅔ on one and check it can be set by hand — the menu only offers widths you can rebuild yourself.
19. **Put the text beside the frame.** On the panel: *text sits* → **right**, and *set as* → **bullets**
    on a section with several lines of body text. The words should move into a column on the right and
    each line should become a bullet — and *See it printed* should show the same in the PDF.
20. **Move a section to another page.** Drag a section onto a *different* page and drop it: it should
    land there. The panel's *move to page* list should do the same without dragging, across projects too.
21. **Add a panel behind the sections.** Each page's controls have **panel** and **line**. Add a panel:
    a wash rectangle should appear behind the content, selected, with corner handles. Drag it and its
    corners: it should snap to the same twelve columns the sections use, so you can line it up with a
    third or a quarter exactly. It must not move the sections — it is a layer, not a box.
22. **Tone it, label it.** On the panel's panel, press **tint**, give it a label ("Before"), and check
    the label is set in the tone's own ink on screen and in *See it printed*. Try **line** for a
    divider, and **outline** to leave the page showing through.
23. **One undo, one step.** Drag a pad around and press ⌘Z once: it should go back in one step, not
    a hundred. Press the tone it is already using and press ⌘Z: nothing should change, because that
    press cost no step.
24. **Drag to rearrange.** Drag one block onto another on the same page: it should take that block's
    place. ⌘Z should put it back, ⇧⌘Z should redo it, and the undo button should light up.
25. **Drag in from the store.** Drag an image from the store onto a block — it should land there
    ("Placed."). Then drag one onto the empty part of a page: a cards section should appear for it,
    and one ⌘Z should remove that whole section.
26. **Describe a photo.** Type into *Description for cards…* in the store, then look at a cards page:
    the line should appear under that photograph. Now type a different caption on the page itself and
    check the page shows yours — and that the store's description is unchanged.
27. **Rename and reorder.** Click a page title and type over it; drag pages via the list, or use the
    arrows. Move a whole project up and down with the arrows in its header, or **drag the handle** in
    the header — a dashed outline should show where it will land. The header tally (*cover + 4 pages +
    2 flip pages*) should follow.
28. **Delete anything.** A section, a page (from the page itself, *delete this page*), a block, a
    project. Deleting the last page of a project should work and leave it saying *0 sections* with a
    *New page* button beside it — it used to refuse silently, which read as a broken button.
29. **Add a page and arrange it empty.** *New page* → *Empty page* should add a page you can see, with
    nothing on it, ready for *+ add a section to this page…*. Reloading should keep it. ⌘Z should bring
    back anything you deleted.
30. **Re-present.** Pick *Before / after, page flip* on the pair block: two flip pages should appear
    in the workspace. Switch to *Two frames side by side* and the placed assets should survive.
31. **Unplace.** Press the × on an asset chip: it leaves that page only, and shows up again in
    *Place N unplaced*.
32. **The clipboard starts empty, and stays empty until you put something in it.** Open the page with
    nothing imported: it should say *Nothing in the clipboard yet* and offer exactly two ways in —
    **Import images** and **Add snippet**. There must be no *Seed text from Master Profile* button, no
    **Pair the two selected**, no *Attach text to image*, no *Add metric*, no *Add link* and no
    *Saved sections* group: those were things the panel offered to make, and none of them are images or text.
33. **Save a snippet, then place it.** Press **Add snippet**, paste a paragraph (**Paste** reads your system
    clipboard into the field), press **Save snippet**: it should appear under *Text modules*, named from its
    first line. Drag it onto a section — its words should join that section's words, with a blank line
    between them, and the section's own text should still be there. Drag it onto the empty part of a page and
    it should arrive as a text section of its own. **copy** on an item puts it back on your system clipboard.
33b. **Keep words off a page.** Highlight a sentence inside any section and press **Save highlighted text**
    in the clipboard — the button should name how many words it will keep, and be unavailable with nothing
    highlighted. The sentence should appear as a new text module, and the page should be unchanged.
34. **Edit the cover.** Click into the cover's title, standfirst and name and type — the header's title
    should change as you do. Add a cover picture, then press × on one to take it off, and *See it
    printed* to check the file agrees. **The × has to actually remove it**: a picture also placed in a
    section must not come back onto the cover, and the slot it left should stay empty (a panel you can
    fill again) rather than the other two slots sliding along.
35. **Check the page boundary.** Nothing that modifies a page should be drawn *on* it: a page card is the
    document and nothing else. Every control — the page's own, a section's, a pad's — is in the left panel
    beside the pages, and the only things left on a card are the marks that belong there: the drag handle in
    its corner, and the placeholder when you drag something over it.

36. **Go back to a pad you placed earlier.** Click the panel you made in step 21 — an *old* one, not one
    you just made: its controls must stay open after you release the mouse, and it must still drag. This
    step caught the worst bug in the pad layer: a pad you had just created kept its controls and an old
    one lost them on release, because a click that drifted a pixel was treated as a drag and the browser
    handed the release's click to the page instead of the pad.
37. **Change one page's layout.** Press **layout** under a page — not *New page*, which makes a page —
    and pick *Three across, one big below*. That page alone should take the shape, keeping every
    picture, word and number it held, and filling in the fourth section empty if it needed one. **The
    other pages must not move at all.** Press the same layout again and press ⌘Z: nothing should change,
    because it was not an edit.

38. **Everything is on the left now.** The left panel holds **text style**, **line style** and **pad style**,
    then the controls for the page you are working on — *section*, *of a kind…*, *layout*, *panel*, *line*,
    *spread over the page*, *read this page*, *delete this page*. Click a page on the canvas and the panel
    should follow it: the header should say the page number you clicked. There is **no style bar above the
    pages** any more: the styles were in two places, and the one above the pages is gone. Nothing that
    modifies a page should be under the page either.
38b. **The panel is a rail, and it takes width off the pages.** Scroll the pages up and down: the panel must
    stay pinned to the left, above the pages and never over the top of one (it used to be stacked *above* the
    grid, which pushed the pages down and floated over them as you scrolled). Opening it should make the pages
    narrower and closing it should hand the width back — exactly what the clipboard on the right does. Press
    the collapse arrow: it should fold to a **narrow tab down the side** reading *style & page*, not to a
    button at the top of the page, and pressing that tab should bring it back.
38c. **Two across, and the pages stay the size they were.** Pages sit **two to a row** — and they should not
    have grown when the third column went away: the extra room is for the panels, so opening both panels
    should take room off the *empty space* beside the pages rather than shrinking a page that had just been
    enlarged. Collapse both rails and the pages should fill the window without becoming posters.
39. **Select a section and the panel changes.** Click a section: the panel should show *its* controls —
    presentation, width, frames across, frames it holds, height, text sits, set as, move, **Save as text
    module** (only when the section has words), Delete section — in the same panel, above the page's own
    controls. Click a pad and it shows the pad's.
40. **Style three words, not a whole field.** On a page, highlight *Selected Work* in a heading — just those
    two words — and set **text style** in the left panel to **label**. Only those words should change: small,
    spaced out, capitals, in the accent, while the rest of the heading stays a heading. Set it back to
    **as designed** and they go back, with nothing else moving.
41. **Type into any page, without selecting anything first.** Click into the cover's title and type — it must
    work, first try, with nothing selected beforehand (the cover has no sections to select, which is what
    made it uneditable before). Same on a page you have never clicked: its heading, its line, a section's
    words, a caption. **If it is on the page, you can type in it.**
42. **Set how thick a line is.** Select a line and use **line style**: *hairline*, *thin*, *medium*, *bar*.
    The line on the page and in the PDF should be that thickness.
43. **Set how round a panel is.** Select a panel and use **pad style**: *square*, *soft*, *round*, *pill*.
    The corners on the page and in the file should match.
43b. **Select a pad and its controls should read.** With a pad selected, the panel should show *tone* as six
    named swatches two to a row, *fill* as filled / outline, *width* as full width | half | a third, and the
    label field across the panel's whole width — with *left 50% · top 25% · 50% wide · 4% tall* spelled out
    above them. Nothing squeezed into a strip, nothing cut off: the panel is exactly as wide as it was, and
    the controls are laid out for a narrow column rather than for the window's width.
44. **Type a pad's label on the pad.** Select a panel and type into its label where it sits on the page — the
    caret must stay put, the pad must not jump, and the panel's label field should show the same word.
44b. **Catch a line.** Add a **line** (page controls → *line*) and try to grab it: pointing *near* it should
    show a move cursor and drag it, because the line itself is about three pixels tall and the strip around
    it is the target. Selected, it should wear a dashed ring around it (not an invisible ring inside it) and
    show **two handles, one at each end** — dragging an end changes its length, not its thickness; thickness
    is **line style**. Then select it and press the **arrow keys**: it should move in fine steps, ⌥+arrow
    should move a whole column, and ⇧+arrow should resize it. Nothing should snap while you use the arrows.
45. **Name a before/after pair.** On a pair presented side by side, the two labels above the frames are
    typeable: change *Before* to *Existing* and both the page and the PDF should say so.
46. **Reach the words on a page a section owns.** Pick a pair set as *Before / after, page flip* (or a
    filmstrip): press **select the section this page belongs to** under the page, then type the label, the
    caption, the heading or the line on the page itself.
47. **Nothing is drawn in the file that you cannot see here.** The footer on every page should say the
    document's title on the left and *Page 3 of 8* on the right, **in the bottom margin** — not sitting among
    the sections. It should carry **no project names and no links**: hyperlinks are off for now, and a link
    will come back as its own hyperlink section you can add and set. Check the cover too: centred, with the
    accent rule under your name and the *1 project · First project* line.

**Then**

48. **Reload.** Everything from steps 3–47 should still be there. The document and store persist;
    image bytes live in IndexedDB.
49. **Nothing above should have needed a reload.** That is the point of this list: if any change only
    appeared after a refresh, the live-update path is broken again and the failing step is the clue.
50. **See the real file.** Press *Preview the PDF*: the panel should render the actual document —
    same page count as the header's tally, same words — and update a second or so after each change
    without you touching it. Press *read this page* on a page's caption and the viewer should open at
    that page. **Download** should write that exact file; open it and check the pages match what you
    arranged — including the pads behind the sections, and the light panels in any frames you left
    empty.
50b. **The pictures must be in the file, not just on the card.** Import a picture, drag it from the clipboard
    onto a section, then press *Preview the PDF*: the photograph has to be in the preview, in the frame you
    dropped it on, not a blank panel. This is the bug that made the workspace and the file disagree — a
    picture placed from the clipboard is an *id* on the section and its pixels come from the store, and the
    preview was asking a list that did not include it. The same goes for a picture imported straight onto the
    cover.
50c. **See where the work is.** Save two or three variants whose *location* lines differ — "Hillsboro, OR",
    "Salem, OR", "Bend, OR" and one that says "Remote" — then open \`/calendar\` and scroll to **Where you are
    applying**. The map should look like a map: streets, rivers, place labels, and the OpenStreetMap credit in
    the corner. Drag it, scroll to zoom, and press the four-arrows button — every application should fit in one
    frame, however far apart they are. Put *Portland, OR* in **Centre of the map** and press **use this**: a
    pin per application, a ring labelled 30 mi with 15 and 7.5 inside it for scale, and the count saying how
    many are inside. Now press **10 mi**: Hillsboro at 15 miles has to move out of the ring, and the count with
    it. The remote one should be listed as *no commute* with no pin, and anything the book does not know should
    sit under **Not on the
    map** with a field for coordinates — type \`45.5152, -122.6784\`, press **pin it**, and it lands exactly
    there — a ZIP code works in that field too, or a town the book has never heard of. Press **Map imagery**
    off: the tiles go, the ring and the pins stay. Reload: the centre, the radius and the view should still be
    what you left them.

50d. **See how the search is going.** Open \`/pipeline\`. With nothing saved it should say so rather than showing
    zeroes. Save a few variants, give them applied dates a few weeks back, and move one to Screen and one to
    Interview: the four numbers at the top, the funnel and the reply rate should all follow. An application out
    three weeks with no reply should be named under **No reply after 21 days**, one saved and never sent under
    **Saved, never applied**, and an archived record should be counted in the totals while being named as left
    out of the rates. Nothing on the page should offer a "days per stage" the records cannot support — there is
    no timestamp for a stage change, and the page says so rather than inventing one.

50e. **Look at the screens.** If a Chromium browser is on the machine, \`npm run verify:screens\` compares every
    screen against a baseline and writes what it saw to \`tmp/visual/latest/\`. Run it twice: the first run
    writes the baselines and reports a skip, the second should pass. Change something visible on purpose —
    a padding, a heading — and it should fail with a percentage and a red-marked picture in
    \`tmp/visual/diff/\`; then \`npm run verify:screens -- --accept-screens\` should quieten it again. With no
    browser installed it should *skip* and say which env var points it at one.

50f. **Follow a link into a record.** On the calendar, press a pin and then **open record**: the saved list
    should open with that application ringed and a banner naming it, and **show everything** should put the rest
    of the list back. On the pipeline, the rows under *Worth a look now* are links for the same reason. Then
    edit the address bar to add ?open=nonsense: the page should say the record is not there rather than hiding
    the list.

50g. **Fill in a role from the calendar.** Press **Open details** on an overdue row, or press a day and then
    **Details** on one of its events. The editor should open over the page — not navigate — showing the
    record's own applied date, contact and notes. Type the office address \`1201 SW 5th Ave, Portland, OR
    97201\`, leave the field, and reopen the editor: it should still be there. Press **find it on the map**:
    a pin line should appear under the button naming the coordinates, and the application should sit at that
    exact spot on the map below rather than at the city the ad named. Press **unpin** and reload: the map
    should fall back to the posting's own location line. On \`/saved\`, the address should be on the card
    (with *pinned* beside it while a pin is set) and **Details** there should open the same editor. Changing
    the follow-up date in the editor should move the event on the calendar, and **open the full record**
    should land on that saved entry, ringed. The same **Office address** box is on the save form itself, for
    an address you already know when you apply.

50h. **Give the document a look.** On \`/portfolio\` with the demo document loaded, open the panel and scroll
    to the foot. The three dropdowns should read *Harbour · Helvetica · Standard*, and the line under them
    should say so is the look this composer has always drawn. Choose **Plum**, then **Editorial**, then
    **Roomy**: the pages should change in the frame you choose — headings and body set in different
    typefaces, a different accent on the rules and tags, the words a little larger — and the exported PDF
    should follow, in a viewer that has never seen this app (all four pairings are built into every PDF
    reader, so nothing is downloaded and nothing is embedded). Save and reload: the look should still be
    there. Put it back to Harbour/Helvetica/Standard and the document should be what it was before, which is
    the whole point of the default being the default.

50i. **Put yourself on the cover.** With the portfolio open, scroll the panel to **who this is from** and fill
    in what you do, an email, a phone number and where you are, then add two links — one as
    \`LinkedIn | https://linkedin.com/in/you\` and one as a bare url. The cover should show the tagline under
    your name, one contact line under that, and the links in a row; the exported PDF should show the same three
    things in the same order, and the links should be clickable *in the file itself*. Now add a third line that
    is not a link — \`bad | javascript:alert(1)\` — leave the field, and the line under the box should say 2 of
    3 were kept. Clear every field: the cover should go back to exactly the page it was, with no empty contact
    line left behind.

50j. **Check a page will print sharp.** On \`/portfolio\`, put a small image on a page — a screenshot, a phone
    photograph — and open the panel. Under **print size** every frame on that page should be listed with its placed
    width and a verdict in words: *sharp at this size* for a big source, *too tight a crop for 7in* for a small
    one, with its source pixels under it. Nothing on the page changes, because this reads rather than writes. Then
    open the pad tone picker: twelve tones, in a ramp from a panel you can barely see to a near-black block, all of
    them chosen to keep their own label legible — the suite measures that contrast rather than trusting it.
50k. **Keep it in a folder.** On \`/profile\`, use **Keep it in a folder → Save to a folder…** and pick an empty
    directory. It should say it is saving to that folder. Edit something — the name in the header, a bullet, a
    stage on a saved application — and after a moment the panel should report the time of the last write. Open
    the folder in Finder: \`workspace.json\` should be there, and once a portfolio picture has been imported, an
    \`images/\` directory with the bytes in it. Reload the page: it should reconnect to the folder by itself.
    Rename the folder in Finder and edit something: the panel should say the last write failed rather than
    quietly doing nothing. Then, in a fresh browser profile (or after **Reset profile**), **Open a workspace
    folder…** on it: the whole workspace should come back, pictures included. Finally, in Safari or Firefox the
    panel should say that this browser cannot write to a folder, with the buttons visible but disabled, and
    Export/Import left to do the job by hand.

51. **Check the resume side is untouched.** \`/\` still tailors, \`/calendar\` still lists
    follow-ups, and the resume PDF still exports as one page.
`.trim();

const GAPS = `
- **The details editor is checked by hand, not by the suite.** It opens in a radix portal, and a portal does
  not mount in the jsdom harness: radix decides whether it has a browser when its module first loads, which is
  always before a test has set a window. So the *rules* the dialog draws — what a blank field clears, where a
  lookup is sent, and what storing the answer looks like — are pure functions in \`lib/applicationDetails.ts\`
  and are checked directly, and what the dialog looks like is on the manual list at step 50g.
- **The contact block belongs to the cover and nowhere else.** There is no separate contact page and no
  per-project credits line: the tagline, the ways to reply and up to six links live on the first page, which is
  what a reader needs in order to act and the only place they are guaranteed to see. A credits block per project
  would be the same fields in a second place, and the honest version of that is a decision about what belongs
  with the work rather than about where to type it.
- **Two things in a portfolio keep their own colours and sizes under a look.** The six pad tones are page
  furniture and stay as they are, including the two pale washes, which are navy-tinted whatever the palette
  is; and a text style chosen *by hand* on a slot keeps the size and family the style table gives it, because
  an override that quietly changed size with the document would be a surprise rather than a convenience.
  Everything else follows the document — every palette role, the typeface pairing, and every size the file
  draws.
- **The 3-D turn / GIF is not built.** A PDF cannot animate: no scripting in most viewers, no scroll
  events over an image, and no GIF playback in Preview, Chrome or on a phone. The honest version is a
  click-through sequence — one page per frame with a link that steps to the next, looping — which is
  the flip's machinery pointed at 24 frames. Parked on purpose, not forgotten.
- **Pads do not follow the sections** they group: sections re-flow when you move them, and a pad stays
  where it was put. The pad panel says so. Binding a pad to a row is real work and a real trade, and
  it wants a decision rather than a guess.
- **A section is nudged by its pills, not by the arrow keys.** The arrows move the *selected pad* only; a
  section's width is still the ¾ / ⅔ / ½ / ⅓ / ¼ pills, and moving it is dragging it. The same arrows for a
  section are the obvious next step, and they would want the same decision the pads had: fine steps or the
  grid.
- **The cover follows the work until you touch it.** With no cover pictures chosen, the cover shows the first
  frames of the work — so dragging a picture into the first section puts it on the cover too. Add a picture to
  the cover or clear one from it and that stops: from then on the cover's slots are exactly what you chose,
  empty ones included.
- **A section's width is pressed, not dragged.** The pills cover ¾ / ⅔ / ½ / ⅓ / ¼ and the row rule
  does the rest; a corner handle that snaps to those steps is not built.
- Dragging a **pad's edge** (as opposed to a corner) does not resize it, and neither does a section's.
- **A crop is stored but nothing sets one, and the resolution warning is one page at a time.**
  \`clampCrop\`, \`sourceRect\`, \`croppedAspect\`, \`placedDpi\` and \`dpiVerdict\` are written and tested,
  and the **print size** readout on the page panel now uses the last three: every frame on the page is listed
  with its placed width, its source pixels and whether it will print sharp. What is still missing is the *tool* —
  a crop field stays at the whole frame, so both surfaces fit the picture to the frame with \`object-fit: cover\`
  and agree — which means \`renderCroppedDataUrl\`, the canvas pass that would carry exactly the cropped pixels
  into the file, is still called by nothing. Until then the honest statement is that a crop stored by an older
  version, or by hand in a backup, is *measured* correctly (the readout counts the cropped pixels) but is not yet
  drawn differently by either surface.
- **Writing to a folder is a browser feature, so the suite cannot exercise it.** \`showDirectoryPicker\` does
  not exist in jsdom, so the picking, the permission prompt and the writes themselves are on the manual list at
  step 50k. What the suite does hold is everything around them: the file names (including one that cannot
  escape the folder it is written into), the shape of the bundle that goes in the file, and the fallback the
  panel shows in a process that genuinely cannot write files — which is also Safari's and Firefox's situation,
  not a bug.
- **The preview is one document, not one page.** *Preview the PDF* renders the whole file, live, and jumps to
  the page you asked for; a per-page live preview beside each card is not built. It would be the same renderer
  with a different page range, and it is a decision about cost (one more render per visible page) rather than
  about fidelity.
- **The map's imagery comes from one third party, so the area you are looking at is visible to it.** Tiles need
  a tile server, and this app ships no road data of its own; OpenStreetMap is the only source that needs no
  key, no account and no bill. The pins, the ring and every distance are computed on this machine and no
  request contains anything about an application — but the *place you are looking at* does travel, which is
  what a map is. **Map imagery** turns the tiles off, and the map keeps working. This is one person's map on
  OSM's public tile server, which is what its usage policy is for; anything shared or published would want its
  own tiles.
- **The place lookup is this app's one network call, and a place the book does not know waits on it.** A city
  the book knows — about 170 of them, plus every state's centre — is instant and offline. A ZIP code, a street
  address, or a suburb the book has never heard of goes to OpenStreetMap's Nominatim and is remembered from
  then on, so each place is asked for once and works offline afterwards. A machine with no network still has
  the book, the pins, the ring and every list, and can still be pinned by coordinates — which beat the lookup.
- **Distances are straight lines, not road distances.** Portland to Bend reads 121 miles across the mountain,
  not the 160 by road, because this is a map and not a router.
- **The screenshot check needs a browser, and only sees first-run screens.** It drives a Chromium binary from
  the command line, so on a machine without one it skips and says which env var points it at one. Each capture
  uses a throwaway profile, which keeps it deterministic but means the pictures are the *empty* states: a
  populated portfolio, a pipeline with forty applications and a map with pins are on the manual list, not in the
  baselines. Baselines live under tmp/visual/, so clearing that folder re-seeds them.
- **The pipeline board counts what the records say, and no more.** Nothing stores *when* a stage changed, so
  there is no days-per-stage and no time-to-reply: the board measures how long each application has been *out*,
  which is the one duration the records actually contain. Archived applications are counted in the totals and
  left out of every rate, because archiving says the search moved on rather than how far that one got. And the
  reply rates by match score are a mirror rather than a proof — at one person's scale they say where to look,
  not what caused what.
- The preview is the real file; the **page cards** are still HTML — same plan, same order, same sizes,
  drawn with web layout. Type sizes and crops on the cards are indicative; the preview and the files in
  \`tmp/pdf-check/\` are the ground truth for those. The same goes for the six text styles: the card shows
  a \`label\` at 9px where the file draws it at 10pt, and the *arrangement* is what the card is for.
- **The six styles cover headings and the tag, not every word.** A paragraph's look is still the section's
  *set as* setting (paragraph, lead, bullets); a style chosen over a highlight overrides the type of that
  stretch, and there is no "plain" entry in the dropdown, because plain is the absence of a choice.
- **A styled stretch is a range, not mark-up.** The words stay plain — searchable, extractable — and a
  range is *trimmed*, not re-anchored, when the words are edited: typing inside a styled stretch keeps it
  where it was rather than following the words. Re-anchoring on edit is real work and is not built.
- **Hyperlinks are out of scope for now.** The file's footer used to draw the projects as link annotations and
  the card dressed them up as links, which could only ever look like a link that does not work — so both are
  gone: the footer is the document's title and the page number, on both surfaces. A link comes back as its
  own **hyperlink section**: a section with an address and its own settings, added deliberately rather than
  done automatically. The document's outline (bookmarks) is unaffected.
- **A page's text is editable wherever it is, with one exception.** Type into any heading, line, caption or
  number on any page, with nothing selected — but a *pad's* label is typed once the pad is selected, because
  a pad is dragged by its body and one press has to mean one thing at a time.
- **The panel's target is the page you are on.** It follows your click and your selection; there is no
  separate "current page" to set, and no per-page strip any more.
- Pages move within and between projects, but **projects cannot be dragged** relative to each other in
  the workspace (the list has arrows).
- **The clipboard holds images and text modules, and nothing else.** Two ways in, both explicit: **Import
  images**, and **Add snippet** (typed, pasted, or highlighted on a page and kept). Before/after pairs, metrics,
  links and saved sections cannot be made from it any more — a number and a link belong to the section they are
  set on, and a section is rearranged by dragging it rather than by saving a copy. Sections that already
  reference a pair, number or link still print them, and the panel says so rather than hiding them.
- Tags cannot be edited after import, and an item cannot be renamed in the clipboard.
- A template chooses the starting shape only. A *page* can be re-laid out (**layout** under any page)
  and every other page is left alone; re-templating a whole **project** is still not offered, because it
  would mean deciding what happens to the pages and pads already there.
- PDF still has no draggable before/after slider — \`PORTFOLIO_CAPABILITIES\` marks it impossible, and
  the side-by-side pair and the page flip are the honest substitutes.
`.trim();

function writeReport(): string {
  const failed = results.filter((result) => result.status === "fail").length;
  const skipped = results.filter((result) => result.status === "skip").length;
  const stats = libraryStats(demoLibrary);
  const lines = [
    "# Career Matrix — test package",
    "",
    `Run ${new Date().toISOString()} · node ${process.version} · ${
      failed ? `**${failed} failing**` : "all checks passed"
    }${skipped ? ` (${skipped} skipped)` : ""}`,
    "",
    "## Checks",
    "",
    "| Check | Result | Detail | Time |",
    "|---|---|---|---|",
    ...results.map(
      (result) => `| ${result.name} | ${MARK[result.status]} | ${result.detail} | ${result.ms} ms |`,
    ),
    "",
    "## Generated files",
    "",
    "| File | Size |",
    "|---|---|",
    artifacts(),
    "",
    "The PDFs in `tmp/pdf-check/` are real artifacts: open them in Preview, and in Acrobat if you",
    "have it, to see the page transitions actually glide.",
    "",
    "## What this run confirmed about the demo content",
    "",
    `- ${demoPages.length} pages planned from the demo document, ${demoPages.filter((page) => page.kind === "flip").length} of them flip pages (none until the pair is placed by hand).`,
    `- The store holds ${stats.total} assets across ${Object.values(stats.byKind).filter(Boolean).length} kinds.`,
    "- The metrics sections resolved their numbers from the store rather than carrying copies.",
    "",
    "## Presentation options and what they can promise",
    "",
    "| Option | Takes its own pages | Capability | Support |",
    "|---|---|---|---|",
    capabilityTable(),
    "",
    "## Checks only a person can make",
    "",
    MANUAL_CHECKS,
    "",
    "## Known gaps, so a failed step is a bug rather than a surprise",
    "",
    GAPS,
    "",
  ];
  const path = join(OUT, "REPORT.md");
  writeFileSync(path, lines.join("\n"), "utf8");
  return path;
}

let demoLibrary: MediaLibrary = createMediaLibrary();
let demoPages: ReturnType<typeof planPortfolio> = [];

async function main() {
  mkdirSync(OUT, { recursive: true });

  results.push(run("Type check", "npx", ["tsc", "--noEmit", "--noUnusedLocals"]));
  results.push(run("Engine suite", "npm", ["run", "verify"]));
  results.push(run("PDF artifact suite", "npm", ["run", "verify:pdf"]));
  results.push(...(await checkRoutes()));
  results.push(checkPngReading());
  results.push(...(await checkScreensAndStub()));

  // The demo document is planned for real, so the fixtures double as a check that the store
  // feeds the planner: those metrics sections carry no numbers of their own.
  const demo = demoContent();
  demoLibrary = demo.library;
  demoPages = planPortfolio(demo.portfolio, demo.library);
  const metrics = demoPages.flatMap((page) => page.blocks).find((block) => block.kind === "metrics");
  results.push({
    name: "Demo document builds from the store",
    status: demoPages.length === 4 && (metrics?.metrics?.length ?? 0) === 2 ? "pass" : "fail",
    detail: `${demoPages.length} pages · ${metrics?.metrics?.length ?? 0} metrics resolved`,
    ms: 0,
  });

  writeFileSync(
    join(OUT, "portfolio-demo-backup.json"),
    JSON.stringify(
      {
        app: "career-matrix",
        version: 1,
        exportedAt: new Date().toISOString(),
        profile: createSeedProfile(),
        draft: DEFAULT_DRAFT,
        applications: [],
        portfolio: demo.portfolio,
        mediaLibrary: demo.library,
      },
      null,
      2,
    ),
    "utf8",
  );
  // Two identical frames in different colours, so "before" and "after" are obviously different.
  writeFileSync(join(OUT, "before-ceiling-void.png"), makePng(1200, 800, [90, 100, 120]));
  writeFileSync(join(OUT, "after-ceiling-void.png"), makePng(1200, 800, [15, 118, 110]));

  const report = writeReport();
  const width = Math.max(...results.map((result) => result.name.length));
  console.log(
    `\n${results.map((result) => `  ${MARK[result.status]}  ${result.name.padEnd(width)}  ${result.detail}`).join("\n")}`,
  );
  console.log(`\n  report    ${report.replace(`${process.cwd()}/`, "")}`);
  console.log("  fixtures  tmp/test-package/portfolio-demo-backup.json + 2 PNGs");

  const failed = results.filter((result) => result.status === "fail").length;
  console.log(
    `\n  ${failed ? `FAIL — ${failed} of ${results.length} checks failing` : `PASS — ${results.length} checks`}\n`,
  );
  process.exit(failed ? 1 : 0);
}

void main();
