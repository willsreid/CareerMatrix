/**
 * Byte-level PDF enhancement.
 *
 * Some things a portfolio wants cannot be expressed through react-pdf at all. Its
 * `Canvas` painter is a whitelist of thirty-five *drawing* methods — no page dictionary,
 * no annotation API, no refs — so a page transition cannot be set from inside a render.
 * It has to be written into the finished file.
 *
 * That means touching the bytes, which means dealing with the cross-reference table: the
 * xref records the byte offset of every object, so inserting anything shifts every later
 * offset and leaves the file corrupt for strict readers. This module rebuilds the xref
 * after patching rather than hoping viewers recover by scanning.
 *
 * Scope is deliberately small and verifiable: insert one dictionary per page, then
 * recompute offsets. Anything more ambitious belongs in a real PDF library.
 */

/**
 * A horizontal glide between pages, which is what makes a before/after flip read as a
 * wipe rather than a cut.
 *
 * `/S /Glide` with `/Dm /H` (horizontal) is the transition Acrobat's presentation mode
 * animates; `/D 1` is a one-second duration. `M /O` means "advance on page turn", not on
 * a timer, so it follows the reader rather than moving on its own.
 */
export const GLIDE_TRANSITION = "<< /Type /Trans /S /Glide /D 1 /Dm /H /M /O >>";

export interface XrefEntry {
  number: number;
  /** Byte offset of the object header, as the cross-reference table records it. */
  offset: number;
}

/**
 * Byte-exact conversions between a PDF's bytes and the string the patcher edits.
 *
 * `TextDecoder("latin1")` is not usable here: browsers map `latin1` and `iso-8859-1` to
 * windows-1252, which remaps the 0x80–0x9F range, so a byte inside a compressed stream would
 * come back as a different byte and the export would be corrupt. A character code per byte is
 * the only mapping that survives the round trip.
 */
export function bytesToString(bytes: Uint8Array): string {
  const chunks: string[] = [];
  // Chunked because `String.fromCharCode(...bytes)` blows the argument limit on a large file.
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + CHUNK)));
  }
  return chunks.join("");
}

export function stringToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff;
  return bytes;
}

/** Reads object offsets straight out of the cross-reference table.
 *
 * Hand-scanning for `N 0 obj … endobj` is tempting and wrong: pdfkit writes objects back to
 * back with no separator (`…endobj8 0 obj…`) and a content stream is arbitrary binary that
 * may contain the letters `endobj`, so a body search can stop early or run past the object
 * and swallow the next one — which silently duplicates bytes and doubles the file. The xref
 * is the file's own record of where every object begins, so it is used instead.
 */
export function parseXref(pdf: string): XrefEntry[] {
  const index = pdf.lastIndexOf("\nxref\n");
  if (index === -1) return [];

  const entries: XrefEntry[] = [];
  let cursor = index + "\nxref\n".length;

  // pdfkit writes one subsection (`0 N`); a rebuilt file may split them, so read them all.
  for (;;) {
    const header = /^(\d+)\s+(\d+)\s*\n/.exec(pdf.slice(cursor, cursor + 24));
    if (!header) break;
    const start = Number.parseInt(header[1], 10);
    const count = Number.parseInt(header[2], 10);
    cursor += header[0].length;

    for (let index2 = 0; index2 < count; index2 += 1) {
      // Every entry is exactly 20 bytes: 10-digit offset, 5-digit generation, type.
      const entry = pdf.slice(cursor, cursor + 20);
      const parsed = /^(\d{10}) (\d{5}) ([nf])/.exec(entry);
      if (!parsed) return entries;
      if (parsed[3] === "n") {
        entries.push({ number: start + index2, offset: Number.parseInt(parsed[1], 10) });
      }
      cursor += 20;
    }
  }
  return entries;
}

/**
 * Finds the page objects that still need a transition, and where inside them to write it.
 *
 * A page dictionary opens with `/Type /Page` in files pdfkit produces. Objects that are not
 * dictionaries, and streams (which begin `/Length`), are skipped, and an object that already
 * carries `/Trans` is left alone so that patching twice is the same as patching once.
 */
function planInsertions(
  pdf: string,
  ordered: XrefEntry[],
  regionEnd: number,
  transition: string,
): { number: number; at: number; text: string }[] {
  const insertions: { number: number; at: number; text: string }[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    // The window has to stop where the next object starts. Slicing a fixed 400 bytes instead
    // runs past short objects and reads the *next* object's `/Type /Page`, which is how a
    // stray transition ends up on a font or a content stream.
    const objectEnd = index + 1 < ordered.length ? ordered[index + 1].offset : regionEnd;
    const body = pdf.slice(entry.offset, objectEnd);
    if (!/^\d+\s+\d+\s+obj\s*<</.test(body)) continue;
    if (!/\/Type\s*\/Page[^s]/.test(body)) continue;
    if (/\/Trans\b/.test(body)) continue;

    const open = body.indexOf("<<");
    if (open === -1) continue;
    // Right after the dictionary opens, so the original keys keep their order and the change
    // is obvious in a byte diff.
    insertions.push({ number: entry.number, at: entry.offset + open + 2, text: ` /Trans ${transition}` });
  }
  return insertions;
}

/**
 * Adds a page transition to every page object, then rewrites the cross-reference table.
 *
 * Returns the input untouched if there are no page objects or no xref, because a portfolio
 * that opens is worth more than one that animates.
 */
export function withPageTransitions(pdf: string, transition = GLIDE_TRANSITION): string {
  const xrefIndex = pdf.lastIndexOf("\nxref\n");
  const entries = parseXref(pdf);
  if (!entries.length || xrefIndex === -1) return pdf;

  const trailerMatch = /trailer\s*<<([\s\S]*?)>>/.exec(pdf.slice(xrefIndex));

  // Objects in file order, so each one's extent is the gap to the next.
  const ordered = [...entries].sort((a, b) => a.offset - b.offset);
  const insertions = planInsertions(pdf, ordered, xrefIndex, transition);
  const byNumber = new Map(insertions.map((insertion) => [insertion.number, insertion]));

  // Walk the objects in file order, writing each one and its insertion, and remember where
  // every object landed. Offsets shift by the bytes written so far, which is exactly the
  // bookkeeping the rebuilt cross-reference table needs.
  const newOffsets = new Map<number, number>(entries.map((entry) => [entry.number, entry.offset]));
  let out = "";
  let cursor = 0;
  let shift = 0;

  for (const entry of ordered) {
    if (entry.offset < cursor) continue;
    out += pdf.slice(cursor, entry.offset);
    cursor = entry.offset;
    newOffsets.set(entry.number, entry.offset + shift);

    const insertion = byNumber.get(entry.number);
    if (insertion) {
      out += pdf.slice(cursor, insertion.at);
      out += insertion.text;
      cursor = insertion.at;
      shift += insertion.text.length;
    }
  }
  out += pdf.slice(cursor, xrefIndex);
  // The xref has to start on its own line, and pdfkit leaves no terminator after its final
  // `endobj`.
  if (!out.endsWith("\n")) out += "\n";

  const maxNumber = Math.max(...newOffsets.keys());
  const xrefStart = out.length;

  // Same shape pdfkit writes: one subsection, 20-byte entries. A number with no object is
  // declared free rather than pointed at offset zero, which would be a lie.
  let table = `xref\n0 ${maxNumber + 1}\n0000000000 65535 f \n`;
  for (let number = 1; number <= maxNumber; number += 1) {
    const offset = newOffsets.get(number);
    table +=
      offset === undefined
        ? "0000000000 65535 f \n"
        : `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = trailerMatch
    ? `trailer <<${trailerMatch[1]}>>`
    : `trailer << /Size ${maxNumber + 1} >>`;

  return `${out}${table}${trailer}\nstartxref\n${xrefStart}\n%%EOF\n`;
}

/** True when every `N 0 obj` sits at the offset the xref claims. */
export function verifyXref(pdf: string): boolean {
  const xrefIndex = pdf.lastIndexOf("\nxref\n");
  if (xrefIndex === -1) return false;
  const table = pdf.slice(xrefIndex);
  const entries = [...table.matchAll(/^(\d{10}) (\d{5}) ([nf]) $/gm)];
  if (!entries.length) return false;
  return entries.every((entry) => {
    if (entry[3] === "f") return true;
    const offset = Number.parseInt(entry[1], 10);
    return /^\d+\s+\d+\s+obj\b/.test(pdf.slice(offset, offset + 24));
  });
}

/** How many page objects carry a transition. */
export function countTransitions(pdf: string): number {
  return (pdf.match(/\/Trans\s*<<\s*\/Type\s*\/Trans/g) ?? []).length;
}
