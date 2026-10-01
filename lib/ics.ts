/**
 * iCalendar export.
 *
 * A job-search calendar that only exists inside one app is a silo; the follow-ups
 * belong in the calendar you already look at. This writes RFC 5545 all-day events
 * that Google Calendar, Apple Calendar and Outlook all accept.
 *
 * Three details are where hand-rolled .ics files usually break:
 *
 *  - **DTEND is exclusive.** A one-day event on the 29th ends on the 30th. Getting
 *    this wrong makes every event one day short or long depending on the client.
 *  - **Text is escaped.** A comma in a job title, or a semicolon in a company name,
 *    silently truncates the field if it is not backslash-escaped.
 *  - **Lines are folded at 75 octets**, not 75 characters, and never inside a
 *    multi-byte character. Long descriptions otherwise get mangled by strict
 *    parsers.
 */

import { addDays, isIsoDate, toIsoDate } from "./dates";
import type { CalendarEvent } from "./applications";

export interface IcsEvent {
  /** Stable id; becomes the UID so re-importing updates rather than duplicates. */
  uid: string;
  date: string;
  summary: string;
  description?: string;
}

/** Escapes the characters RFC 5545 treats as structure. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n?|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Folds a content line to 75 octets, continuing with a leading space.
 *
 * Counted in UTF-8 bytes because the limit is bytes: an em dash is three of them, so
 * splitting after 75 *characters* can overflow, and splitting *inside* a character
 * produces a file strict parsers reject.
 *
 * The continuation indent is part of the format, not cosmetic: a folded line without
 * its leading space is not a folded line at all, it is two malformed ones. It also
 * counts toward the octet limit, hence the 74-byte content budget.
 */
export function foldIcsLine(line: string): string[] {
  const limit = 75 - 1;
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > limit && current) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  chunks.push(current);
  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`));
}

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** `2026-09-29` becomes `20260929`. */
function icsDate(iso: string): string {
  return iso.replace(/-/g, "");
}

export function buildIcs(
  events: IcsEvent[],
  options: { calendarName: string; now?: Date } = { calendarName: "Career Matrix" },
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Career Matrix//Job search pipeline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
  ];

  const now = options.now ?? new Date();
  for (const event of events) {
    if (!isIsoDate(event.date)) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@career-matrix`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${icsDate(event.date)}`,
      // Exclusive: an all-day event on the 29th ends at midnight on the 30th.
      `DTEND;VALUE=DATE:${icsDate(addDays(event.date, 1))}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    lines.push("TRANSP:TRANSPARENT", "CATEGORIES:Job search", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.flatMap(foldIcsLine).join("\r\n") + "\r\n";
}

/**
 * Turns pipeline events into calendar entries, skipping anything that no longer
 * needs attention so an imported calendar doesn't fill up with dead follow-ups.
 */
export function icsEventsFromPipeline(
  events: CalendarEvent[],
  today: string = toIsoDate(new Date()),
): IcsEvent[] {
  return events
    .filter((event) => event.kind === "followUp" && event.date >= today)
    .map((event) => ({
      uid: event.id,
      date: event.date,
      summary: `Follow up: ${event.jobTitle}${event.company ? ` at ${event.company}` : ""}`,
      description: [event.company, event.stage, event.detail].filter(Boolean).join(" — "),
    }));
}
