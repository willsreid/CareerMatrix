/* -------------------------------------------------------------------------- */
/* Who the portfolio is from                                                  */
/*                                                                            */
/* The cover is the page a hiring manager sees first, and a portfolio that    */
/* cannot say who wrote it or how to reply to them is a portfolio nobody can   */
/* act on. This is the small set of facts that page needs.                    */
/* -------------------------------------------------------------------------- */

/**
 * A link on the cover: where to read more, as a *link* rather than as typed words.
 *
 * The words are drawn on the page whatever happens — a PDF cannot depend on a viewer honouring a link — and the
 * clickable annotation is laid over them as an extra, which is the same rule as the page navigation: the
 * universal layer is the content, the interactive layer is additive.
 */
export interface PortfolioLink {
  label: string;
  url: string;
}

/**
 * The cover's contact block.
 *
 * Every field is optional and a document with none of them is not missing anything: the cover simply draws what
 * it always drew. That matters more than it sounds — an existing portfolio must not grow an empty "contact" line
 * the moment this feature ships.
 */
export interface PortfolioContact {
  /** The line under the name: what you are, and anything a reader should know before scrolling. */
  tagline?: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: PortfolioLink[];
}

/**
 * Whether a URL may be put in a PDF as a clickable target.
 *
 * Only `http`, `https` and `mailto`. Deliberately not a general URL validator: `javascript:` in a link annotation
 * is a script in a document that gets emailed around, and a portfolio reader is not the place to find that out.
 * Anything unrecognised is not a link — it stays on the page as words, which is the safe failure.
 */
export function isSafeLink(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (!scheme) return false;
  if (scheme === "mailto") return value.length > "mailto:".length;
  if (scheme !== "http" && scheme !== "https") return false;
  // `http://` and `https://` with a host, and nothing that is trying to be a scheme without a colon.
  return /^https?:\/\/[^\s/]+/i.test(value);
}

/** The host of a link, for a label the author did not give one. */
function hostOf(url: string): string {
  const withoutScheme = url.trim().replace(/^[a-z]+:\/\//i, "");
  const host = withoutScheme.split(/[/?#]/)[0] ?? "";
  return host.replace(/^www\./i, "");
}

/**
 * Links from typed text, one per line, as `label | url` or just a url.
 *
 * The label is what the page prints, so a bare url gets its host as a label — "linkedin.com/in/you" rather than a
 * sixty-character tracking string. A line whose url is not a safe link is dropped, and the caller is told how many
 * by comparing lengths, because silently keeping a `javascript:` line would be worse than dropping it.
 */
export function parseLinks(text: string): PortfolioLink[] {
  const links: PortfolioLink[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [first, ...rest] = line.split("|").map((part) => part.trim());
    const hasLabel = rest.length > 0;
    const url = (hasLabel ? rest.join("|") : first) ?? "";
    if (!isSafeLink(url)) continue;
    const label = (hasLabel ? first : "") || hostOf(url);
    links.push({ label, url });
  }
  return links;
}

/** Links back as the text the editor holds, so a round trip through the field changes nothing. */
export function formatLinks(links: PortfolioLink[] | undefined): string {
  return (links ?? []).map((link) => `${link.label} | ${link.url}`).join("\n");
}

/** A contact from stored data, keeping only what is recognisable. */
export function cleanContact(raw: unknown): PortfolioContact | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() || undefined : undefined);
  const links = Array.isArray(candidate.links)
    ? candidate.links
        .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
        .map((entry) => {
          const url = text(entry.url) ?? "";
          if (!isSafeLink(url)) return null;
          return { label: text(entry.label) ?? hostOf(url), url };
        })
        .filter((entry): entry is PortfolioLink => entry !== null)
        .slice(0, 6)
    : [];

  const contact: PortfolioContact = {
    tagline: text(candidate.tagline),
    email: text(candidate.email),
    phone: text(candidate.phone),
    location: text(candidate.location),
    links: links.length ? links : undefined,
  };
  return Object.values(contact).some((value) => value !== undefined) ? contact : undefined;
}

/**
 * The one line under the cover's rule: "you@example.com · 555 0100 · Portland, OR".
 *
 * One line rather than three fields, because that is how a cover is read — and it is assembled here, in one
 * place, so the screen and the file cannot put the bits in a different order.
 */
export function contactLine(contact: PortfolioContact | undefined): string {
  return [contact?.email, contact?.phone, contact?.location]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/** Whether there is anything at all to draw, so a cover with no contact block adds no height. */
export function hasContact(contact: PortfolioContact | undefined): boolean {
  return Boolean(contact && (contactLine(contact) || contact.tagline || contact.links?.length));
}
