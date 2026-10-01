/**
 * Copies the pdf.js worker into /public.
 *
 * Resume import parses PDFs in the browser, and pdf.js needs its worker served as
 * a real file rather than bundled. Wired to postinstall so the copy can never
 * drift from the installed pdfjs-dist version.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const target = join(root, "public", "pdf.worker.min.mjs");

if (!existsSync(source)) {
  console.warn("[pdf-worker] pdfjs-dist is not installed; skipping worker copy.");
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`[pdf-worker] copied worker to ${target}`);
