/**
 * Text normalisation for the in-place sheet editor.
 *
 * Kept as pure functions (no DOM) so the rules that protect the sheet's
 * formatting are testable. The DOM behaviour that feeds these functions lives in
 * components/EditableText.tsx.
 */

const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u00ad]/g;

export interface NormalizeOptions {
  /** Allow newlines (used by the summary paragraph and letter paragraphs). */
  multiline: boolean;
}

/**
 * Collapses whatever the browser put in the element — including nbsp runs,
 * zero-width characters, stray newlines and non-breaking spaces from a paste —
 * down to the plain text the sheet expects.
 */
export function normalizeEditedText(raw: string, { multiline }: NormalizeOptions): string {
  let text = raw.replace(INVISIBLE, "").replace(/\u00a0/g, " ");

  if (multiline) {
    // Tidy each line, cap consecutive blank lines at one, drop trailing space.
    text = text
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  } else {
    text = text.replace(/\s+/g, " ");
  }

  return text.trim();
}

/**
 * Clipboard text is already plain, but it arrives with the source's line
 * endings, nbsp characters and sometimes trailing blank lines. For a single-line
 * field the newlines have to become spaces, otherwise the sheet's baseline grid
 * gains a line it was not measured for.
 */
export function fromClipboard(raw: string, options: NormalizeOptions): string {
  const normalized = raw.replace(/\r\n?/g, "\n");
  return normalizeEditedText(normalized, options);
}

/** Input types that would change the sheet's formatting rather than its words. */
export const BLOCKED_INPUT_TYPES = [
  "formatBold",
  "formatItalic",
  "formatUnderline",
  "formatStrikeThrough",
  "formatSuperscript",
  "formatSubscript",
  "formatJustifyCenter",
  "formatJustifyFull",
  "formatJustifyLeft",
  "formatJustifyRight",
  "formatForeColor",
  "formatBackColor",
  "formatFontName",
  "formatFontSize",
  "formatBlock",
  "formatOutdent",
  "formatIndent",
  "insertHorizontalRule",
  "insertFromYank",
  "insertReplacementText",
] as const;

export function isBlockedInputType(inputType: string | undefined): boolean {
  if (!inputType) return false;
  return (BLOCKED_INPUT_TYPES as readonly string[]).includes(inputType);
}

/** Tags the editor is allowed to leave behind. Everything else is unwrapped. */
export const ALLOWED_INLINE_TAGS = new Set(["BR", "P", "DIV", "LI", "UL", "OL"]);

/** Attributes that would let a paste restyle the sheet from the inside. */
export const STRIPPED_ATTRIBUTES = [
  "style",
  "color",
  "face",
  "size",
  "bgcolor",
  "align",
  "dir",
] as const;

/**
 * Flattens an editable element down to its own text.
 *
 * Everything the browser or a paste inserted inside — `<span style="font-family:
 * Calibri">`, `<b>`, `<i>`, `<a href>`, `<font color>`, `<div>` — is unwrapped so
 * its characters become plain text directly inside the original element. That
 * element keeps its own class, and the class *is* the formatting, so the
 * inserted words inherit the sheet's font, weight, size and spacing by
 * construction and cannot carry a font, colour or alignment of their own.
 *
 * `<br>` is kept only in a multiline field; a line break in a single-line field
 * would add a line the page-fit model never measured for.
 *
 * Takes an Element rather than reaching for the document, so it can be tested
 * against a real DOM without a browser.
 */
export function flattenEditableDom(element: Element, options: NormalizeOptions): void {
  for (const attribute of STRIPPED_ATTRIBUTES) {
    element.removeAttribute(attribute);
  }
  unwrapChildren(element, options);
}

function unwrapChildren(node: Element, options: NormalizeOptions): void {
  // Snapshot first: the list mutates as children are hoisted and removed.
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;
    const element = child as Element;

    if (element.tagName === "BR") {
      if (!options.multiline) node.removeChild(element);
      continue;
    }

    // Depth first, so nested markup is flattened before the wrapper is hoisted.
    unwrapChildren(element, options);
    while (element.firstChild) node.insertBefore(element.firstChild, element);
    node.removeChild(element);
  }
}
