/**
 * PDF export verification.
 *
 *   npm run verify:pdf
 *
 * Renders the real react-pdf document (the exact code the Download PDF button
 * runs) for every sample posting at every tailoring band, writes the files to
 * ./tmp/pdf-check, and asserts that each one is a valid single-page PDF.
 *
 * One page is the product promise, so it is asserted here on the actual bytes
 * rather than on the estimator's opinion.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { renderToBuffer } from "@react-pdf/renderer";

import { buildResumePdfDocument, buildCoverLetterPdfDocument } from "../components/ResumePdfDocument";
import { createSeedProfile } from "../lib/masterProfileSeed";
import { analyzeJobPosting } from "../lib/keywordAnalyzer";
import { RESUME_SECTIONS, tailorResume } from "../lib/resumeTailorer";
import { applyEdits } from "../lib/resumeEdits";
import { generateCoverLetter } from "../lib/coverLetterGenerator";
import { SAMPLE_POSTINGS } from "../lib/samplePostings";

let failures = 0;
let checks = 0;

function check(label: string, condition: boolean, detail = "") {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Pulls the decompressed page content streams out of a PDF and decodes the text
 * operators, so the text an ATS parser will actually see can be asserted on.
 *
 * react-pdf writes glyphs as hex strings inside TJ arrays (`[<52> -21 <65>] TJ`),
 * so decoding means concatenating those runs. `spaced` joins each run with a
 * space, which is what makes multi-word phrase matching reliable across the
 * kerning splits.
 */
function extractText(bytes: Buffer): { flat: string; spaced: string } {
  const raw = bytes.toString("latin1");
  const chunks: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw)) !== null) {
    const body = Buffer.from(match[1], "latin1");
    let text = "";
    try {
      text = inflateSync(body).toString("latin1");
    } catch {
      text = match[1];
    }
    if (text.includes("TJ") || text.includes("Tj")) chunks.push(text);
  }

  const runs: string[] = [];
  for (const chunk of chunks) {
    // Hex glyph runs: <5265> or <52> <65> separated by kerning numbers.
    const hex = /<([0-9A-Fa-f][0-9A-Fa-f\s]*)>/g;
    let hit: RegExpExecArray | null;
    while ((hit = hex.exec(chunk)) !== null) {
      const digits = hit[1].replace(/\s+/g, "");
      let decoded = "";
      for (let i = 0; i + 1 < digits.length; i += 2) {
        decoded += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
      }
      if (decoded) runs.push(decoded);
    }
    // Literal strings, in case a font is written the other way round.
    const literal = /\(((?:\\.|[^()\\])*)\)/g;
    while ((hit = literal.exec(chunk)) !== null) {
      runs.push(hit[1].replace(/\\([()\\])/g, "$1"));
    }
  }

  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  return { flat: normalize(runs.join("")), spaced: normalize(runs.join(" ")) };
}

function containsText(haystack: { flat: string; spaced: string }, needle: string): boolean {
  const target = needle.replace(/\s+/g, " ").toUpperCase();
  return haystack.spaced.toUpperCase().includes(target) || haystack.flat.toUpperCase().includes(target);
}

/** Every decompressed stream in a file, for asserting on drawing operators rather than on words. */
function contentStreams(bytes: Buffer): string {
  const raw = bytes.toString("latin1");
  const chunks: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(raw)) !== null) {
    try {
      chunks.push(inflateSync(Buffer.from(match[1], "latin1")).toString("latin1"));
    } catch {
      // Not a deflated stream (fonts, metadata); nothing to look at.
    }
  }
  return chunks.join("\n");
}

/** Decodes the hex glyph runs inside a TJ array into the text they actually draw. */
function decodeTj(array: string): string {
  let out = "";
  for (const hit of array.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const digits = hit[1].replace(/\s+/g, "");
    for (let i = 0; i + 1 < digits.length; i += 2) {
      out += String.fromCharCode(parseInt(digits.slice(i, i + 2), 16));
    }
  }
  return out;
}

/**
 * The runs drawn in the `label` style: 10pt, with 2.4pt of tracking between the letters.
 *
 * react-pdf writes tracking as the kerning numbers inside the TJ array, in thousandths of the font
 * size — 2.4pt at 10pt is `-240`, which is why this looks for that number rather than for a style
 * name. Together with the capitals in the glyphs themselves, it is what "set as the PORTFOLIO tag"
 * means in the file.
 */
function trackedRuns(bytes: Buffer): string[] {
  const lines = contentStreams(bytes).split("\n");
  const found: string[] = [];
  lines.forEach((line, index) => {
    if (!/\/F\d+ 10 Tf/.test(line)) return;
    const array = /\[([^\]]*)\]\s*TJ/.exec(lines[index + 1] ?? "")?.[1];
    if (!array || !array.includes("-240")) return;
    found.push(decodeTj(array));
  });
  return found;
}

/**
 * Where every picture is placed and how big it is, read out of the transforms.
 *
 * react-pdf writes an image as `<w> 0 0 -<h> <x> <y> cm /In Do`, so the transform says exactly how
 * wide the frame came out. That is what lets a test ask whether the *geometry* changed — whether an
 * empty frame really reserved space — instead of only asking whether some words are present.
 */
function imagePlacements(bytes: Buffer): { width: number; height: number; x: number; y: number }[] {
  const streams = contentStreams(bytes);
  const pattern = /([\d.]+) 0 0 -([\d.]+) (-?[\d.]+) (-?[\d.]+) cm\n\/I\d+ Do/g;
  const found: { width: number; height: number; x: number; y: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(streams)) !== null) {
    found.push({
      width: Number(match[1]),
      height: Number(match[2]),
      x: Number(match[3]),
      y: Number(match[4]),
    });
  }
  return found;
}

/** The frame widths in a file, smallest first — the shape of a page's grid, in numbers. */
function frameWidths(bytes: Buffer): number[] {
  return imagePlacements(bytes)
    .map((placement) => Math.round(placement.width))
    .sort((a, b) => a - b);
}

async function main() {
  const profile = createSeedProfile();
  const outDir = join(process.cwd(), "tmp", "pdf-check");
  mkdirSync(outDir, { recursive: true });

  let firstAnalysis: ReturnType<typeof analyzeJobPosting> | null = null;
  let firstResume: ReturnType<typeof tailorResume> | null = null;

  for (const [postingIndex, posting] of SAMPLE_POSTINGS.entries()) {
    const analysis = analyzeJobPosting(posting.text, profile);

    for (const intensity of [20, 60, 90]) {
      const resume = tailorResume(profile, analysis, {
        intensity,
        emphasis: "balanced",
        fontPt: 9.3,
        showKeywordMarks: true,
        layout: "page",
      });
      const fontPt = Math.min(resume.options.fontPt, 10.4);
      if (postingIndex === 0 && intensity === 60) {
        firstAnalysis = analysis;
        firstResume = resume;
      }
      const buffer = await renderToBuffer(buildResumePdfDocument({ resume, fontPt }));

      const name = `${posting.id}-i${intensity}.pdf`;
      writeFileSync(join(outDir, name), buffer);

      const bytes = buffer.toString("latin1");
      const pageCount = (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      const mediaBox = /MediaBox\s*\[([^\]]*)\]/.exec(bytes)?.[1]?.trim();
      const text = extractText(buffer);
      const label = `${posting.id} @ ${intensity}%`;

      check(`${label}: valid PDF header`, bytes.startsWith("%PDF-1."), bytes.slice(0, 8));
      check(`${label}: single page`, pageCount === 1, `${pageCount} pages`);
      check(`${label}: no embedded fonts`, !/\/FontFile/.test(bytes), "fonts must stay base-14");
      check(`${label}: no images`, !/\/Subtype\s*\/Image/.test(bytes));
      check(`${label}: has real content`, buffer.byteLength > 4000, `${buffer.byteLength} bytes`);
      check(
        `${label}: US Letter MediaBox`,
        mediaBox === "0 0 612 792",
        `MediaBox [${mediaBox}]`,
      );
      check(
        `${label}: ATS-extractable section headings`,
        RESUME_SECTIONS.every((section) => containsText(text, section)),
        RESUME_SECTIONS.filter((section) => !containsText(text, section)).join(", "),
      );
      check(
        `${label}: name and contact are extractable text`,
        containsText(text, "ALEX RIVERA") && containsText(text, "alex.rivera@example.com"),
      );
      check(
        `${label}: the matched keyword survives into the PDF`,
        containsText(text, "Navisworks"),
        "the analyzer's top hit should be present as real text",
      );

      console.log(
        `  ${name.padEnd(34)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${pageCount} page  ${mediaBox}  ${resume.options.fontPt}pt`,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Overflow safety net: a deliberately bloated profile must still render
     as a single Letter page, because the tailorer shrinks and trims before
     react-pdf ever lays it out. */
  /* ------------------------------------------------------------------ */

  const bloated = structuredClone(profile);
  bloated.roles = bloated.roles.flatMap((role) => [role, structuredClone(role)]);
  bloated.projects = bloated.projects.flatMap((project) => [project, structuredClone(project)]);
  bloated.roles[0].bullets = [...bloated.roles[0].bullets, ...structuredClone(bloated.roles[0].bullets)];

  const bloatedAnalysis = analyzeJobPosting(SAMPLE_POSTINGS[0].text, bloated);
  for (const intensity of [20, 60, 90]) {
    const resume = tailorResume(bloated, bloatedAnalysis, {
      intensity,
      emphasis: "balanced",
      fontPt: 10.4,
      showKeywordMarks: false,
    });
    const buffer = await renderToBuffer(
      buildResumePdfDocument({ resume, fontPt: resume.options.fontPt }),
    );
    const bytes = buffer.toString("latin1");
    const pageCount = (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const mediaBox = /MediaBox\s*\[([^\]]*)\]/.exec(bytes)?.[1]?.trim();
    writeFileSync(join(outDir, `bloated-i${intensity}.pdf`), buffer);

    console.log(
      `  bloated-i${intensity}.pdf${" ".repeat(18)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
        `${pageCount} page  ${mediaBox}  ${resume.options.fontPt}pt  ` +
        `(roles ${resume.roles.length}, projects ${resume.projects.length})`,
    );

    check(`bloated @ ${intensity}%: still one page`, pageCount === 1, `${pageCount} pages`);
    check(`bloated @ ${intensity}%: still Letter`, mediaBox === "0 0 612 792", `[${mediaBox}]`);
    check(
      `bloated @ ${intensity}%: trimmed rather than spilled`,
      resume.notes.some((note) => note.includes("Trimmed") || note.includes("Type size reduced")),
      resume.notes.join(" | ").slice(0, 160),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Hand edits must reach the PDF, and the cover letter must render as a
     single Letter page with its own wording. */
  /* ------------------------------------------------------------------ */

  const analysisForEdits = firstAnalysis ?? analyzeJobPosting(SAMPLE_POSTINGS[0].text, profile);
  const tailoredForEdits =
    firstResume ??
    tailorResume(profile, analysisForEdits, {
      intensity: 60,
      emphasis: "balanced",
      fontPt: 9.3,
      showKeywordMarks: false,
      layout: "page",
    });

  const editedResume = applyEdits(
    tailoredForEdits,
    {
      summary: "MARKER-SUMMARY written by hand for this posting.",
      roles: {
        [tailoredForEdits.roles[0].id]: {
          bullets: {
            [tailoredForEdits.roles[0].bullets[0].id]: {
              text: "MARKER-BULLET rewritten by hand, same font and spacing.",
            },
          },
        },
      },
    },
    { profile, analysis: analysisForEdits },
  );

  const editedBuffer = await renderToBuffer(
    buildResumePdfDocument({ resume: editedResume, fontPt: editedResume.options.fontPt }),
  );
  const editedBytes = editedBuffer.toString("latin1");
  const editedText = extractText(editedBuffer);
  writeFileSync(join(outDir, "edited-resume.pdf"), editedBuffer);

  const editedPages = (editedBytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(
    `  edited-resume.pdf${" ".repeat(20)} ${String(Math.round(editedBuffer.byteLength / 1024)).padStart(4)} KB  ` +
      `${editedPages} page  ${/MediaBox\s*\[([^\]]*)\]/.exec(editedBytes)?.[1]?.trim()}  ${editedResume.options.fontPt}pt`,
  );
  check("edited resume: still one page", editedPages === 1, `${editedPages} pages`);
  check(
    "edited resume: the hand-written summary reaches the PDF",
    containsText(editedText, "MARKER-SUMMARY"),
  );
  check(
    "edited resume: the hand-written bullet reaches the PDF",
    containsText(editedText, "MARKER-BULLET"),
  );
  check(
    "edited resume: the original text of that bullet is gone",
    !containsText(editedText, tailoredForEdits.roles[0].bullets[0].text.slice(4, 40)),
  );

  for (const intensity of [20, 60, 90]) {
    const letter = generateCoverLetter(profile, analysisForEdits, {
      emphasis: "balanced",
      intensity,
    });
    const buffer = await renderToBuffer(buildCoverLetterPdfDocument({ letter, profile }));
    const bytes = buffer.toString("latin1");
    const text = extractText(buffer);
    const pages = (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const mediaBox = /MediaBox\s*\[([^\]]*)\]/.exec(bytes)?.[1]?.trim();
    const name = `cover-letter-i${intensity}.pdf`;
    writeFileSync(join(outDir, name), buffer);

    console.log(
      `  ${name.padEnd(33)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
        `${pages} page  ${mediaBox}  ${letter.paragraphs.length} paragraphs`,
    );

    check(`${name}: single page`, pages === 1, `${pages} pages`);
    check(`${name}: US Letter`, mediaBox === "0 0 612 792", `[${mediaBox}]`);
    check(`${name}: no embedded fonts`, !/\/FontFile/.test(bytes));
    check(`${name}: salutation is extractable`, containsText(text, letter.salutation));
    check(`${name}: company is extractable`, containsText(text, letter.company));
    check(`${name}: signature is extractable`, containsText(text, profile.header.name));
    check(
      `${name}: stays under 500 words`,
      letter.paragraphs.reduce((sum, p) => sum + p.text.split(/\s+/).length, 0) < 500,
    );
  }

  /* ------------------------------------------------------------------ */
  /* The packet: resume and letter in one file, on request. Page 1 must be
     the sheet and page 2 the letter, both still exactly US Letter — the
     letter keeps 1in margins, the sheet keeps its own page box. */
  /* ------------------------------------------------------------------ */

  {
    const letter = generateCoverLetter(profile, analysisForEdits, {
      emphasis: "balanced",
      intensity: 60,
    });

    const soloBuffer = await renderToBuffer(
      buildResumePdfDocument({
        resume: tailoredForEdits,
        fontPt: tailoredForEdits.options.fontPt,
      }),
    );
    const packetBuffer = await renderToBuffer(
      buildResumePdfDocument({
        resume: tailoredForEdits,
        fontPt: tailoredForEdits.options.fontPt,
        letter,
        profile,
      }),
    );

    const packetBytes = packetBuffer.toString("latin1");
    const packetText = extractText(packetBuffer);
    const mediaBoxes = [...packetBytes.matchAll(/MediaBox\s*\[([^\]]*)\]/g)].map((hit) =>
      hit[1].trim(),
    );
    const soloPages = (soloBuffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const packetPages = (packetBytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const name = "resume-plus-letter.pdf";
    writeFileSync(join(outDir, name), packetBuffer);

    console.log(
      `  ${name.padEnd(33)} ${String(Math.round(packetBuffer.byteLength / 1024)).padStart(4)} KB  ` +
        `${packetPages} pages  ${mediaBoxes.join(" / ")}`,
    );

    check("packet: one page more than the resume alone", packetPages === soloPages + 1, `${soloPages} -> ${packetPages}`);
    check("packet: every page is US Letter", mediaBoxes.length >= 2 && mediaBoxes.every((box) => box === "0 0 612 792"), mediaBoxes.join(" / "));
    check("packet: the sheet is still page one", packetText.flat.indexOf(tailoredForEdits.header.name) === 0 || packetText.flat.indexOf(tailoredForEdits.header.name) < packetText.flat.indexOf(letter.salutation));
    check("packet: the letter's salutation is extractable", containsText(packetText, letter.salutation));
    check("packet: the letter's company is extractable", containsText(packetText, letter.company));
    check("packet: the signature is extractable", containsText(packetText, "Sincerely,"));
    // Counted on `flat`: `spaced` inserts a separator at every glyph run, so a
    // phrase that react-pdf happens to split lands as "Dear Hiring Manager ,".
    const occurrences = (haystack: string, needle: string) =>
      haystack.toUpperCase().split(needle.toUpperCase()).length - 1;
    check(
      "packet: the letter appears exactly once",
      occurrences(packetText.flat, letter.salutation) === 1,
      `${occurrences(packetText.flat, letter.salutation)} hits for "${letter.salutation}"`,
    );
    check(
      "packet: the resume is unchanged by riding with the letter",
      containsText(packetText, tailoredForEdits.header.headline) &&
        containsText(packetText, RESUME_SECTIONS[1].toUpperCase()),
    );

    /* And in continuous mode, where the sheet's own page count is not 1. */
    const continuousResume = tailorResume(profile, analysisForEdits, {
      intensity: 60,
      emphasis: "balanced",
      fontPt: tailoredForEdits.options.fontPt,
      showKeywordMarks: false,
      layout: "continuous",
    });
    const continuousSolo = await renderToBuffer(
      buildResumePdfDocument({
        resume: continuousResume,
        fontPt: Math.min(continuousResume.options.fontPt, 10.4),
      }),
    );
    const continuousPacket = await renderToBuffer(
      buildResumePdfDocument({
        resume: continuousResume,
        fontPt: Math.min(continuousResume.options.fontPt, 10.4),
        letter,
        profile,
      }),
    );
    const countPages = (buffer: Buffer) =>
      (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const continuousBoxes = [
      ...continuousPacket.toString("latin1").matchAll(/MediaBox\s*\[([^\]]*)\]/g),
    ].map((hit) => hit[1].trim());

    console.log(
      `  ${"packet-continuous.pdf".padEnd(33)} ${String(Math.round(continuousPacket.byteLength / 1024)).padStart(4)} KB  ` +
        `${countPages(continuousPacket)} pages  ${continuousBoxes.join(" / ")}`,
    );
    writeFileSync(join(outDir, "packet-continuous.pdf"), continuousPacket);

    check(
      "continuous packet: the letter still adds exactly one page",
      countPages(continuousPacket) === countPages(continuousSolo) + 1,
      `${countPages(continuousSolo)} -> ${countPages(continuousPacket)}`,
    );
    check(
      "continuous packet: every page is still US Letter",
      continuousBoxes.every((box) => box === "0 0 612 792"),
      continuousBoxes.join(" / "),
    );
    check(
      "continuous packet: the letter's own wording survives the extra pages",
      containsText(extractText(continuousPacket), letter.salutation),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Import round trip: the PDF this app exports, read back by the resume
     importer. This is the strongest available check on the import path —
     real bytes, real font encoding, real line positions. */
  /* ------------------------------------------------------------------ */

  {
    const { pathToFileURL } = await import("node:url");
    const { extractResumeText, parseResumeText } = await import("../lib/resumeImport");

    // The browser uses the bundled worker in /public; in Node pdf.js needs its
    // legacy build and an absolute worker path.
    const legacy = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof import("pdfjs-dist");
    const roundTrip = await extractResumeText(
      {
        name: "exported.pdf",
        type: "application/pdf",
        arrayBuffer: async () => editedBuffer.buffer.slice(0) as ArrayBuffer,
      },
      {
        loadPdfjs: async () => {
          legacy.GlobalWorkerOptions.workerSrc = pathToFileURL(
            join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
          ).href;
          return legacy;
        },
      },
    );
    const parsedImport = parseResumeText(roundTrip.text);
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

    if (process.env.VDCM_DEBUG_IMPORT) {
      console.log("--- extracted lines ---");
      roundTrip.text.split("\n").forEach((line, index) => console.log(`${String(index).padStart(3)}| ${line}`));
      console.log("--- parsed roles ---");
      console.log(
        JSON.stringify(
          parsedImport.roles.map((role) => [role.title, role.company, role.dates, role.bullets.length]),
          null,
          1,
        ),
      );
      console.log("--- warnings ---", parsedImport.warnings);
    }

    console.log(
      `  ${"import-round-trip.pdf".padEnd(33)} ${String(roundTrip.text.split("\n").length).padStart(4)} lines  ` +
        `${parsedImport.roles.length} roles  ${parsedImport.roles.reduce((sum, role) => sum + role.bullets.length, 0)} bullets`,
    );

    check("round trip: the file is read as a PDF", roundTrip.kind === "pdf");
    check(
      "round trip: the header survives",
      normalize(parsedImport.header.name ?? "") === normalize(editedResume.header.name) &&
        parsedImport.header.email === profile.header.email,
      `${parsedImport.header.name} / ${parsedImport.header.email}`,
    );
    check(
      "round trip: the section headings are recognised",
      ["summary", "skills", "experience", "certifications"].every((key) =>
        parsedImport.sectionsFound.includes(key as never),
      ),
      parsedImport.sectionsFound.join(", "),
    );
    check(
      "round trip: the summary comes back whole",
      normalize(parsedImport.summary) === normalize(editedResume.summary),
      `${normalize(parsedImport.summary).length} vs ${normalize(editedResume.summary).length} chars`,
    );
    check(
      "round trip: one parsed role per job on the sheet",
      parsedImport.roles.length === editedResume.roles.length,
      `${parsedImport.roles.length} vs ${editedResume.roles.length}`,
    );
    check(
      "round trip: no bullet text is lost",
      // A bullet that wraps mid-sentence is rejoined; one that wraps at a capital
      // may split in two, so the count may grow but must never shrink.
      editedResume.roles.every((role, index) => {
        const parsed = parsedImport.roles[index];
        if (!parsed) return false;
        const haystack = normalize(parsed.bullets.join(" "));
        return (
          parsed.bullets.length >= role.bullets.length &&
          role.bullets.every((bullet) => haystack.includes(normalize(bullet.text).slice(0, 60)))
        );
      }),
      `${parsedImport.roles.map((role) => role.bullets.length).join("/")} vs ${editedResume.roles.map((role) => role.bullets.length).join("/")}`,
    );
    check(
      "round trip: the hand-typed summary and bullet come back",
      normalize(parsedImport.summary).includes("MARKER-SUMMARY") &&
        parsedImport.roles.some((role) => role.bullets.some((text) => text.includes("MARKER-BULLET"))),
    );
    check(
      "round trip: the date range on the first job is captured",
      /\d{4}/.test(parsedImport.roles[0]?.dates ?? ""),
      parsedImport.roles.map((role) => role.dates || "NONE").join(" | "),
    );
    check(
      "round trip: the projects block is a project section, not extra jobs",
      parsedImport.projects.length >= 1 &&
        parsedImport.projects.every((project) => project.name.length > 3) &&
        parsedImport.projects.some((project) => project.bullets.length >= 1),
      `${parsedImport.projects.length} projects`,
    );
    check(
      "round trip: no skill term is dropped",
      parsedImport.skillGroups.reduce((sum, group) => sum + group.items.length, 0) >=
        editedResume.skillGroups.reduce((sum, group) => sum + group.items.length, 0),
      `${parsedImport.skillGroups.reduce((sum, group) => sum + group.items.length, 0)} items`,
    );
  }

  /* ------------------------------------------------------------------ */
  /* Portfolio: multi-size pages, real link annotations, an outline and
     images. This is the check that the "universal tier" claim holds —
     everything asserted here is page content a viewer must render. */
  /* ------------------------------------------------------------------ */

  {
    const { createBlock, createPortfolio, planPortfolio } = await import("../lib/portfolio");
    const { buildPortfolioPdfDocument } = await import("../components/PortfolioPdfDocument");

    // A real 2×2 PNG (generated by tmp/make-png.mjs), so the renderer embeds actual
    // image bytes rather than a stub.
    const pixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAADklEQVR4nGOYBQYMEAoAMpYHOVPwyOMAAAAASUVORK5CYII=";
    const frame = (id: string) => ({
      id,
      name: `${id}.png`,
      width: 1600,
      height: 1000,
      crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    });

    const portfolio = createPortfolio({
      title: "Selected Work",
      subtitle: "Portfolio 2026",
      author: profile.header.name,
      projects: [
        {
          id: "pr1",
          name: "Data Center Build",
          summary: "MEP coordination on a LOD 400 industrial build.",
          slides: [
            {
              id: "sl1",
              title: "Overview",
              blocks: [
                createBlock("text", { title: "Brief", body: "Four trade packages, one federated model." }),
                createBlock("image", { title: "Federated model", images: [frame("img1")] }),
                createBlock("pair", { title: "Coordination win", images: [frame("img2"), frame("img3")] }),
                createBlock("metrics", { title: "Outcome" }),
                createBlock("video", {
                  title: "Walkthrough",
                  videoUrl: "https://example.com/clip",
                  videoPoster: frame("img4"),
                }),
              ],
            },
            {
              id: "sl2",
              title: "Walkthrough",
              blocks: [
                createBlock("filmstrip", {
                  title: "Level by level",
                  images: [1, 2, 3, 4, 5, 6].map((n) => frame(`img${n + 10}`)),
                }),
              ],
            },
          ],
        },
        {
          id: "pr2",
          name: "Automation Toolkit",
          slides: [
            {
              id: "sl3",
              title: "Tooling",
              blocks: [
                createBlock("markup", {
                  title: "Where the time went",
                  images: [frame("img30")],
                  annotations: [
                    { id: "a1", kind: "box", x: 0.1, y: 0.1, w: 0.3, h: 0.2 },
                    { id: "a2", kind: "arrow", x: 0.4, y: 0.3, w: 0.3, h: 0.3 },
                    { id: "a3", kind: "circle", x: 0.6, y: 0.5, w: 0.2, h: 0.2 },
                    { id: "a4", kind: "callout", x: 0.2, y: 0.7, w: 0.2, h: 0.1, text: "manual step" },
                  ],
                }),
              ],
            },
          ],
        },
      ],
    });

    const images: Record<string, string> = {};
    for (const project of portfolio.projects) {
      for (const slide of project.slides) {
        for (const block of slide.blocks) {
          for (const image of block.images) images[image.id] = pixel;
          if (block.videoPoster) images[block.videoPoster.id] = pixel;
        }
      }
    }
    const buffer = await renderToBuffer(buildPortfolioPdfDocument({ portfolio, images }));
    const bytes = buffer.toString("latin1");
    const text = extractText(buffer);
    const expected = planPortfolio(portfolio);
    const pageCount = (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    const boxes = [...bytes.matchAll(/MediaBox\s*\[([^\]]*)\]/g)].map((hit) => hit[1].trim());
    const linkAnnots = (bytes.match(/\/Subtype\s*\/Link/g) ?? []).length;
    writeFileSync(join(outDir, "portfolio.pdf"), buffer);

    console.log(
      `  ${"portfolio.pdf".padEnd(33)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
        `${pageCount} pages  ${new Set(boxes).size} page size(s)  ${linkAnnots} links`,
    );

    check(
      "portfolio: the page count matches the plan",
      pageCount === expected.length,
      `${pageCount} vs ${expected.length}`,
    );
    check(
      "portfolio: every page is one of the two declared sizes",
      boxes.every((box) => box === "0 0 612 792" || box === "0 0 1224 792"),
      [...new Set(boxes)].join(" / "),
    );
    check(
      "portfolio: the filmstrip pages are the wide ones",
      boxes.filter((box) => box === "0 0 1224 792").length === 2 &&
        boxes.filter((box) => box === "0 0 612 792").length === expected.length - 2,
      `${boxes.filter((box) => box === "0 0 1224 792").length} wide`,
    );
    check(
      "portfolio: the footer is plain text — the title and the page number, no links",
      // Hyperlinks are out of scope for now, so the one place they used to be drawn automatically no longer
      // draws them: a project name in a footer can only ever be a dead link on a card, and there is no way to
      // *author* a link yet. A link comes back as its own hyperlink section, with its address on the section.
      containsText(text, `Page 2 of ${expected.length}`) &&
        containsText(text, portfolio.title) &&
        !/#page-/.test(bytes),
      `${linkAnnots} link annotations, footer targets: ${/#page-/.test(bytes) ? "present" : "none"}`,
    );
    check(
      "portfolio: the document carries an outline, so the nav pane lists projects",
      /\/Outlines/.test(bytes),
    );
    check(
      "portfolio: identical images are embedded once and referenced many times",
      (() => {
        const images = (bytes.match(/\/Subtype\s*\/Image/g) ?? []).length;
        // Eleven frames share one data URL, so pdfkit stores one XObject for all of them
        // — which is what keeps a photo-heavy portfolio from ballooning.
        return images === 1;
      })(),
      `${(bytes.match(/\/Subtype\s*\/Image/g) ?? []).length} image XObjects for 11 placements`,
    );
    check(
      "portfolio: the cover and slide titles are extractable text",
      containsText(text, "Selected Work") && containsText(text, "Level by level"),
    );
    check(
      "portfolio: the video block states its limitation rather than implying playback",
      containsText(text, "does not play in most PDF viewers"),
    );
    check(
      "portfolio: mark-up is drawn into the page, and says so",
      containsText(text, "drawn into the page") && containsText(text, "manual step"),
    );
    check(
      "portfolio: the outline carries project names",
      containsText(text, "Data Center Build") && containsText(text, "Automation Toolkit"),
    );

    /* -------------------- the six text styles, in the file -------------------- */
    /* A title set as the PORTFOLIO tag has to *print* as tracked capitals, and everything
       that was not touched has to print exactly as typed — which is the whole promise of a
       style being a format rather than a size. */

    {
      const styled = createPortfolio({
        title: "Studio book",
        subtitle: "Selected work",
        projects: [
          {
            id: "pr-styled",
            name: "Styled",
            slides: [
              {
                id: "sl-styled",
                title: "Selected work",
                textStyles: { title: "label" },
                blocks: [
                  createBlock("text", {
                    id: "bl-styled",
                    title: "civil engineering",
                    body: "Words that should stay as typed.",
                    span: 12,
                    textStyles: { title: "header" },
                    // Part of the heading is set as the tag: the file has to draw one line in two styles,
                    // which is what highlighting three words and choosing a style produces.
                    textMarks: { title: [{ start: 0, end: 5, style: "label" }] },
                  }),
                ],
              },
            ],
          },
        ],
      });
      const styledBuffer = await renderToBuffer(
        buildPortfolioPdfDocument({ portfolio: styled, images: {} }),
      );
      const styledText = extractText(styledBuffer);
      const tracked = trackedRuns(styledBuffer);
      writeFileSync(join(outDir, "portfolio-styles.pdf"), styledBuffer);

      console.log(
        `  ${"portfolio-styles.pdf".padEnd(26)} ${String(Math.round(styledBuffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${tracked.length} run(s) in the label style`,
      );

      check(
        "portfolio: the marked words print in capitals while the rest keeps its case",
        // Case-sensitive on purpose: `containsText` is case-insensitive by design (it matches what an
        // ATS parser sees), and here the case *is* the thing being asserted, so this reads the runs
        // directly. The space is a real glyph in the stream, which is why it appears in the flat text.
        styledText.flat.includes("CIVIL engineering") &&
          !styledText.flat.includes("civil engineering") &&
          // And the body, which nobody styled, keeps its sentence case.
          styledText.flat.includes("Words that should stay as typed."),
        `titles and body as drawn: ${styledText.flat.slice(0, 160)}`,
      );
      check(
        "portfolio: and it is drawn with the label's own tracking",
        tracked.some((run) => run.includes("CIVIL")) &&
          tracked.some((run) => run.includes("SELECTED WORK")),
        `tracked runs: ${tracked.slice(0, 4).join(" / ")}`,
      );
      check(
        "portfolio: a page heading set as a label is drawn as one, not as a 24pt header",
        tracked.some((run) => run.includes("SELECTED WORK")),
        "the cover's tag and the page's styled heading are the two tracked runs",
      );
      check(
        "portfolio: a title with a marked stretch draws one line in two styles",
        // The mark covers "civil" and the rest of the heading is a header, so the file has to carry both a
        // 10pt tracked run and a 24pt one — the two fonts the style bar produces on one line.
        styledText.flat.includes("CIVIL") &&
          styledText.flat.includes("engineering") &&
          !styledText.flat.includes("civil") &&
          tracked.some((run) => run.includes("CIVIL")) &&
          // The rest of the heading is *not* tracked: it is the header style, at 24pt.
          /\/F\d+ 24 Tf/.test(contentStreams(styledBuffer)),
        `flat: ${styledText.flat.slice(0, 120)} | tracked: ${tracked.join(" / ")}`,
      );
      check(
        "portfolio: an unstyled body keeps the words exactly as typed",
        containsText(styledText, "Words that should stay as typed"),
        "a section nobody styled must not change case",
      );
    }

    /* ---------------------- the before/after flip ---------------------- */
    /* A flipped pair becomes two adjacent pages, and the transition that makes them
       wipe is patched into the bytes — then the result is re-parsed to prove the patch
       did not corrupt the file. */

    {
      const { withPageTransitions, verifyXref, countTransitions } = await import("../lib/pdfPatch");

      const flipPortfolio = createPortfolio({
        title: "Flip Test",
        projects: [
          {
            id: "fp",
            name: "Coordination",
            slides: [
              {
                id: "fs",
                title: "The change",
                blocks: [
                  createBlock("pair", {
                    title: "Clash before and after",
                    pairMode: "flip",
                    images: [frame("flipA"), frame("flipB")],
                    beforeLabel: "Before",
                    afterLabel: "After",
                  }),
                ],
              },
            ],
          },
        ],
      });

      const flipImages = { flipA: pixel, flipB: pixel };
      const flipPages = planPortfolio(flipPortfolio).filter((page) => page.kind === "flip");
      check(
        "flip: a pair in flip mode plans exactly two pages",
        flipPages.length === 2,
        `${flipPages.length} flip pages`,
      );
      check(
        "flip: the halves stay adjacent and in before/after order",
        (() => {
          const all = planPortfolio(flipPortfolio);
          const first = all.findIndex((page) => page.kind === "flip");
          return (
            all[first].flip?.side === "before" &&
            all[first + 1]?.flip?.side === "after" &&
            all[first].flip?.pairId === all[first + 1].flip?.pairId
          );
        })(),
      );
      check(
        "flip: the pair is not also drawn inline on a section page",
        // The two halves own their pages, so nothing draws the pair a second time. The section has
        // no body of its own, so it contributes no letter page either — the flip pages are it.
        (() => {
          const pages = planPortfolio(flipPortfolio);
          return (
            pages.filter((page) => page.kind === "project").every((page) => page.blocks.length === 0) &&
            pages.filter((page) => page.kind === "flip").length === 2
          );
        })(),
      );

      const flipBuffer = await renderToBuffer(
        buildPortfolioPdfDocument({ portfolio: flipPortfolio, images: flipImages }),
      );
      const plain = flipBuffer.toString("latin1");
      check("flip: the plain render has no transitions yet", countTransitions(plain) === 0);
      check("flip: the before/after labels are extractable", containsText(extractText(flipBuffer), "Before") && containsText(extractText(flipBuffer), "After"));

      const patched = withPageTransitions(plain);
      const patchedBuffer = Buffer.from(patched, "latin1");
      const expectedPages = planPortfolio(flipPortfolio).length;
      writeFileSync(join(outDir, "portfolio-flip.pdf"), patchedBuffer);

      console.log(
        `  ${"portfolio-flip.pdf".padEnd(33)} ${String(Math.round(patchedBuffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${expectedPages} pages  ${countTransitions(patched)} transitions  xref ${verifyXref(patched) ? "ok" : "BROKEN"}`,
      );

      check(
        "flip: every planned page carries a horizontal glide",
        countTransitions(patched) === expectedPages,
        `${countTransitions(patched)} of ${expectedPages}`,
      );
      check(
        "flip: the transition is a horizontal wipe, not a cut",
        patched.includes("/S /Glide") && patched.includes("/Dm /H"),
      );
      check(
        "flip: the cross-reference table still points at real objects after patching",
        // Inserting bytes shifts every later offset, so the xref has to be rebuilt. This is
        // the assertion that the patch did not quietly corrupt the file.
        verifyXref(patched),
      );
      check(
        "flip: patching is idempotent, so a second pass cannot double the entry",
        countTransitions(withPageTransitions(patched)) === expectedPages,
        `second pass gave ${countTransitions(withPageTransitions(patched))}, expected ${expectedPages}`,
      );

      // The real integrity check: a PDF parser has to accept it and find the same pages.
      {
        const { pathToFileURL } = await import("node:url");
        const legacy = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as typeof import("pdfjs-dist");
        legacy.GlobalWorkerOptions.workerSrc = pathToFileURL(
          join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
        ).href;
        const parsedDoc = await legacy
          .getDocument({ data: new Uint8Array(patchedBuffer), useWorkerFetch: false, isEvalSupported: false })
          .promise;
        check(
          "flip: a real PDF parser reads the patched file and finds the same page count",
          parsedDoc.numPages === expectedPages,
          `${parsedDoc.numPages} vs ${expectedPages}`,
        );
        let firstPageText = "";
        for (let index = 1; index <= parsedDoc.numPages; index += 1) {
          const content = await (await parsedDoc.getPage(index)).getTextContent();
          const pageText = content.items
            .filter((item): item is typeof item & { str: string } => "str" in item)
            .map((item) => (item as { str: string }).str)
            .join(" ");
          if (index === 1) firstPageText = pageText;
        }
        check(
          "flip: and still finds the cover text, so the content stream survived",
          /Flip Test/.test(firstPageText) || /Coordination/.test(firstPageText),
          firstPageText.slice(0, 60),
        );
      }
    }

    /* ------------- a document whose content lives in the store ------------- */
    /* Every fixture above carries its images inline on the block, which is exactly why the bug
       below survived until the template previews exposed it: the renderer planned the document
       *without* the store, so a store-based export lost every filmstrip, both halves of every flip,
       and every frame — planning from ids alone draws nothing. */

    {
      const { addAsset, createMediaLibrary, imageAsset, metricAsset, pairAsset, textAsset } =
        await import("../lib/mediaLibrary");
      const { collectImages } = await import("../lib/portfolio");
      const { applyTemplate, templateById } = await import("../lib/portfolioTemplates");

      let library = createMediaLibrary();
      for (let index = 0; index < 14; index += 1) library = addAsset(library, imageAsset(frame(`st-${index}`)));
      library = addAsset(library, pairAsset(frame("st-before"), frame("st-after")));
      library = addAsset(library, textAsset("Four trade packages shared one model.", "Stored caption"));
      for (const [label, value] of [["clashes resolved", "1,240"], ["weeks saved", "6"]]) {
        library = addAsset(library, metricAsset({ label, value }));
      }

      const project = applyTemplate(templateById("case-study")!, {
        name: "Stored work",
        library,
        id: "pr-stored",
      });
      const stored = createPortfolio({ title: "Stored work", projects: [project] });
      const planned = planPortfolio(stored, library);

      // One data URL for every frame: react-pdf shares an XObject, so the count is not the point —
      // whether any pixels were embedded at all is.
      //
      // Collected with **the same function the preview uses**, from the plan and the store together, rather
      // than by hand from the block's own images. That is the difference the app got wrong: a picture placed
      // from the clipboard is an asset id on the section, so a hand-rolled walk over `block.images` and a
      // call to `collectImages(portfolio)` without the library both come to an empty map — and the file then
      // draws a blank frame where the workspace shows a photograph.
      const images: Record<string, string> = {};
      for (const image of collectImages(stored, library)) images[image.id] = pixel;

      const buffer = await renderToBuffer(
        buildPortfolioPdfDocument({ portfolio: stored, images, library }),
      );
      const rendered = buffer.toString("latin1");
      const filePages = (rendered.match(/\/Type \/Page\b/g) ?? []).length;
      writeFileSync(join(outDir, "portfolio-stored.pdf"), buffer);

      console.log(
        `  ${"portfolio-stored.pdf".padEnd(33)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${filePages} pages  ${planned.filter((page) => page.kind === "filmstrip").length} filmstrips  ` +
          `${planned.filter((page) => page.kind === "flip").length} flip pages`,
      );

      check(
        "store: the file holds exactly the pages the editor planned",
        // If the export plans without the store this drops below the plan, because the filmstrip and
        // flip pages cease to exist — which is the failure this check exists for.
        filePages === planned.length,
        `${filePages} pages rendered vs ${planned.length} planned`,
      );
      check(
        "store: planning without the store really would be a different document",
        // The hazard this guards: no filmstrips, no flips, and every frame blank. Asserted on the
        // shape of the difference rather than on a count, so the check stays true if the fixture
        // grows.
        (() => {
          const withoutStore = planPortfolio(stored);
          return (
            withoutStore.length < planned.length &&
            !withoutStore.some((page) => page.kind === "filmstrip" || page.kind === "flip") &&
            withoutStore.every((page) =>
              page.blocks.every((block) => block.images.length === 0),
            )
          );
        })(),
      );
      check(
        "store: frames from the store are embedded rather than drawn empty",
        /\/Subtype\s*\/Image/.test(rendered),
      );
      check(
        "store: the filmstrip section reaches the page",
        containsText(extractText(buffer), "Sequence") || containsText(extractText(buffer), "The view"),
      );

      /* ------------------ the file carries what the plan draws ------------------ */
      /* The fidelity question the reader actually asked: whatever the workspace shows has to be what the
         file prints. The *card* side of this lives in the engine suite (which can mount the workspace and
         read its text); this is the file side of the same inventory — every heading, line and caption the
         plan draws has to be found in the rendered bytes. A sentence that reaches one surface and not the
         other is exactly what "it doesn't match the preview" means, and it is the class of bug the empty
         frames came from. */

      {
        const said: string[] = [];
        for (const page of planned) {
          if (page.title) said.push(page.title);
          if (page.body && page.kind !== "cover") said.push(page.body);
          for (const block of page.blocks) {
            if (block.title) said.push(block.title);
            if (block.body) said.push(block.body);
            for (const image of block.images) if (image.caption) said.push(image.caption);
          }
        }
        const fileText = extractText(buffer);
        const missing = said.filter((words) => !containsText(fileText, words));
        check(
          "fidelity: every heading, line and caption the plan draws is in the file",
          said.length > 4 && missing.length === 0,
          `${said.length} strings, missing: ${missing.slice(0, 3).join(" | ")}`,
        );
      }
    }

    /* ------------------- cards: several pieces on one page ------------------- */
    /* The layout the portfolio actually wanted: a page holding three self-contained pieces, each a
       photograph with its own description underneath — not one section stretched over a page. */

    {
      const { addAsset, createMediaLibrary, imageAsset, textAsset, tieCompanion } =
        await import("../lib/mediaLibrary");

      let library = createMediaLibrary();
      for (const id of ["c1", "c2", "c3"]) library = addAsset(library, imageAsset(frame(id)));
      for (const [name, text] of [
        ["Caption one", "Level 4 ceiling void, week 6."],
        ["Caption two", "Plant room riser, signed off."],
        ["Caption three", "Riser through the plant deck."],
      ]) {
        library = addAsset(library, textAsset(text, name));
      }
      ["c1", "c2", "c3"].forEach((id, index) => {
        const name = ["Caption one", "Caption two", "Caption three"][index];
        library = tieCompanion(library, id, library.assets.find((asset) => asset.name === name)!.id);
      });

      const cards = createPortfolio({
        title: "Pieces",
        subtitle: "Three on a page",
        projects: [
          {
            id: "pr-cards",
            name: "Pieces",
            slides: [
              {
                id: "sl-cards",
                title: "The work",
                blocks: [
                  createBlock("image", {
                    presentation: "cards",
                    title: "The work",
                    assetIds: ["c1", "c2", "c3"],
                  }),
                ],
              },
            ],
          },
        ],
      });

      const images = { c1: pixel, c2: pixel, c3: pixel };
      const buffer = await renderToBuffer(
        buildPortfolioPdfDocument({ portfolio: cards, images, library }),
      );
      const pageCount = (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
      const text = extractText(buffer);
      writeFileSync(join(outDir, "portfolio-cards.pdf"), buffer);

      console.log(
        `  ${"portfolio-cards.pdf".padEnd(33)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${pageCount} pages  cards 3  captions ${["week 6", "signed off", "plant deck"].filter((phrase) => containsText(text, phrase)).length}/3`,
      );

      check(
        "cards: three pieces share one page",
        // Cover plus the one page the three pieces share — not cover plus three.
        pageCount === 2 && planPortfolio(cards, library).filter((page) => page.kind === "project").length === 1,
        `${pageCount} pages total`,
      );
      check(
        "cards: every description lands under its photograph as real text",
        ["week 6", "signed off", "plant deck"].every((phrase) => containsText(text, phrase)),
      );
      check(
        "cards: the section title is on that page too",
        containsText(text, "The work"),
      );
    }

    /* ----------------- a page composed of several blocks ------------------- */
    /* Cards plus a row of numbers on one page: the composition the editor now allows, rendered. */

    {
      const { addAsset, createMediaLibrary, imageAsset, metricAsset, updateAsset } =
        await import("../lib/mediaLibrary");

      let library = createMediaLibrary();
      library = addAsset(library, imageAsset(frame("comp-1")));
      library = addAsset(library, imageAsset(frame("comp-2")));
      // Descriptions typed in the store, which is what lands under each card.
      library = updateAsset(library, "comp-1", { description: "Cable tray, week 3." });
      library = updateAsset(library, "comp-2", { description: "Riser, week 6." });
      library = addAsset(library, metricAsset({ label: "clashes resolved", value: "1,240" }));
      const figure = library.assets.find((asset) => asset.metric)!.id;

      const composed = createPortfolio({
        title: "Composed",
        subtitle: "Two blocks, one page",
        projects: [
          {
            id: "pr-mix",
            name: "Composed",
            slides: [
              {
                id: "sl-mix",
                title: "One page",
                blocks: [
                  createBlock("image", { presentation: "cards", title: "The work", assetIds: ["comp-1", "comp-2"] }),
                  createBlock("image", { presentation: "metrics", title: "Numbers", assetIds: [figure] }),
                ],
              },
            ],
          },
        ],
      });

      const buffer = await renderToBuffer(
        buildPortfolioPdfDocument({
          portfolio: composed,
          images: { "comp-1": pixel, "comp-2": pixel },
          library,
        }),
      );
      const pageCount = (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
      const text = extractText(buffer);
      writeFileSync(join(outDir, "portfolio-composed.pdf"), buffer);

      console.log(
        `  ${"portfolio-composed.pdf".padEnd(33)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${pageCount} pages (cover + one composed page)`,
      );

      check("composed: two blocks share one page", pageCount === 2, `${pageCount} pages`);
      check(
        "composed: the card descriptions and the numbers are all on that page",
        ["week 3", "week 6", "1,240"].every((phrase) => containsText(text, phrase)),
      );
    }

    /* --------------------- arranging: four quarters in one row --------------------- */
    /* Four sections at a quarter width each share one row, which is the granular placement the
       workspace offers. Asserted on geometry rather than on words: the frame widths in the file say
       whether they really ended up side by side at one size. */

    {
      const { addAsset, createMediaLibrary, imageAsset } = await import("../lib/mediaLibrary");

      let library = createMediaLibrary();
      for (const id of ["q1", "q2", "q3", "q4"]) library = addAsset(library, imageAsset(frame(id)));

      const quarters = createPortfolio({
        title: "Four across",
        subtitle: "Arranging",
        projects: [
          {
            id: "pr-q",
            name: "Arranging",
            slides: [
              {
                id: "sl-q",
                title: "Four across",
                blocks: ["q1", "q2", "q3", "q4"].map((id, index) =>
                  createBlock("image", {
                    presentation: "framed",
                    title: `Section ${index + 1}`,
                    assetIds: [id],
                    // A quarter each: 3 of 12, four to a row.
                    span: 3,
                  }),
                ),
              },
            ],
          },
        ],
      });

      const buffer = await renderToBuffer(
        buildPortfolioPdfDocument({
          portfolio: quarters,
          images: { q1: pixel, q2: pixel, q3: pixel, q4: pixel },
          library,
        }),
      );
      const pageCount = (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
      const widths = frameWidths(buffer);
      const distinct = new Set(widths);
      const narrowest = widths.slice(0, 4);
      const text = extractText(buffer);
      writeFileSync(join(outDir, "portfolio-quarters.pdf"), buffer);

      console.log(
        `  ${"portfolio-quarters.pdf".padEnd(33)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${pageCount} pages  four quarters  widths ${[...distinct].join("/")}`,
      );

      check("quarters: four sections still make one page", pageCount === 2, `${pageCount} pages`);
      check(
        "quarters: the four page frames come out at one width, a quarter of the content",
        // The cover adds its own three frames now — the book showing itself — so the four narrowest are
        // the page's quarters, and they are the only four of that width.
        new Set(narrowest.slice(0, 4)).size === 1 &&
          widths.filter((width) => width === narrowest[0]).length === 4 &&
          narrowest[0] > 110 &&
          narrowest[0] < 130,
        `widths ${widths.join(",")}`,
      );
      check(
        "quarters: all four section titles are on that page",
        ["Section 1", "Section 2", "Section 3", "Section 4"].every((title) =>
          containsText(text, title),
        ),
      );
    }

    /* --------------- reserved frames: space committed before the pictures ------------- */
    /* The same four-across section, once with two pictures, once with two pictures and four frames
       reserved. The empty frames must change the geometry and add no pictures of their own — which
       is the whole promise of arranging a page before the work exists. */

    {
      const { addAsset, createMediaLibrary, imageAsset } = await import("../lib/mediaLibrary");

      let library = createMediaLibrary();
      for (const id of ["r1", "r2"]) library = addAsset(library, imageAsset(frame(id)));

      const document = (slots?: number) =>
        createPortfolio({
          title: "Reserved",
          subtitle: "Space first",
          projects: [
            {
              id: "pr-r",
              name: "Reserved",
              slides: [
                {
                  id: "sl-r",
                  title: "Two in four",
                  blocks: [
                    createBlock("image", {
                      presentation: "framed",
                      title: "Two in four",
                      assetIds: ["r1", "r2"],
                      columns: 4,
                      ...(slots ? { slots } : {}),
                    }),
                  ],
                },
              ],
            },
          ],
        });

      const render = (slots?: number) =>
        renderToBuffer(
          buildPortfolioPdfDocument({
            portfolio: document(slots),
            images: { r1: pixel, r2: pixel },
            library,
          }),
        );

      const control = await render();
      const reserved = await render(4);
      writeFileSync(join(outDir, "portfolio-reserved.pdf"), reserved);

      const controlWidths = frameWidths(control);
      const reservedWidths = frameWidths(reserved);
      const controlPages = (control.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
      const reservedPages = (reserved.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

      console.log(
        `  ${"portfolio-reserved.pdf".padEnd(33)} ${String(Math.round(reserved.byteLength / 1024)).padStart(4)} KB  ` +
          `four frames, two filled  ${reservedPages} pages  widths ${reservedWidths.join(",")}`,
      );

      check(
        "reserved: still one page plus the cover, so the reservation did not spill",
        reservedPages === 2 && reservedPages === controlPages,
        `${reservedPages} vs ${controlPages}`,
      );
      check(
        "reserved: the empty frames add no pictures of their own",
        imagePlacements(reserved).length === imagePlacements(control).length,
        `${imagePlacements(reserved).length} vs ${imagePlacements(control).length} placements`,
      );
      check(
        "reserved: the frames narrow towards a quarter, so the space really was committed",
        // Compared against the *page's* two frames in the control, which are the widest in that file:
        // the cover's frames are the same width in both documents and would otherwise be the floor.
        reservedWidths[1] < controlWidths[controlWidths.length - 1] * 0.5 &&
          reservedWidths[1] > controlWidths[controlWidths.length - 1] * 0.4,
        `reserved ${reservedWidths[1]} vs control ${controlWidths[controlWidths.length - 1]}`,
      );
      // An empty frame is not just a missing picture: the file paints a panel in its place, which is
      // what the workspace draws on screen too. Counted as filled rectangles with no image over them.
      const panels = (bytes: Buffer) => (contentStreams(bytes).match(/re\nf/g) ?? []).length;
      check(
        "reserved: four frames are painted, two of them empty, so the arrangement is what is drawn",
        panels(reserved) >= 4 && panels(control) >= 2 && panels(reserved) > panels(control),
        `${panels(reserved)} panels vs ${panels(control)}`,
      );
    }

    /* ------------------------- pads: the layer behind the work ------------------------- */
    /* A panel behind a section, drawn as a filled rectangle before the content, with its label in the
       tone's own ink — and the page it sits on unchanged. */

    {
      const { addAsset, createMediaLibrary, imageAsset } = await import("../lib/mediaLibrary");
      const { createPad } = await import("../lib/portfolio");

      const library = addAsset(createMediaLibrary(), imageAsset(frame("pad-1")));

      const document = (withPad: boolean) =>
        createPortfolio({
          title: "Layered",
          subtitle: "Pads",
          projects: [
            {
              id: "pr-pad",
              name: "Layered",
              slides: [
                {
                  id: "sl-pad",
                  title: "Grouped",
                  ...(withPad
                    ? {
                        pads: [
                          createPad({
                            id: "pad-a",
                            tone: "tint",
                            label: "Before",
                            x: 0,
                            y: 0.1,
                            w: 0.5,
                            h: 0.3,
                          }),
                        ],
                      }
                    : {}),
                  blocks: [
                    createBlock("image", {
                      presentation: "framed",
                      title: "The work",
                      assetIds: ["pad-1"],
                      slots: 1,
                    }),
                  ],
                },
              ],
            },
          ],
        });

      const render = (withPad: boolean) =>
        renderToBuffer(
          buildPortfolioPdfDocument({
            portfolio: document(withPad),
            images: { "pad-1": pixel },
            library,
          }),
        );

      const plain = await render(false);
      const layered = await render(true);
      writeFileSync(join(outDir, "portfolio-pads.pdf"), layered);

      const pageCount = (layered.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
      const text = extractText(layered);
      const rects = (bytes: Buffer) => (contentStreams(bytes).match(/re\nf/g) ?? []).length;

      console.log(
        `  ${"portfolio-pads.pdf".padEnd(33)} ${String(Math.round(layered.byteLength / 1024)).padStart(4)} KB  ` +
          `${pageCount} pages  a tint panel with a label  ${rects(layered)} filled rects vs ${rects(plain)} without`,
      );

      check(
        "pads: the panel is really drawn, and the page it sits on is unchanged",
        rects(layered) > rects(plain) &&
          pageCount === (plain.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length,
        `${rects(layered)} vs ${rects(plain)} rects, ${pageCount} pages`,
      );
      check(
        "pads: the pad's own label is set inside it",
        containsText(text, "Before"),
      );
      check(
        "pads: the section is still drawn on top, with its own words",
        containsText(text, "Grouped") && containsText(text, "The work"),
      );
    }

    /* ------------------ stacking rows: three rows of two must still fit ------------------ */
    /* The layout the busiest page takes, and the one that quietly spilled a page the plan did not
       know about when single-block rows were wrapped in a row container. */

    {
      const { addAsset, createMediaLibrary, imageAsset } = await import("../lib/mediaLibrary");

      let library = createMediaLibrary();
      const ids = ["s1", "s2", "s3", "s4", "s5", "s6"];
      for (const id of ids) library = addAsset(library, imageAsset(frame(id)));

      const stacked = createPortfolio({
        title: "Stacked",
        subtitle: "Rows",
        projects: [
          {
            id: "pr-st",
            name: "Stacked",
            slides: [
              {
                id: "sl-st",
                title: "Three rows of two",
                blocks: ids.map((id, index) =>
                  createBlock("image", {
                    presentation: "framed",
                    title: `Half ${index + 1}`,
                    assetIds: [id],
                    span: 6,
                    shape: "wide",
                  }),
                ),
              },
            ],
          },
        ],
      });

      const buffer = await renderToBuffer(
        buildPortfolioPdfDocument({
          portfolio: stacked,
          images: Object.fromEntries(ids.map((id) => [id, pixel])),
          library,
        }),
      );
      const pageCount = (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
      const text = extractText(buffer);
      writeFileSync(join(outDir, "portfolio-stacked.pdf"), buffer);

      console.log(
        `  ${"portfolio-stacked.pdf".padEnd(33)} ${String(Math.round(buffer.byteLength / 1024)).padStart(4)} KB  ` +
          `${pageCount} pages  six halves in three rows`,
      );

      check(
        "stacked: six sections in three rows still make one page, so the plan is the truth",
        pageCount === planPortfolio(stacked, library).length && pageCount === 2,
        `${pageCount} pages`,
      );
      check(
        "stacked: all six of them are on that page",
        ["Half 1", "Half 2", "Half 3", "Half 4", "Half 5", "Half 6"].every((title) =>
          containsText(text, title),
        ),
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* Continuous layout: the same content must flow onto real Letter pages
     without anything being cut, and the block-level keep-together rules must
     not disturb the page size. */
  /* ------------------------------------------------------------------ */

  const bloatedContinuousProfile = structuredClone(profile);
  bloatedContinuousProfile.roles = bloatedContinuousProfile.roles.flatMap((role) => [
    role,
    structuredClone(role),
  ]);
  bloatedContinuousProfile.projects = bloatedContinuousProfile.projects.flatMap((project) => [
    project,
    structuredClone(project),
  ]);

  const continuousResume = tailorResume(bloatedContinuousProfile, analysisForEdits, {
    intensity: 60,
    emphasis: "balanced",
    fontPt: 10.4,
    showKeywordMarks: false,
    layout: "continuous",
  });
  const pageResume = tailorResume(bloatedContinuousProfile, analysisForEdits, {
    intensity: 60,
    emphasis: "balanced",
    fontPt: 10.4,
    showKeywordMarks: false,
    layout: "page",
  });

  const continuousBuffer = await renderToBuffer(
    buildResumePdfDocument({ resume: continuousResume, fontPt: continuousResume.options.fontPt }),
  );
  const continuousBytes = continuousBuffer.toString("latin1");
  const continuousText = extractText(continuousBuffer);
  writeFileSync(join(outDir, "continuous-resume.pdf"), continuousBuffer);

  const continuousPages = (continuousBytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const continuousBox = /MediaBox\s*\[([^\]]*)\]/.exec(continuousBytes)?.[1]?.trim();
  console.log(
    `  continuous-resume.pdf${" ".repeat(15)} ${String(Math.round(continuousBuffer.byteLength / 1024)).padStart(4)} KB  ` +
      `${continuousPages} pages  ${continuousBox}  ${continuousResume.options.fontPt}pt  ` +
      `(roles ${continuousResume.roles.length}, projects ${continuousResume.projects.length})`,
  );

  check("continuous: more than one page is produced", continuousPages >= 2, `${continuousPages}`);
  check("continuous: every page is US Letter", continuousBox === "0 0 612 792", `[${continuousBox}]`);
  check("continuous: no embedded fonts across the break", !/\/FontFile/.test(continuousBytes));
  check(
    "continuous: the type size was not reduced",
    continuousResume.options.fontPt === 10.4,
    `${continuousResume.options.fontPt}pt`,
  );
  check(
    "continuous: the sheet is bigger than the one-page version would be",
    JSON.stringify(continuousResume.roles).length > JSON.stringify(pageResume.roles).length,
  );
  check(
    "continuous: the name is extractable on the first page",
    containsText(continuousText, profile.header.name.toUpperCase()),
  );
  check(
    "continuous: section headings survive into the PDF",
    RESUME_SECTIONS.every((section) => containsText(continuousText, section)),
  );

  // The whole point: content one-page mode cuts is still in the continuous PDF.
  const projectBulletSurvivors = continuousResume.projects.flatMap((project) =>
    project.bullets.map((bullet) => bullet.text),
  );
  check(
    "continuous: project bullets the one-page mode dropped are present as text",
    projectBulletSurvivors.length > 0 &&
      projectBulletSurvivors.some((text) => containsText(continuousText, text.slice(0, 45))),
  );
  console.log(
    `  kept ${projectBulletSurvivors.length} project bullets across ${continuousResume.projects.length} projects ` +
      `(one-page mode would keep ${pageResume.projects.reduce((sum, p) => sum + p.bullets.length, 0)})`,
  );

  console.log(
    `\n${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} PDF checks passed`,
  );
  console.log(`Artifacts: ${outDir}`);
  console.log(`Section headings rendered: ${RESUME_SECTIONS.join(" / ")}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
