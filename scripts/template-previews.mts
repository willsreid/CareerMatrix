/**
 * Template previews: what each starting layout actually occupies.
 *
 * "Space implied" is a page-plan question, so this renders each template to a real PDF with
 * placeholder frames — one flat colour per image, with a band across the upper third so a frame's
 * orientation is visible when a crop or a flip moves it — and prints the page plan next to it.
 *
 * The point is to see the shape before committing: which sections share a page, which take one of
 * their own, where a wide page appears, and how much of a frame is left after the margins.
 *
 *   npm run preview:templates
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";

import { buildPortfolioPdfDocument } from "../components/PortfolioPdfDocument";
import {
  addAsset,
  createMediaLibrary,
  imageAsset,
  metricAsset,
  pairAsset,
  textAsset,
  updateAsset,
  type MediaLibrary,
} from "../lib/mediaLibrary";
import { createPortfolio, planPortfolio, type PlannedPage } from "../lib/portfolio";
import { PORTFOLIO_TEMPLATES, applyTemplate, templatePreview } from "../lib/portfolioTemplates";
import { withPageTransitions } from "../lib/pdfPatch";
import { placeholderColour, pngDataUrl } from "./fixturePng.mts";

const OUT = join(process.cwd(), "tmp", "template-previews");

/** A frame reference whose pixels exist, so the preview shows real images rather than gaps. */
function placeholder(index: number): { id: string; name: string; width: number; height: number; crop: { x: number; y: number; w: number; h: number } } {
  const shape = index % 3 === 0 ? { width: 1600, height: 1000 } : index % 3 === 1 ? { width: 1000, height: 1400 } : { width: 1400, height: 1400 };
  return {
    id: `ph-${index}`,
    name: `frame-${String(index + 1).padStart(2, "0")} (${shape.width}×${shape.height})`,
    ...shape,
    crop: { x: 0, y: 0, w: 1, h: 1 },
  };
}

/**
 * Enough placeholders to overfill the largest template, so the preview also shows what happens to
 * the work that does not fit a slot.
 */
function previewLibrary(): { library: MediaLibrary; images: Record<string, string> } {
  let library = createMediaLibrary();
  const images: Record<string, string> = {};

  // Descriptions as well as frames: a cards page with no lines under it would not show what the
  // layout is for, and the description is the half of a card that is easy to forget.
  const subjects = [
    "Ceiling void, week 1",
    "Riser through the plant deck",
    "Cable tray, level 4",
    "Plant room, east wall",
    "Service corridor, looking west",
    "Roof plant, late",
    "Switch room, labelled",
    "Ductwork, above the grid",
    "Fabrication drawing issued",
    "Prefab rack, off site",
    "Clash report, resolved",
    "Sign-off walk, level 2",
    "Existing services, stripped",
    "Floor box, coordinated",
  ];

  for (let index = 0; index < 14; index += 1) {
    const reference = placeholder(index);
    library = addAsset(library, imageAsset(reference));
    library = updateAsset(library, reference.id, { description: subjects[index] ?? reference.name });
    images[reference.id] = pngDataUrl(600, 400, placeholderColour(index));
  }

  const before = placeholder(20);
  const after = placeholder(21);
  library = addAsset(library, pairAsset(before, after, { beforeLabel: "Week 1", afterLabel: "Week 6" }));
  images[before.id] = pngDataUrl(600, 400, placeholderColour(20));
  images[after.id] = pngDataUrl(600, 400, placeholderColour(21));

  library = addAsset(
    library,
    textAsset(
      "Four trade packages shared one model. Weekly clash runs caught the ductwork against the ceiling void six weeks before install.",
      "Clash narrative",
    ),
  );
  library = addAsset(library, textAsset("The point was never the model.", "Pull quote"));
  for (const [label, value] of [
    ["clashes resolved", "1,240"],
    ["weeks saved", "6"],
    ["hours of take-off removed", "180"],
    ["trade packages", "4"],
  ]) {
    library = addAsset(library, metricAsset({ label, value }));
  }

  return { library, images };
}

function inches(points: number): string {
  return (points / 72).toFixed(1);
}

/** A page in words: what is on it and how much of it, which is the "space implied" question. */
function describe(page: PlannedPage): string {
  const bits: string[] = [];
  if (page.kind === "cover") return "cover · title, subtitle, project list";
  if (page.kind === "flip" && page.flip) {
    return `${page.flip.label} · one frame full width, its own page`;
  }
  if (page.kind === "filmstrip") {
    const count = page.frames?.length ?? 0;
    return `${count} frame${count === 1 ? "" : "s"} in a row across the wide page`;
  }
  for (const block of page.blocks) {
    const frames = block.images.length;
    const numbers = block.metrics?.length ?? 0;
    const parts = [block.presentation ?? "inferred"];
    if (frames) parts.push(`${frames} frame${frames === 1 ? "" : "s"}`);
    if (numbers) parts.push(`${numbers} numbers`);
    if (!frames && !numbers) parts.push(block.body ? "text only" : "headed, nothing placed");
    bits.push(parts.join(" · "));
  }
  // The section's own body is what the page shows under the heading, and it is the reason such a
  // page exists at all.
  if (page.body?.trim()) bits.push(`heading + “${page.body.trim().slice(0, 48)}…”`);
  return bits.join("  +  ") || "empty";
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { library, images } = previewLibrary();
  const table = ["| Template | Sections | Pages | Page sizes | Frames placed |", "|---|---|---|---|---|"];

  for (const template of PORTFOLIO_TEMPLATES) {
    const project = applyTemplate(template, { name: template.name, library, id: `pr-${template.id}` });
    const portfolio = createPortfolio({
      title: template.name,
      subtitle: "Starting layout",
      author: "Preview",
      projects: [project],
    });
    const pages = planPortfolio(portfolio, library);
    const rendered = await renderToBuffer(
      // The store goes with the document, or the render plans a different one.
      buildPortfolioPdfDocument({ portfolio, images, library }),
    );
    // Same post-processing an export does, so the preview shows the real thing.
    writeFileSync(
      join(OUT, `${template.id}.pdf`),
      Buffer.from(withPageTransitions(rendered.toString("latin1")), "latin1"),
    );

    const sizes = [...new Set(pages.map((page) => `${inches(page.width)}×${inches(page.height)}in`))];
    const frames = pages.reduce(
      (total, page) =>
        total +
        (page.frames?.length ?? 0) +
        (page.flip ? 1 : 0) +
        page.blocks.reduce((count, block) => count + block.images.length, 0),
      0,
    );
    table.push(
      `| ${template.name} | ${project.slides.length} | ${pages.length} | ${sizes.join(", ")} | ${frames} |`,
    );

    console.log(`\n${template.name}  —  ${template.summary}`);
    console.log(`  ${project.slides.length} sections, ${pages.length} pages`);
    for (const page of pages) {
      console.log(
        `    p${String(page.pageNumber).padStart(2)}  ` +
          `${inches(page.width)}×${inches(page.height)}in  ` +
          `${page.title.slice(0, 20).padEnd(21)} ${describe(page)}`,
      );
    }
  }

  // A page-by-page index, because a list of file names in a terminal is not how anyone checks a
  // layout: open this and every template is one scroll away.
  writeFileSync(
    join(OUT, "index.html"),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Template starting layouts</title>
<style>
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 24px; background: #f6f7f8; color: #111; }
  h1 { font-size: 20px; } h2 { font-size: 15px; margin: 28px 0 6px; }
  p { max-width: 70ch; color: #444; }
  iframe { width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 6px; background: #fff; }
</style>
</head>
<body>
<h1>Template starting layouts</h1>
<p>Each template applied to the same store of placeholder work: 14 frames, one before/after pair,
two captions and four numbers — deliberately more than any template's slots, so the overflow rows
appear too. Every page is a real rendered page with real (placeholder) images.</p>
${PORTFOLIO_TEMPLATES.map(
  (template) =>
    `<h2>${template.name}</h2><p>${template.summary} <em>${templatePreview(template)}</em></p>` +
    `<iframe src="${template.id}.pdf" title="${template.name}"></iframe>`,
).join("\n")}
</body>
</html>
`,
    "utf8",
  );
  console.log(`\nOpen tmp/template-previews/index.html to page through all four.`);
}

void main();
