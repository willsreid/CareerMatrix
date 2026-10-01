"use client";

import * as React from "react";

import {
  flattenEditableDom,
  fromClipboard,
  isBlockedInputType,
  normalizeEditedText,
} from "@/lib/sheetText";
import { cn } from "@/lib/utils";

/**
 * Inline, in-place text editing that leaves the sheet's formatting untouched.
 *
 * The element keeps its own tag, classes, font, size, colour and spacing — it
 * simply becomes `contentEditable` while edit mode is on. Edits are committed on
 * blur (not per keystroke) so React never re-renders the text node mid-typing and
 * the caret never jumps.
 *
 * Three guards make sure the *edited* text continues the current formatting
 * rather than importing whatever it came from:
 *
 *   1. `beforeinput` blocks every formatting command (bold, italic, colour, font
 *      name, alignment, block format, horizontal rules).
 *   2. `paste` and `drop` are intercepted and reduced to plain text, so a paste
 *      from Word or LinkedIn cannot bring a font, a colour or a link into the sheet.
 *   3. On commit the element is *flattened*: every nested element is unwrapped to
 *      its text, leaving plain characters inside the original element, which by
 *      definition inherits that element's formatting.
 *
 * Typing inside the bold label stays bold, typing inside body text stays body
 * text, and nothing else can survive.
 */
export interface EditableTextProps {
  value: string;
  editable: boolean;
  onCommit: (next: string) => void;
  className?: string;
  /**
   * Inline style, for the one thing a class cannot say: a pad's label is set in the ink that is legible
   * on that pad's own tone, and the tone is a runtime value.
   */
  style?: React.CSSProperties;
  /**
   * The text split into styled runs, when parts of it carry their own style.
   *
   * Handed in already-split — by `segmentsOf`, the same function the PDF draws from — rather than as a
   * style map, because the *display* of a run is a class here and a set of numbers there, and this element
   * only knows about classes.
   */
  segments?: { text: string; className?: string }[];
  /**
   * Told which characters the caret covers, and the words they are, whenever a selection is made.
   *
   * This is what makes highlighting a word and choosing a style possible: the range is reported in the
   * slot's own character numbers, which is exactly what a mark stores, so the dropdown applies to what was
   * highlighted rather than to some DOM position that would mean something else. The words come with it so
   * the same highlight can be *kept* — saved to the clipboard as a text module.
   */
  onSelectRange?: (range: { start: number; end: number } | null, words: string) => void;
  /** Element to render. Kept semantic so nesting stays valid. */
  as?: "span" | "div" | "p";
  /** Allow line breaks (used for the summary paragraph only). */
  multiline?: boolean;
  /** Shown via CSS when the field is empty, so blank labels stay visible. */
  placeholder?: string;
  hint?: string;
  /**
   * Read-mode decoration, e.g. keyword highlighting. Ignored while editing,
   * because highlight spans would fight the caret.
   */
  renderValue?: (value: string) => React.ReactNode;
}

/**
 * Removes every element inside the editable host, keeping only its text (and
 * `<br>`, a real line break in a multiline field). See lib/sheetText.ts.
 */
function flatten(element: HTMLElement, multiline: boolean): void {
  flattenEditableDom(element, { multiline });
}

function insertPlainText(target: HTMLElement, text: string): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!target.contains(range.commonAncestorContainer)) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * How many characters of a host come before a selection point.
 *
 * `<br>` counts as one, because that is the newline it draws: the offsets reported here have to be the
 * offsets of the *stored* string, or a style applied to a highlighted range would land on the wrong words
 * the moment a line break was involved.
 */
function offsetIn(host: HTMLElement, node: Node, offset: number): number {
  let total = 0;
  const walk = (current: Node): boolean => {
    if (current === node && current.nodeType === Node.TEXT_NODE) {
      total += offset;
      return true;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      total += (current.textContent ?? "").length;
      return false;
    }
    if (current.nodeName === "BR") {
      total += 1;
      return false;
    }
    const children = Array.from(current.childNodes);
    if (current === node) {
      for (const child of children.slice(0, offset)) walk(child);
      return true;
    }
    for (const child of children) if (walk(child)) return true;
    return false;
  };
  walk(host);
  return total;
}

/**
 * Puts a selection back over a range of characters.
 *
 * Used after the styled runs are rewritten: without it, applying a style would drop the highlight, and
 * trying a second style would mean highlighting the words again every time.
 */
function selectRangeIn(host: HTMLElement, start: number, end: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  let seen = 0;
  let startNode: { node: Node; offset: number } | null = null;
  let endNode: { node: Node; offset: number } | null = null;

  const walk = (current: Node): void => {
    const length =
      current.nodeType === Node.TEXT_NODE
        ? (current.textContent ?? "").length
        : current.nodeName === "BR"
          ? 1
          : 0;
    if (length > 0) {
      if (!startNode && seen + length >= start) startNode = { node: current, offset: start - seen };
      if (!endNode && seen + length >= end) endNode = { node: current, offset: end - seen };
      seen += length;
      return;
    }
    for (const child of Array.from(current.childNodes)) walk(child);
  };
  walk(host);
  if (!startNode || !endNode) return;

  const range = document.createRange();
  range.setStart(
    (startNode as { node: Node }).node,
    Math.max(0, (startNode as { node: Node; offset: number }).offset),
  );
  range.setEnd(
    (endNode as { node: Node }).node,
    Math.max(0, (endNode as { node: Node; offset: number }).offset),
  );
  selection.removeAllRanges();
  selection.addRange(range);
}

export function EditableText({
  value,
  editable,
  onCommit,
  className,
  style,
  segments,
  onSelectRange,
  as = "span",
  multiline = false,
  placeholder,
  hint,
  renderValue,
}: EditableTextProps) {
  const ref = React.useRef<HTMLElement>(null);
  const [focused, setFocused] = React.useState(false);
  /** The last range reported, so a highlighted word can keep its highlight across a restyle. */
  const lastRange = React.useRef<{ start: number; end: number } | null>(null);
  /** What was last written, so a re-render that changed nothing does not disturb the selection. */
  const written = React.useRef<string>("");

  /**
   * The runs, as one string to compare by — a new array arrives on every render, and rewriting the host
   * on every render would throw away whatever the reader had highlighted.
   */
  const signature =
    segments?.map((run) => `${run.className ?? ""}\u0000${run.text}`).join("\u0001") ?? value;

  // The host's contents are written here rather than rendered by React: a contentEditable that the reader
  // has typed into is not something React may remove children from, and this element has to survive being
  // typed in. Focused means *their* text, untouched; unfocused means the styled runs.
  React.useEffect(() => {
    if (!editable) return;
    const element = ref.current;
    if (!element) return;
    if (document.activeElement === element && focused) return;
    if (written.current === `${signature}\u0002${focused}`) return;
    written.current = `${signature}\u0002${focused}`;

    if (!segments) {
      if (element.innerText !== value) element.innerText = value;
      return;
    }

    element.textContent = "";
    for (const run of segments) {
      // A stored newline is drawn as a real break, the same way the browser would make one.
      run.text.split("\n").forEach((part, index) => {
        if (index > 0) element.appendChild(document.createElement("br"));
        if (!part) return;
        if (run.className) {
          const span = document.createElement("span");
          span.className = run.className;
          span.textContent = part;
          element.appendChild(span);
        } else {
          element.appendChild(document.createTextNode(part));
        }
      });
    }

    // Put the highlight back where it was, so trying a second style needs no re-selecting.
    if (document.activeElement === element && lastRange.current) {
      selectRangeIn(element, lastRange.current.start, lastRange.current.end);
    }
  }, [value, editable, focused, segments, signature]);

  if (!editable) {
    return React.createElement(
      as,
      { className, style },
      segments
        ? segments.map((run, index) =>
            run.className
              ? React.createElement("span", { key: index, className: run.className }, run.text)
              : React.createElement(React.Fragment, { key: index }, run.text),
          )
        : renderValue
          ? renderValue(value)
          : value,
    );
  }

  /**
   * Reports the highlighted range in the slot's own character numbers, and the words it covers.
   *
   * The words come along because "keep what I highlighted" needs the string, not just where it sits — and the
   * runs are the plain text split up, so joining them back gives exactly the slot's words.
   */
  const reportRange = () => {
    if (!onSelectRange) return;
    const element = ref.current;
    if (!element) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onSelectRange(null, "");
      return;
    }
    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return;
    const start = offsetIn(element, range.startContainer, range.startOffset);
    const end = offsetIn(element, range.endContainer, range.endOffset);
    const next = { start: Math.min(start, end), end: Math.max(start, end) };
    lastRange.current = next;
    const plain = segments?.map((run) => run.text).join("") ?? value;
    onSelectRange(next, plain.slice(next.start, next.end));
  };

  const handleBlur = (event: React.FocusEvent<HTMLElement>) => {
    setFocused(false);
    const element = event.currentTarget;
    flatten(element, multiline);
    written.current = "";
    const next = normalizeEditedText(element.innerText, { multiline });
    if (next !== value) {
      onCommit(next);
    } else if (element.innerText !== value) {
      // Same words, stray whitespace: put the DOM back so the sheet stays tidy.
      element.innerText = value;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    // Formatting shortcuts are not available inside the sheet.
    if ((event.metaKey || event.ctrlKey) && ["b", "i", "u"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.currentTarget.innerText = value;
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      // A real newline in a multiline field, so the browser never inserts a
      // styled <div> the sheet would then have to flatten.
      if (multiline) insertPlainText(event.currentTarget, "\n");
      else event.currentTarget.blur();
    }
  };

  const handleBeforeInput = (event: React.FormEvent<HTMLElement>) => {
    const native = event.nativeEvent as InputEvent;
    if (isBlockedInputType(native.inputType)) {
      event.preventDefault();
      return;
    }
    if (
      !multiline &&
      (native.inputType === "insertParagraph" || native.inputType === "insertLineBreak")
    ) {
      event.preventDefault();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLElement>) => {
    event.preventDefault();
    const raw = event.clipboardData.getData("text/plain") ?? "";
    if (!raw) return;
    insertPlainText(event.currentTarget, fromClipboard(raw, { multiline }));
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    // Dropped content carries its own formatting; take the plain text only.
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain") ?? "";
    if (!raw) return;
    insertPlainText(event.currentTarget, fromClipboard(raw, { multiline }));
  };

  return React.createElement(as, {
    ref,
    className: cn("sheet-editable", multiline && "sheet-editable--multiline", className),
    style,
    contentEditable: true,
    suppressContentEditableWarning: true,
    spellCheck: true,
    "data-placeholder": placeholder,
    title: hint,
    onFocus: () => setFocused(true),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    onKeyUp: reportRange,
    onMouseUp: reportRange,
    onBeforeInput: handleBeforeInput,
    onPaste: handlePaste,
    onDrop: handleDrop,
  });
}
