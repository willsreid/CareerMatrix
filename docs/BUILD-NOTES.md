# Career Matrix

A local-first resume tailoring workspace. Paste a job posting, see exactly which of
its keywords your profile can and cannot evidence, tune how hard the resume leans
into that posting, and export a guaranteed one-page, ATS-safe PDF — with an honest
cover letter when the posting needs one.

It was built for a senior VDC / BIM job search and the Master Profile still reads
that way, but nothing in the engine is industry-specific: roles, emphasis facets,
section headings and the resume importer all work for any career. Points of
departure from that focus are called out below.

Everything runs in the browser. There is no server, no account and no analytics, and
the whole workspace lives in `localStorage` — or, if you point the app at a folder, in
files on disk: see **Keep it in a folder** below. The single exception to "nothing goes
out" is the calendar's map: its tiles come from OpenStreetMap and a place it has never
heard of — a ZIP code, an address — is looked up once through `app/api/geocode/route.ts`,
which is the only code in this repo that talks outward, and which never hears anything
about a job.

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (the six pages prerender statically; `/api/geocode` is dynamic, as it must be) |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | Runs the engine test suite (806 assertions incl. a real DOM via jsdom, the layout contract, resume import, the calendar and the iCalendar format, the map's Mercator arithmetic, the place lookup, the details-editor rules, the portfolio (its look and its cover) and the pipeline's own numbers — no browser, and no network, needed) |
| `npm run verify:pdf` | Renders every sample posting at every band through the real react-pdf document and checks the bytes: 219 assertions on page count, page size, fonts, extractable text, the resume+letter packet and an export→import round trip |
| `npm run pdf-worker` | Re-copies the pdf.js worker into `/public` (also runs on `postinstall`) |

## Tone / emphasis, for any career

The three facets are axes rather than job families, so they read the same whether
you are a coordination lead, a marketer or an engineer:

| Facet | What it does |
|---|---|
| **Balanced** | The whole picture, no bias. The default. |
| **Technical & Tools Heavy** | Leads with systems, tooling, code and analysis. |
| **Delivery & Operations Heavy** | Leads with hands-on execution, coordination and field outcomes. |

What actually changes when you pick one: the summary switches to that facet's pitch
variant, and the tailorer promotes the skill groups and bullets **you tagged** for
it in the Master Profile. The tags are the mechanism — `emphasisBoost` and
`rankBullets` both read them — so a profile built by hand or by resume import works
without any industry vocabulary baked in. A narrow per-facet keyword pattern exists
as a fallback for untagged bullets only, and it is documented as such.

These facets were called `automation` / `field` / `balanced` before the app was
made universal. The old slugs still read back correctly: `migrateProfile`,
`migrateDraft`, `migrateApplications` and `migrateVersions` translate them on the
way out of storage, pitch variants are rebuilt under the new keys rather than
merged alongside them, and `npm run verify` asserts each of those paths. Nothing you
saved needs re-entering.

The app name, the browser title, the PDF `Creator`/`Producer` metadata and the
backup identifier all read **Career Matrix** now. The `vdcm.*` localStorage keys and
the old `vdc-career-matrix` backup id are deliberately still accepted, because they
are your data rather than a label.

## Importing an existing resume

**Master Profile → Import a resume** takes a PDF, DOCX or plain-text resume and uses
it to fill the profile. PDF text is read with pdf.js and DOCX by unzipping
`word/document.xml`; both are loaded lazily, so a user who never imports anything
never downloads either. Nothing is uploaded — it is all in-browser.

It is deliberately two steps:

1. **Read** — the file is parsed and the result is shown: how many jobs, bullets,
   skills, projects, education lines and credentials were found, how each job was
   read (title · employer · dates · bullet count), and every note the parser or the
   extractor wants you to know ("no skills section was recognised", "this document
   contains images, so anything inside them cannot be read").
2. **Apply** — nothing is written until you press the button, and then on your
   terms: **add** (the default: fills empty contact fields, appends content, skips
   duplicates) or **replace** (swaps the content blocks). Passing the summary
   through as your pitch is a separate switch, and it is only pre-ticked when your
   pitch is empty.

The same rule as the rest of the engine applies: it may reformat, it may miss
something and say so, but it will not write a field the document does not contain.
Imported bullets arrive with no label, no tags and no emphasis, so nothing is
claimed on your behalf — tagging them on the Roles tab is what steers the tailoring
afterwards.

Some shapes it handles, and the failure modes worth knowing:

- Section headings with qualifiers and conjunctions (`KEY AUTOMATION PROJECTS`,
  `CERTIFICATIONS & BACKGROUND`), in caps or title case.
- All three job-header layouts: `Title — Company | Jan 2019 - Present`,
  `Title at Company` over a date line, and `Title` over `Company · Location`.
  Which line is the title is decided by content (role and employer words), not by
  order, because resumes print both ways round.
- Wrapped bullets are rejoined; a bullet glyph (`•`, `-`, `*`) is stripped rather
  than imported.
- `.doc` (the old binary format) and scanned PDFs are reported as unreadable
  instead of producing garbage.

The strongest test of the whole path is a round trip: `npm run verify:pdf` exports a
real resume PDF, reads it back through the importer, and asserts the name, contact
details, section headings, summary, job count, bullet text, dates and skills all
survive.

One honest finding from building that test: in the app's own PDF the name shares a
text line with the email, because the header is a two-column row. The importer
handles it (it strips contact tokens and re-tests), but a third-party parser reading
that line has no such courtesy — worth knowing if you are feeding the export to an
ATS that cares.

## The screens

| Route | Purpose |
|---|---|
| `/` | **Workspace.** Job posting on the left, live resume sheet on the right. |
| `/cover-letter` | **Cover letter.** Same analysis, same tone dials, one-page letter. |
| `/profile` | **Master Profile.** Everything the engine is allowed to draw on, plus resume import. |
| `/portfolio` | **Portfolio.** The store, the pages at true proportions, the presentation menu. |
| `/saved` | **Saved Target Roles.** Frozen variants, stages, dates, search and re-export. |
| `/pipeline` | **Pipeline.** What the saved records add up to: the funnel, reply rates, what has gone quiet. |
| `/calendar` | **Follow-up calendar.** Month grid, overdue queue, agenda, `.ics` export — and the map. |

The navigation follows the same order, which is the order of the work: the workspace
first, then the three things you make from it — the letter, the profile it draws on,
the portfolio it feeds — then the record-keeping, from the roles you have saved through
to the calendar their dates land on.

## Editing the sheet by hand

Flip **Edit sheet** and every line on the resume becomes editable *in place* — click
and type. The text is edited inside the same `<p>` / `<li>` / `<span>` elements it
already occupies, so the font, size, leading, indentation, bullet marks, bold
labels and right-aligned dates are untouched. Nothing is wrapped in an input, no
border appears, and nothing is reformatted; the printed page and the PDF lay out
exactly as before. Enter commits a line, Esc reverts it, and the engine's
relevance ordering is preserved (an edit overrides a bullet's words, never its
position).

### The edited text continues the current formatting

That is enforced rather than hoped for, because `contentEditable` otherwise lets
the browser import formatting along with the words:

| Vector | Guard |
|---|---|
| Paste from Word, LinkedIn, a web page | `paste` is intercepted, reduced to `text/plain`, and inserted as characters — no font, colour or link can enter |
| Drag-and-drop text | Same treatment via `drop` |
| Ctrl/Cmd + B, I, U | `keydown` prevents them |
| Browser format commands (`formatFontName`, `formatForeColor`, `formatBlock`, `insertHorizontalRule`, alignment…) | blocked in `beforeinput` |
| Enter in a single-line field | prevented; the field commits instead |
| Enter in the summary | inserts a real newline (`white-space: pre-wrap`) rather than a styled `<div>` |
| Markup that arrives anyway | on commit the element is **flattened**: nested elements are unwrapped to their characters and styling attributes are stripped from the host |

Flattening is the backstop. The surviving characters sit directly inside the
original element, which keeps its own class — and the class *is* the formatting —
so they inherit the sheet's font, weight, size and spacing by construction.
Typing inside the bold label stays bold; typing inside body text stays body text;
nothing else can survive. Text is normalised on commit too: non-breaking spaces,
zero-width characters, soft hyphens, tab runs and CRLF all collapse; newlines
become spaces in single-line fields and are capped at one blank line in the
summary.

Every rule is tested. The DOM behaviour runs against a real DOM (jsdom) inside
`npm run verify`, and the normalisation rules are pure functions.

Edits live in a layer *above* the tailored resume — never in the Master Profile:

```
Master Profile ─► tailorResume ─► TailoredResume ─► applyEdits ─► sheet / PDF / text
                                                       ▲
                                                 hand edits
```

That split is what makes it safe and reversible:

- **Your words are labelled as yours.** The audit trail names every manual edit
  (`Applied 4 manual edit(s): summary rewritten by hand; 2 bullet(s) rewritten…`)
  so the verbatim-provenance guarantee stays honest about where each line came
  from.
- **The audit follows you.** Coverage and the ATS score are recomputed *after*
  edits, so if you cut a keyword out of a bullet, the coverage number drops and
  you see it.
- **Reset edits** returns the sheet to the engine's version without touching the
  profile.
- Hiding a bullet, restoring one, and adding a line you wrote yourself live in the
  **Edit controls** panel *below* the sheet — never inside it, so the document
  keeps its formatting.

## Versions

A checkpoint is taken automatically 1.5s after you stop changing the sheet, and
only when something actually changed (deduplicated by content hash). Each entry
records the posting, intensity, tone, type size, ATS score, coverage, edit count
and a plain-English diff against the previous one (`summary changed, 2 bullet(s)
reworded, ATS 78 to 84`).

- **Restore** brings back the posting *and* the settings together, so a version
  can never be shown against the wrong job's analysis.
- **Pin** protects a checkpoint from the 40-entry eviction.
- **Save as variant** freezes it as a saved application — the moment a draft
  becomes the resume you actually sent. The same action sits in the sheet toolbar
  as **Save variant** (with a note field for the recruiter or referral), next to
  the edit toggle, because it acts on the sheet rather than reporting on it.

## Saving a variant: the application record

**Save variant** opens a form rather than saving on the click, because a record with
no dates cannot appear on a follow-up calendar and free-text notes cannot be turned
back into dates later. All three entry points — the sheet toolbar, a checkpoint in
the version shelf, and the cover-letter page — share the same form.

| Field | How it is filled |
|---|---|
| **Date applied** | `Today` and `Yesterday` hot keys, or a date picker. Blank means "not sent yet". |
| **Follow up** | Presets (`3 days`, `1 week`, `2 weeks`, `3 weeks`, `1 month`), or a number plus a **days/weeks** toggle, or a date picker. The interval counts from the applied date when there is one, so "two weeks after applying" lands on the right day. |
| **Notes** | Multi-line, as before. |
| **Contact / Source** | Recruiter, referral, job board. Cheap to record now, impossible to reconstruct later. |
| **Office address** | Optional, and usually learned *after* you apply: the building you would actually work in, as against the `location` line the ad carried. Editable later from the calendar's **Open details**. |
| **Stage** | The pipeline stage. Recording an applied date promotes `Saved` → `Applied`; an explicit stage always wins, and nothing ever moves backwards — re-saving an application you have already interviewed for must not demote it. |

The form refuses a follow-up that falls before the applied date rather than storing a
day that would sit wrong on the calendar, and it never invents a follow-up you did
not ask for: changing the applied date *moves* a follow-up you already set, and
leaves it unset otherwise.

The Saved Target Roles list shows the result — `Applied Sep 29, 2026 · today`,
`Follow up in 6 days · 2 weeks after applying`, contact and source — with overdue
follow-ups in red and due-today in amber. That classification
(`followUpStatus`) and the pipeline rules (`resolveStage`, `validateSaveDetails`)
live in `lib/applications.ts`, and `lib/dates.ts` holds the date arithmetic, so the
calendar that comes next only has to render them.

Dates are stored as `YYYY-MM-DD` in your own timezone and compared as strings. That
is deliberate: `new Date("2026-09-29")` parses as UTC midnight, which is the 28th
west of Greenwich, so the usual shortcut would schedule follow-ups a day early.

### The details that arrive later

A record is not finished when it is saved. The address arrives with the invitation,
the recruiter's name with the first call, the hiring manager's name with the second.
So every role on the calendar — the overdue queue and the day panel both — carries an
**Open details** button, and the saved list carries one beside **Open in workspace**;
both open the same editor over the top of the page rather than throwing the workspace
at you. It writes to the record as you leave each field, which is what the rest of
this app does with free text, and **open the full record** links through to the saved
list entry it belongs to.

What it holds is what you cannot reconstruct later:

| Field | Notes |
|---|---|
| **Office address** | The street address, with the posting's own line shown beside it so the two cannot be confused. |
| **Who you spoke to** | The recruiter, the referral, the hiring manager — whoever is on the other end. |
| **Notes** | Whatever was said: names, what they asked for, what comes next. |
| **Came from**, **Date applied**, **Follow up**, **Stage** | The same fields the save form collects, correctable here without re-saving anything. |

**find it on the map** is the interesting button. The address is looked up through the
same route as the map's own centre field — the book of places first, then one cached
lookup — and the answer is stored as *that application's* point, which beats whatever
the gazetteer made of the posting's `location` line. It is a press, never automatic:
the map places the ad's city until you ask for the building, and **unpin** puts it back.
Clearing the address box does not lose the pin; empty means "remove it" for the optional
fields, and the address that was there is kept if the box is empty when you press the
button. `lib/applicationDetails.ts` holds those three rules — which a blank field
clears, where a lookup is sent, and what storing the answer looks like — as functions,
so the dialog only draws them and the suite can check them without a browser.
`npm run verify` asserts the local parse, the leap day, a daylight-saving boundary
and the rejection of impossible dates like `2026-02-31`.

## Follow-up calendar

`/calendar` turns those dates into a working pipeline: a month grid with an applied
marker and a follow-up marker per day, the overdue follow-ups at the top with snooze
and close buttons, and a "next three weeks" agenda. Today is ringed, days outside the
month are muted, and a late follow-up is red rather than amber so the shape of the
month tells you something before you read a word. Every role on the page has an
**Open details** button — so the address, the contact and the notes that arrive after
you apply have somewhere to go, without leaving the calendar.

Two rules keep it from becoming noise:

- **Resolved applications stop chasing themselves.** A stage of `Offer` or `Archived`
  means its follow-up is history, not an overdue task. `ACTIVE_STAGES` decides, and
  the overdue count ignores anything that no longer needs action.
- **A follow-up you cannot act on is just guilt.** Every overdue row can be snoozed a
  week or two, or closed — which clears the date and files it in `followUpHistory`, so
  the day panel can say `chased 2×`.

**Export .ics** writes the future follow-ups as RFC 5545 all-day events you can import
into Google Calendar, Apple Calendar or Outlook — a job-search reminder list that only
exists inside one app is a silo. Three details are handled deliberately, because they
are where hand-rolled `.ics` files usually break:

| Detail | Why it matters |
|---|---|
| `DTEND` is **exclusive** | An all-day event on the 29th ends on the 30th. Get this wrong and every event is a day short or long depending on the client. |
| Text is **escaped** | A comma in a company name (`Engineering, Inc.`) truncates the field otherwise. |
| Lines **fold at 75 octets** with a space indent | Octets, not characters — an em dash is three — and never inside a multi-byte character. |

The emitted file was checked against a real iCalendar parser, not just my own
assertions: `node-ical` reads both events back with the correct single-day span, the
un-escaped `Engineering, Inc.` summary, and `datetype: date`.

Past follow-ups are deliberately left out of the export — they are history — and an
empty pipeline exports a valid empty calendar rather than a broken file.

### The map: where all this is

The same page answers the other half of the question — not *what is due* but *where is it
all* — with a real map of the applications. Every saved variant already carries a `location`
line and a work mode, so there is nothing extra to fill in: the map places those names, puts
a pin per application on the streets it is actually on, draws a ring at the radius you choose,
and splits the list into what is inside it, what is further out, what is remote, and what it
could not place. The centre takes a city, a **ZIP code**, an address, or a pair of
coordinates; drag it, scroll to zoom, or press the one button that fits every application in
a single frame — a Portland commute and a Boise opening on the same screen. An application
whose office address you have recorded can be pinned from that address instead of the ad's
city, with **find it on the map** in its details editor.

- **Imagery from OpenStreetMap, and only imagery.** Tiles come from OSM, the one tile server
  that needs no key, no account and no bill. So the *area you are looking at* is visible to a
  tile server, exactly as it would be in any browser map. What never travels is your
  applications: the pins are drawn on this machine from `location` lines that are already
  here, and no request contains a company name. **Map imagery** turns the tiles off, and
  everything but the roads keeps working, because the ring and the pins are drawn from the
  numbers. One person's map on OSM's public tile server is what its usage policy is for;
  anything shared or published would want its own tiles.
- **A distance you can check.** `lib/geo.ts` has the haversine and a compass bearing, and the
  projection a tile map has to be drawn in — Web Mercator, 256px tiles, the real thing. A ring
  is the actual distance at the base's latitude, which is what makes it trustworthy next to
  real roads: Portland to Seattle reads 145 mi N, to Hillsboro 15 mi W, to Bend 121 mi SE, and
  the suite asserts 97.17 miles to a pixel at zoom 0 with every level halving that, against the
  arithmetic every tile server uses.
- **The book of places is small, and the lookup covers the rest.** ~170 cities (the Pacific
  Northwest in detail, then the US metros a posting is most likely to name) and every state's
  centre, which is instant and needs no network at all. What the book has never heard of — a
  ZIP code, a street address, a suburb — goes to OpenStreetMap's Nominatim through
  `app/api/geocode/route.ts`, one request a second as the service asks, and the answer is kept
  in `vdcm.geocode.v1`, so a place is looked up once and works offline from then on. That route
  is the only thing in this app that talks to a network, and all it ever hears is the place
  *you* typed.
- **Nothing is guessed.** A name nothing can place is listed under *Not on the map* with a
  field for a ZIP code or coordinates — `45.5152, -122.6784`, typed from a phone — and a pin
  beats the lookup forever after, because a person who typed coordinates knows more than a
  table. `Remote` is not a place either: fully remote roles are listed as *no commute*, and a
  remote posting that *does* name an office still gets a pin, because the office is where the
  occasional trip goes.
- **The centre, the radius, the imagery and the view are settings**, in their own storage key
  and exposed through the workspace provider like everything else, so they survive a reload and
  reach the map through the same `useStoreSync` path as the rest of the data.
- **Distances are straight lines, not roads.** Portland to Bend is 121 miles across the
  mountain and 160 by road. This is a map, not a router, and it says so rather than quietly
  picking one for you.


Generated from the same `JobAnalysis`, on the same intensity and tone dials, by
`lib/coverLetterGenerator.ts` — deterministic, no model call:

| Band | What the letter does |
|---|---|
| **0-30%** | Three paragraphs: why this role, the relevant experience, how to reach you. |
| **40-70%** | Adds the work-mode line, a focused evidence paragraph chosen by tone, and the logistics paragraph. |
| **80-100%** | Quotes three profile bullets verbatim instead of two and leans harder on the posting's own framing. |

Two rules keep it honest:

1. **Evidence is quoted, not composed.** Bullets are re-framed as first person
   ("Run trade coordination…" → "I run trade coordination…") only when they are
   verb-first; anything else falls back to a neutral `Day to day:` frame rather
   than risk a broken sentence or an invented claim.
2. **Gaps are disclaimed, and the disclaimer is optional.** At the balanced band
   and above the letter adds one paragraph naming up to two posting keywords that
   your profile cannot evidence — *"Two things in your posting are not on my
   resume: laser scanning and 4D sequencing. I would rather flag that here than
   pad a document."* That is a strong, human thing to do, but it does put the term
   in a document a keyword scanner can read, so the **Name the uncovered
   keywords** toggle turns it off entirely. `npm run verify` asserts that no
   uncovered term ever appears anywhere in the letter *except* inside the
   paragraph that disclaims it.

The letter is editable in place (same rule as the sheet), exports as plain text or
a one-page Letter PDF, and is saved alongside the resume when you save a variant.

### How it's going: the pipeline numbers

The map and the calendar are about *where* and *when*; `/pipeline` is the screen that answers whether any of
it is working. It reads the same records and counts them: how many went out, how many were answered, where
they leak out of the funnel, which ones have gone quiet, and whether a higher match score has ever converted
into a reply.

- **Nothing is estimated.** The numbers are the records: *went out* means past `Saved`, *replied* means at
  Screen or beyond, and a rate with nothing to divide reads as a dash rather than as 0%.
- **Two things it refuses to invent.** Nothing stores *when* a stage changed, so there is no days-per-stage and
  no time-to-reply — only how long each application has been **out**, which is the duration the records
  actually contain. And an archived record is counted in the totals and kept out of every rate, because
  archiving says the search moved on, not how far that application got. Both facts are stated on the page.
- **It says what to do next.** No reply after three weeks; out a fortnight with no follow-up ever recorded;
  saved and never applied. The three piles a search actually accumulates, longest first, with the overdue
  follow-up dates the calendar already knows about.
- **The mirror, labelled as one.** Reply rate by match-score band and by work mode, with the caveat in the
  copy: at one person's scale that is worth looking at and not worth concluding from.

### Sending the resume and the letter together

**Download PDF** exports the resume on its own by default. A **Include cover
letter** switch sits next to it and appends the letter as page 2 when you turn it
on — one file, named `…_packet.pdf`, page 1 the sheet and page 2 the letter, both
still exactly 612 × 792 with the letter on its own 1in margins.

The switch is only offered when the letter provably belongs to the loaded posting,
because the letter is generated on demand and is *not* invalidated when you load a
different posting:

| State | What the control says | Why |
|---|---|---|
| No letter in this session | `No cover letter yet` | Nothing to attach. |
| Matches the posting | `Include cover letter` | Company and title both match. |
| Written for another posting | `Cover letter out of date` + `regenerate` badge | Names both employers so you can see the mismatch. |
| No posting loaded | `Cover letter unverifiable` | There is nothing to check it against. |

Matching ignores case and punctuation but is never fuzzy — a false "out of date"
costs you a click, whereas a false match sends a letter addressed to the last
employer you applied to. If the switch is on and the letter goes stale underneath
it (which loading another posting does), the export says so and leaves it out
rather than silently attaching the wrong letter. Dial drift — a letter written at
60% while you are now at 90% — is reported in the same sentence but does not block
the bundle, since the prose is a document you reviewed.


```
raw posting text
   │
   ├─ keywordAnalyzer.ts ──► JobAnalysis    (title, company, location, work mode,
   │                                         weighted keyword hits, market fit)
   │
   ├─ resumeTailorer.ts  ──► TailoredResume (ordering, relabelling, phrasing,
   │                                         page-fit guarantee, ATS audit)
   │
   └─ ResumePreview · ResumePdfDocument ──► one sheet, on screen and as PDF
```

### Keyword analysis (deterministic, offline)

No model calls anywhere. `lib/keywordAnalyzer.ts` ships a curated lexicon of ~70
VDC / BIM / trades / automation terms with aliases, category and an intrinsic
weight. For a posting it:

- extracts title, company, location, work mode, seniority, employment type,
  salary and source with layered heuristics (labelled fields win, then the
  LinkedIn `Company · Location · 3 days ago` shape, then token matching);
- counts whole-word alias hits, weighting requirements-section hits 1.35x;
- reports every hit as **matched** (with the exact profile line that backs it) or
  **missing** — gaps are surfaced, never silently injected;
- scores market fit on three axes: location, work mode and *role shape* (what
  fraction of the posting's vocabulary is actually VDC/BIM/field work). A
  residential drafting ad in a hybrid office no longer reads as a perfect match.

### Tailoring bands

The slider is the contract between "honest" and "optimised":

| Band | What changes |
|---|---|
| **0-30% Factual baseline** | Stored pitch verbatim, original bullet and skill order. |
| **40-70% Balanced ATS** | Bullets re-ranked by relevance, matching skill categories lifted, field/BIM wording swapped for the posting's wording. No new claims. |
| **80-100% Aggressive** | The posting's exact phrasing is reused in bullet labels and the skills block — but only where the profile already evidences that term. |

Two hard rules keep an aggressively tailored resume defensible in the interview:

1. **Verbatim prose.** The tailorer cannot author text. Bullets come from the
   profile or from alternate phrasings you stored on the bullet (each gated by
   its own `minIntensity`). `npm run verify` asserts this across all 36
   generated variants.
2. **Evidence-gated relabelling.** A bullet label is only replaced when the new
   posting term shares language with the existing label and the bullet is tagged
   with it. Without that rule, "Clash Resolution" became "Coordination Meetings"
   and "Design-Build Standards" became "Autodesk Revit" — keyword stuffing that
   reads as machine output.

### One-page vs continuous layout

Most review happens on screen now, so the sheet has a layout switch in **Sheet
layout**:

| | **One page** (print-first) | **Continuous** (read-first) |
|---|---|---|
| Sheet height | Fixed 8.5 × 11in | Follows the content |
| Type size | Shrunk to fit, down to 8.8pt | Exactly what you set |
| Content | Spare project bullets trimmed, then whole projects | Nothing trimmed, ever |
| Audit check | `One-page fit` — warns or fails if it overflows | `Page count` — reports pages and last-page fill, only warns on a near-empty final page |
| Auto-fit button | Enabled | Disabled (there is nothing to fit into) |
| PDF | Exactly one Letter page | As many Letter pages as needed |
| Page breaks | n/a | Between blocks — never through a bullet or a heading |

On the same deliberately bloated profile the difference is stark: one-page mode
delivers **8.8pt with 7 bullets**; continuous delivers **10.4pt with 16 bullets**,
flowing onto 2 pages. Both are legitimate documents — the toggle just makes the
trade explicit instead of silent.

Continuous mode prints and exports properly rather than merely overflowing:

- **The sheet trims to its content.** Its height is `auto` rather than a fixed
  11in and the bottom margin is the same `0.62in` as the top, so the paper ends
  where the writing ends instead of leaving a page-shaped gap at the foot.
- **Layout still reserves the sheet's height.** The element around the sheet is
  sized to the sheet's *measured* height (a `ResizeObserver` on the sheet itself),
  which is what keeps the version history and ATS audit panels from sliding
  underneath it.
- **Print:** the sheet leaves normal page flow's way (`position: static`), so the
  browser paginates it; margins come from a named `@page vdcm-continuous` rule so
  *every* page gets the same top and bottom whitespace, not just the first and
  last. Content width is identical to the preview, so line breaks match.
- **PDF:** block-level keep-together rules (`minPresenceAhead` on headings and job
  rows, `wrap={false}` on bullets) stop a heading being orphaned at the foot of a
  page or a bullet being sliced in half. The suite asserts every page is still
  612 × 792.
- **Preview:** the screen shows one tall strip of paper with dashed page
  boundaries and a "page 2" marker, plus a live `2 pages · last 41% full` badge.

Both panels under the sheet — **Versions** and **ATS audit** — are collapsible and
start folded. Their summary rows stay visible and carry the numbers worth glancing
at (`Score 91/100`, `3/40`, the latest checkpoint label), so the sheet keeps the
height it needs and the detail is one click away.

### One-page guarantee (page layout)

`lib/resumeTailorer.ts` models the printed sheet in `em` units that mirror the CSS
exactly, so it can predict page height to within a line. It spends two levers, in
this order:

1. **Type size** — down to 8.8pt, reported in the engine notes and surfaced in
   the UI next to the dial.
2. **Content** — spare project bullets, then whole low-relevance projects, then
   background lines, and only as a last resort experience bullets from the least
   relevant role (never below one per role). Every cut is named in the engine
   log, so nothing disappears silently.

Both stop at `TARGET_FILL = 0.97` rather than 100%: a sheet that measures exactly
full will spill onto page two the moment a layout engine breaks a line
differently. The PDF itself is then re-checked after rendering — if the artifact
still came out multi-page, the export tells you instead of quietly handing you a
two-page resume.

Two layout traps worth knowing about, both found by `npm run verify:pdf`:

- **`wrap={false}` is a trap.** It looks like the way to pin one page, but
  react-pdf then sizes the MediaBox to the *content* height, producing a
  10.67in-tall "Letter" PDF that printers rescale. The page is left wrapping
  normally and one page is guaranteed upstream by the tailorer instead.
- Helvetica has to stay a base-14 font. The PDF check asserts there is no
  `/FontFile` in the output, which is what keeps the file portable and the text
  extractable.

The width constant is calibrated against the existing one-page Helvetica PDF in
`~/Desktop/resume` (10.2pt body, ~35pt of slack); the model reproduces that page
height within a few points. The naive 0.5em-per-character figure over-predicted
it by ~10% and caused the engine to trim content that actually fit.

### ATS rules enforced

- Headings are the literal strings `Executive Summary`, `Technical Skills`,
  `Professional Experience`, `Key Automation Projects`,
  `Certifications & Background`.
- Single column. No tables, icons, text boxes, headers or footers inside the
  text blocks. Job dates are a right-aligned span, not a table cell.
- Helvetica only. It is a PDF base font, so the exported PDF embeds nothing and
  renders identically everywhere.
- The audit panel runs nine structural checks (coverage, one-page fit, contact
  block, quantified impact, title alignment, date ranges, credential block…) and
  scores them against the tailored text itself.

## The portfolio: assets are the anchors

The portfolio is built the way the resume is: a **store** of content, and a document composed
from it. Three ideas hold it together.

### 1. The store holds content; sections hold references

| Layer | Where it lives | What it holds |
|---|---|---|
| **Content** | The clipboard — a collapsible panel on the right of `/portfolio` | Images you import, and text modules you type, paste, or keep off a page. Placed in as many sections as you like. |
| **Presentation** | Each section | Full bleed, framed, two frames, four-up grid, filmstrip, before/after (one page or a flip), mark-up, metrics, quote, text, video poster. |
| **Type** | Each piece of text | Six named styles — `headline`, `header`, `subject`, `title`, `subhead`, `label` — chosen per slot, on a section, a page or the cover. A style is a *format*, not a size: `label` is the PORTFOLIO tag, and putting it on a section heading gives that heading the tag's look. |

A pair of photographs is content; whether it appears side by side, as a page flip, in a filmstrip
or inside a grid is a decision about *that section*, changeable without touching the store.

### 2. Text and numbers travel with the media they belong to

Tie a caption or a metric to a photograph (*Attach text to image* in the panel) and it follows that
photograph into every section that shows it — and keeps following when the section is
re-presented, moved, or rebuilt by a template. The tie is stored **on the media**, once, rather
than repeated per placement.

Two consequences are asserted in the suite rather than left to trust: a slot only draws what its
presentation can show (a metric companion is inert on a full-bleed page), and a tied caption is
never treated as stranded work when tidying up — otherwise every caption in the store would be
pulled away from its photograph.

### 3. Macro to micro: templates, then refinement

1. **Load the work** — import images, captions and numbers in any order and any amount. Each image
   gets a one-line *description* in the store; that line is what appears under it in a cards layout.
2. **Let a template arrange it** — a template is an ordered list of **slots**, not artboards: each
   names its purpose, its presentation, and how many images it wants. *Photo + caption cards* slots
   put two or three pieces on one page, each with its own description underneath.
3. **Refine** — and every part of it is editable: rename a page, move it, delete it; add another
   block *to the page you are on* (a cards row, then the numbers, then a paragraph); re-present a
   slot; unplace a frame.

**The pages** is the workspace, and it works the way the resume workspace does: you look at the thing
you are making. Every page is drawn at its real proportions — a Letter page and a 17×11in filmstrip
page are visibly different shapes — with the frames showing the actual pixels from the store and the
descriptions underneath them. Click a block on a page and its options appear *on that page*: the same
menu the export uses, each option carrying its own caveat as a tooltip.

Two surfaces, one document:

| Surface | Role |
|---|---|
| **The clipboard** (right panel) | What a page can be made of, and only that: images you imported and text modules you typed, pasted or kept off a page. Import once, describe each frame once, then drag from here onto a page or use *Place* for the selected block. |
| **The pages** (centre) | The workspace where the assets are presented: click a block, choose how it is presented, drag it to reorder the page, add another section to the same page, delete it. |

**Rows come from width.** A section takes a share of the page in twelfths — full, ½, ⅓, ¼ — and
consecutive sections that fit share a row. Two halves sit together, three thirds, four quarters; a
two-thirds beside a third is exactly that. `rowsOf` is the whole rule, and the PDF renderer and the
workspace both call it, so what is beside what on screen is what is beside what in the file. Twelve
rather than a fraction because a row's total is then an integer: "does the next one fit" is a
comparison, not a rounding decision that decides whether the fourth quarter makes it.

### 4. The look: the document's own palette, type and scale

Everything above is *arrangement*. Until recently the document had exactly one **look** — six type
sizes, one typeface family, five fixed colours — written where they were drawn, so two portfolios
made with this composer were the same document with different pictures in them. The **look** panel at
the foot of the inspector is what turns that into a decision:

| Axis | Choices | What it moves |
|---|---|---|
| **Palette** | Harbour, Graphite, Forest, Plum, Oxblood | Body ink, headings, captions, one accent, the hairlines. Every accent is dark enough to survive a greyscale printer, and the suite checks that rather than trusting it. |
| **Typeface** | Helvetica, Times, Editorial, Courier | The pairing, drawn with the *standard* PDF fonts: nothing is embedded, nothing needs downloading, and the file prints identically on a machine that has never seen this app. |
| **Type scale** | Compact, Standard, Roomy | Every size in the document, multiplied — the six styles and every caption, label and heading in the file. |

Three axes and sixty looks, each judged by a person rather than assembled by a colour wheel. That is
the deliberate difference between *customizable* and *a colour picker*: a free hex field produces a
decorated page, and a palette nobody has checked produces one that prints badly.

The rule that makes it safe to ship is that **the default look is exactly what the app already
drew**, down to the hex and the point size. A document with no `theme` is not "unstyled" — it is
harbour, Helvetica and Standard, the document it always was — and three checks pin that: the themed
type table against the static one, the stylesheet's own defaults against the palette and the screen
sizes, and the default sheet against the renderer's constants.

How one choice reaches both surfaces and the file:

- **The page** reads CSS variables (`--proj-accent`, `--proj-font-heading`, `--proj-size-headline`, …)
  that the workspace sets on the container both panels sit in. The six styles keep the same class
  names they always had; the values behind them changed. So the panel, the style picker's own samples
  and every page change in the frame you choose, and a page whose variables are never set draws the
  defaults the stylesheet carries.
- **The PDF** gets the same numbers two ways: `themedTextStyles` for the six styles, and
  `applyThemeToSheet` for the renderer's fifty-odd sheet entries — one function that maps the palette
  hexes to the scheme's and multiplies every `fontSize`, so a renderer cannot half-follow a look. Both
  engines do the same multiplication in the same place (`lib/portfolioTheme.ts`), which is the only
  reason a preview can be trusted at all.

Two limits, stated rather than discovered: the **pad tones** are page furniture and keep their own
six colours (the two pale washes are navy-tinted whatever the palette is), and a text style chosen
*by hand* on a slot keeps the size and family the table gives it. Both are visible in the panel, and
the second is arguably correct — an override that quietly changed size with the document would be a
surprise rather than a convenience.

### 5. The cover: who this is from

A portfolio is not a gallery, it is a document with a job to do. The cover is the page a hiring manager
sees first, so it says what you are, how to reply, and where else to look — the four fields and a list
of links that **who this is from** in the panel collects:

| Field | What it prints |
|---|---|
| **What you do** | One line under your name: `VDC Coordinator — available from June`. |
| **Email / Phone / Where you are** | Joined into one line, `you@example.com · 555 0100 · Portland, OR`, with anything blank left out rather than leaving an empty separator. |
| **Links** | One per line as `label | url`, drawn as a row of small print. A bare url gets its host as the label — `linkedin.com/in/you` rather than sixty characters of tracking string. |

The links are **real links in the PDF**: each one is a clickable annotation over the words, so a
reviewer can click through from the file itself. The words are always drawn as well — a PDF cannot
depend on a viewer honouring an annotation, which is the same rule the page navigation follows: the
universal layer is the content, the interactive layer is an extra.

Only `http`, `https` and `mailto` can become a link. A `javascript:` line is not rejected with a
lecture, it is *dropped*, and the field says how many lines it kept — because a script in a PDF that
gets emailed around is not a surprise anyone should get from a portfolio. That rule is checked rather
than trusted (`lib/portfolioContact.ts`).

The whole block is assembled **in the plan**, once, and both the screen and the file draw from it, so
they cannot put the email before the phone or leave the links off one of them. And a document with no
contact block plans exactly the cover it planned before — no empty line, no reserved space.

### 6. Print size: will this look as sharp as it looks here?

This is the question the **print size** readout on the page panel answers, and it is worth being blunt
about why it exists: *a screen cannot tell you*. A photograph fills a 7-inch frame beautifully at any
resolution — the browser scales it and it looks fine — and the same frame printed at 300 DPI wants 2100
pixels across while a phone photograph cropped tight might carry 400. Nothing about the page as drawn
says which of those you have, so the readout says it for every frame on the page:

```
● elevation.jpg                        7.0 in wide
  229 DPI — sharp at this size.
  1600×1000px source, whole frame
● detail.jpg                           7.0 in wide
  57 DPI — too tight a crop for 7in. Widen the crop or place it smaller.
  400×300px source, whole frame
```

- **The placed width is worked out the way the renderers work it out** — the printable width, the
  section's share of the row, split between the frames that share it — so the number beside the frame is
  the number the file will use.
- **The verdict is in words, not numbers**, because "229 DPI" means nothing to most people and "sharp at
  this size" means all of it. The thresholds are 200 DPI for sharp and 120 for *fine on screen, slightly
  soft printed* (`TARGET_DPI` and `MIN_DPI` in `lib/images.ts`), and the arithmetic is the same
  `sourceRect`/`placedDpi`/`dpiVerdict` the suite has been checking since before any screen used them.
- **The source line says what is actually being placed**, cropped pixels included — which is what makes
  the warning actionable: if a frame is soft, the two honest fixes are *place it smaller* or *don't crop
  it so hard*, and the readout tells you which one you are looking at.

What is *not* built yet is the crop tool itself: a frame still shows the whole picture, fitted to the
frame. So this is half of the feature — the half that tells you when the other half would matter — and
it changes nothing about any existing document, because it only reads.


**A section states the space it wants.** Each frame-showing variation declares how many frames it
wants (`frames` in the registry), so adding a section with that variation arrives with that many
frames — empty, at the right size and shape, drawn as labelled holes. `frameSlots` decides the count
for both surfaces, so arranging four frames and exporting four frames are the same statement. This is
what makes a page arrangeable before the photographs exist, and what a short store shows you (a
template applied to an empty store gives you the structure with the holes in it). An empty slot adds
no picture — the PDF suite asserts that by rendering the same page twice and comparing the image
placements and the frame widths.

**Movement means something in both axes.** ← and → move a section one place, which within a row *is*
left and right. ↑ and ↓ move it out of its row, past the whole neighbouring row — otherwise the two
pairs would be the same gesture twice. Moving a section re-flows the page, because widths decide rows;
the width buttons are how you put it back, and the section says which row and side it is on.

**A row of one is not a row.** Single-block rows go into the page column exactly as they did before
rows existed. Wrapping them added enough height to push the busiest page past its bottom margin —
which the PDF suite caught as "the page count matches the plan" failing, and which is why that check
exists.

**A page is white whatever the theme is doing.** That sounds obvious and it is the thing that broke
dark mode: the arranging controls used to be drawn *inside* the page in theme colours, so in a dark
theme light-grey chips sat on a white sheet and could not be read. Two rules now, both in
`app/globals.css`:

- Everything drawn on a page uses `.proj-page` / `.proj-ink` / `.proj-navy` / `.proj-soft` /
  `.proj-rule` / `.proj-empty` — hard-coded values lifted from the PDF's own constants
  (`components/PortfolioPdfDocument.tsx`), exactly the convention the ATS sheet already used. Theme
  tokens are for the chrome, not for the paper.
- Everything *editable* sits on an opaque panel (`bg-card` + `shadow-lg`, sticky at the top of the
  workspace) or in the page caption — never floating over the artwork. The selected section's whole
  control set lives there now: variations, width, frames across, frames, height, the four arrows,
  delete, and *See it printed*.

**The empty frame is the printed panel.** An empty frame used to be a dark dashed hole with an icon
in it, which read as "broken" rather than "reserved". It is now drawn in the same colour, the same
hairline and the same size and shape as the panel the export paints in that frame's place, with its
label *underneath* — outside the panel — so the thing you compare against the print has nothing
editor-only inside it. The PDF suite counts the painted rectangles in the file, so "what you see is
what is drawn" is an assertion rather than a promise.

**The live preview is the file, not a picture of the file.** `PortfolioPdfPreview` renders the export
with `pdf()` on the same document component the download uses, patches the `/Trans` transitions into
the real bytes with `bytesToString`/`stringToBytes` (a `TextDecoder("latin1")` would remap 0x80–0x9F
and corrupt a compressed stream), and puts the result in an iframe at `#page=N`. Its re-render is
keyed on a change *signature* — both stores' `updatedAt`, the loaded image count, and a manual
generation counter — because keying it on object identity is the loop that already bit once. The
download button writes those same bytes, so the preview cannot drift from the export: it is the
export.

**Pages move by their corner.** A grip in the page's top-right corner starts a page drag; the half of
another page you drop on decides whether the page lands before or after it, and a bar marks where it
will go. It works *between projects* as well as within one — `moveSlideTo(portfolio, slide, target,
"before" | "after")` names two pages and works out the projects and the index arithmetic itself,
because an index is only meaningful inside one project and the gesture is not. Dropping a page back
where it came from returns the same document, so it costs no undo step.

**Frames have a shape, and a page can spread.** A section's frames take one of three shapes — *wide*,
*standard*, *tall* — and a page can **spread its sections over its height** instead of packing them at
the top. Both come from one table (`FRAME_ASPECT`) that the PDF renderer and the workspace both read,
so "tall" on screen is "tall" in the file, and a page's fill setting is carried on the planned page for
the same reason.

**The page is where you edit; the store is the library.** Words and numbers are typed *on the page*,
in place, using the same `EditableText` the resume sheet uses — click a section and its heading, body,
captions and numbers become typeable exactly where they will print, at the size and font they will
print at. What you type is written to the **document**: `block.title`, `block.body`,
`block.captions[imageId]`, `block.metrics`. That split matters when a photograph appears on four
pages: improving the caption on one page cannot change the other three, while the store's description
stays as the default everywhere. Two flags keep the layering honest — a caption typed on a page wins
over the tied text *and* the store's one-liner, and `metricsEdited` stops the store's numbers
overwriting numbers typed in place.

**A picture imported on the page is also a library asset.** Every empty frame carries its own *add a
picture*; the file is downscaled, its bytes go into the image store, an asset appears in the library,
and only then is it placed — into *that* frame (`placeAssetAt`), not appended, so filling hole three of
four does not rearrange the page around it. Nothing has to be imported into the store first, and
nothing imported this way has to be imported twice.

**Page layouts.** *New page* offers the shapes a page takes — three across and one big below, four
squares, a two-thirds frame with the words beside it, a hero over two halves, a sequence with bulleted
notes — plus an empty page. `lib/pageTemplates.ts` holds them as spans and presentations, and the
little diagram in the menu is drawn by running `rowsOf` over the template's own spans, so the picture
cannot promise a layout you do not get. A template is a starting shape and nothing more: every section
it makes is an ordinary section, movable and resizable immediately. The templates are also why the
width steps now include ¾ and ⅔: a layout that used a width the editor could not offer would be a
shape you could not rebuild by hand, and the suite asserts every template width is offered.

**Text placement, and bullets.** A section can put its words below the frames (the default), beside
them on the left or right, above, or nowhere — and the body can be a paragraph, a lead line, or
bullets, which is the same text split on its line breaks rather than a second field to keep in step.
Both surfaces render it the same way, including the three-fifths split when the text sits beside the
frames, so choosing a placement moves the text on screen and on paper together.

**Sections move between pages.** Drag a section onto another page and it lands there — at the place
you dropped it, in this project or another (`moveBlockToPage`), with the panel offering a "move to
page" list for precision. A drag onto a section on the same page is still a reorder; the two are the
same gesture from the reader's point of view and different operations underneath.

**Three layers: the page, the pads, the sections.** Grouping cannot be a *container* here, because
sections flow — they re-flow when a width changes, which is the whole reason the page is rearrangeable.
A box that "held" three sections would have to move them, and the page would stop reflowing. So
grouping is a **layer**: `slide.pads` holds panels and rules positioned in fractions of the printable
area, drawn before the content, and every section sits on top of them. `PadLayer` in the renderer and
`PagePads` in the workspace read the same array, in the same order, and both surfaces position against
the same 54pt box (the workspace gets it by positioning rather than padding, because padding resolves
every side against the *width* and the vertical margins would come out wrong).

**The clipboard holds images and text, and nothing else.** The panel is not a "store" you go and edit
in — it is a clipboard, in the ordinary sense of the word: you put something in it, you take it out. Two
things go in, both deliberately: **images** you import, and **text modules** — words you type, words you
paste off your system clipboard, or words you highlight *on a page* and keep (`Save highlighted text`,
which reads the selection straight from the slot it was made in). Drag either onto a page: a picture
lands in the frame you dropped it on, and a text module joins that section's words (or becomes a text
section of its own on empty page space). Before/after pairs, metrics, links and saved sections are no
longer things the panel makes: a number and a link are set on the section that shows them, and a section
is rearranged by dragging it rather than by keeping a copy of it. Sections that already reference a pair,
number or link still print them — nothing that resolves got taken away — and the panel says so rather
than quietly hiding them. `copy` puts a module on your *system* clipboard and `Paste` reads it back,
which is the behaviour a clipboard is supposed to have.

**A pad is a layer, not a container** (see above) — and the same principle put every page's controls
*below* the page: `section`, a choice of section kind, `panel`, `line`, *spread over the page* and
*delete this page* all sit under the page boundary, because a toolbar drawn inside the page both hides
the design and eats the height the sections need. What stays inside is the drawing: the sections and
the pads themselves.

**A line is three pixels tall, so it is caught by the strip around it.** A hairline rule is 2.4pt of a
Letter page — about three pixels on a card — and asking anyone to hit that, or to pick one of four corner
handles stacked on top of each other, is asking for a bad time. So a pad whose height is under
`LINE_STYLES.medium` gets a different set of affordances: an invisible **grab band** that reaches eight
pixels past it on every side (a panel gets two, just enough to catch its edge), **handles at its ends**
rather than corners, and a dashed ring *around* it when selected instead of the inset ring a panel gets,
which is invisible at that height. The band changes the hit area and nothing else — the pad is still drawn
exactly where it will print — and because the sections layer sits above the pads layer, a band never
steals a click from a caption. The arrow keys finish the job: the selected pad moves half a percent at a
time (about three points), ⌥ moves a whole column, and ⇧ resizes it from the ends (`dragPad` modes `w` and
`e`). Dragging snaps to the twelve columns; the arrows deliberately do not, because that is what they are
for.

**The cover is a page like any other.** Its title, standfirst and author are editable in place — they
are the *document's* words (`portfolio.title`, `subtitle`, `author`), which is why typing on the cover
changes the title in the header too — and its frames are yours to choose: `coverFrames` returns the
explicit choice or the first three frames of the work, `setCoverImage` fills a slot, `clearCoverImage`
empties one, and the plan carries them so the file and the screen draw the same three. Importing onto
the cover puts the picture in the clipboard as well, like every other import.

**A cover you have touched is yours; one you have not follows the work.** `coverFrames` is the whole
rule: no `coverImages` at all means the cover shows the first frames of the work, so a new document's
cover is not blank and dragging a picture into a section puts it there; the moment a picture is added to
the cover or cleared from it, the stored slots *are* the cover — empty ones included, in their own
positions. It used to filter the empty strings out and fall back to the work, which produced two bugs
that read as one: the × on a cover picture put it straight back (the section below supplied it again),
and clearing one of three slid the other two along. Adding a picture fills the **first free slot**
(`nextCoverSlot`), so filling a hole fills that hole rather than overwriting whatever came last.

**Six styles, named after what they are, and none of them new.** A portfolio's typography is not a
hundred choices: it is a handful of settings used consistently, and the document already had them. So
`lib/textStyles.ts` names six — `headline` (40pt), `header` (24pt), `subject` (12pt), `title` (11.5pt
bold), `subhead` (11.5pt accent) and `label` — and the last one **is the PORTFOLIO tag the cover has
always worn**: 10pt, 2.4 tracked, upright capitals, in the accent. Nothing about it changed; it just
became something you can put anywhere. Every entry carries both surfaces at once, the numbers the PDF
draws with and the class the workspace draws with, because a style that looked one way on screen and
another on paper would defeat the point of a preview.

**One dropdown per kind of thing, acting on what you highlighted.** The left panel's style section has
three: **text style** for words, **line style** for how thick a line is, **pad style** for how round a
panel's corners are. It replaces six controls that did one job — a "heading style" picker beside a "text
style" picker in every section, two more under every page, two on the cover — and a *size* pill row that
mixed thickness with panel. None of them could style three words. They live in the panel and **only** in
the panel: there used to be a style bar above the pages repeating the same three dropdowns, which meant
two answers to "where do I style this?" and one of them floated over the top of the document.

**Both rails are flex siblings of the pages, and folded they are tabs.** The panel on the left, the pages
in the middle, the clipboard on the right: one row, so opening a panel makes the *pages* narrower rather
than pushing them down — a panel stacked above the grid cannot do that, and with `sticky` on it, it also
slides over the top of a page as you scroll. Folded, each rail is a narrow tab down its own side
(`style & page`, `clipboard`) rather than a button that takes a line of the page. The page grid is two
across with a ceiling on each card (`PAGE_CARD_MAX_PX`, about what a Letter page measured at three
across), because fewer pages per row is meant to leave room for the rails, not to enlarge the pages.

**Inside the panel, a group takes the panel's width.** `ControlGroup` lays its controls out in one
full-width row, with an optional two columns (`columns={2}`) for short, equal choices — the twelve pad tones,
filled or outline, full width | half | a third — and the explanation moved from the label onto the group's
hover text, because at 19rem a label like "tone — one palette, so pages stay consistent" wraps to two lines
before you have read a single choice. The pad's controls used to sit in a **four-column** grid whose
breakpoints were the *window's*, not the panel's: on any normal screen that is four columns of about 65px,
which is what crushed the tone names, the chips and the label field into slivers. Nothing in these panels
uses a viewport breakpoint any more, and the pad's position reads as words — *left 50%, top 25%, 50% wide,
4% tall* — rather than as four numbers on one line.

**Styling a selection is a range over plain text, not mark-up.** `TextStyleRange` is
`{ start, end, style }` in the slot's own characters; `applyMark` cuts overlapping ranges out at the point
of the edit, so the stored list is always a set of non-overlapping stretches and both renderers are one
loop over `segmentsOf`. The words stay searchable and extractable; the PDF draws each run as a nested
`<Text>` (asserted on the real bytes: one heading carrying both a 10pt tracked run and a 24pt one), and the
workspace writes each run as a `<span>` with its own class, imperatively inside the editable host so the
caret survives. Two rules keep it to one control: a caret with **nothing** highlighted means the whole
field, and a range that covers the **whole** text is stored as the slot's own style — so "style the heading"
and "highlight the whole heading and style it" are the same stored thing, and a whole-field style survives
later edits where a range would have to be re-anchored.

**Line style and pad style are named presets, and the numbers live in one table.** `LINE_STYLES` gives
*hairline / thin / medium / bar* as heights (2.4pt, 8.2pt, 20.5pt, 54.7pt on Letter) and `PAD_STYLES` gives
*square / soft / round / pill* as radii. The pad still stores the fraction and the drawing still reads it;
the name is how you reach it. Each dropdown shows the nearest preset, so the bar always says what the pad
currently is.

**Nothing reaches the file that the page cannot show.** The PDF had drawn a footer on every page — the
document's title and "Page 3 of 8" — plus an accent rule under the cover's name and notes under video and
mark-up sections, and the cards drew none of it. Now they do: the footer is printed on every card, the cover
is centred with its rule and its meta line, and a flip half shows the sentence the file appends to its
caption. The suite mounts the real workspace and looks for each of them by name, because "the preview shows
it" is a claim that should fail loudly when it stops being true.

**And it is drawn where the file draws it.** The footer went in first at the *bottom of the printable box*,
which put it among the sections rather than in the bottom margin the PDF uses — off by the difference between
`bottom: 24pt` and "the last thing in the content". It is drawn against the page now, at 3.03% of the page's
height, which is 24pt of a Letter page exactly. That is the class of bug worth remembering here: not a
missing thing, but a thing in the wrong place, which reads as "not correlating" long before anyone spots why.

**The two surfaces ask for the same pixels through one function.** A picture can be in three different places:
on the frame inside a section (`block.images`), in the store behind an asset id (`block.assetIds` — that is
every picture placed from the clipboard), or on the plan itself (the cover's frames, a flip page's half). The
workspace read the **plan**, which resolves all three; the PDF preview read the **raw document**, which only
has the first — so a photograph could sit on a card while the file drew a blank panel in its place. Both now
call `planImageIds` on the plan they are about to draw (`lib/portfolio.ts`), which is one function and two
callers on purpose: `collectImages(portfolio, library)` wraps it for the tallies, and the PDF suite builds its
own preview map from the same call, so a list that drifts fails the suite rather than the reader. The lesson
generalises: when two renderers have to agree about *what exists*, they must derive it from one description —
and the plan is that description.

**One panel, one target.** Everything that modifies a page lives in the left column: the style dropdowns, the
selected section's own controls (presentation, width, frames, height, text placement, move, save, delete), the
selected pad's (tone, word, outline, width), and the page's (add a section, a line, a panel; change its shape;
spread it; read it; delete it). It used to be a bar above the pages, a strip under every page, and two panels
at the top of the workspace, and "which page does this act on?" had a different answer in each. The panel
follows the reader instead: a selection wins, then the page you last clicked, then the first page — so it
always has a target, and never shows a page that is not on screen.

**If it is on the page, it is editable.** Editability used to be gated on selecting a *section*, which meant
the cover — a page with no sections to click — could never be typed into at all, and a page you had not
selected yet looked like a picture of a document rather than a document. Now every heading, line, caption and
number is typeable on the page it is on, with nothing selected first. Two guards make that safe: a press that
starts in text never starts a drag (the same rule the pads follow), and a pad's *label* is still typed once
the pad is selected, because a pad is dragged by its body.

**Hyperlinks come out until they can be authored.** The file's footer drew the projects as link annotations
and the card dressed them up as links, which on a card can only ever be a link that does not work. Both are
gone: the footer is the document's title and the page number on both surfaces. A link comes back as its own
**hyperlink section** — a section carrying an address and its own settings, added deliberately — rather than
as something the footer does on its own. The document's outline is unaffected.

**The words are what print, so the style is applied to the words.** `styleWords` sets the label's
capitals before either surface sees the text, which is why a title typed `civil engineering` prints as
`CIVIL ENGINEERING` — asserted on the real bytes, by looking for the tracked-capitals signature (2.4pt
of tracking at 10pt is what react-pdf writes as `-240` in the TJ array). And `resolveTextStyle` falls
back per slot and per surface — a section title to `title`, a page heading to `header`, the cover's
title to `headline` — so an untouched document is drawn exactly as it was, and choosing nothing costs
nothing. "As drawn" in the picker is the *absence* of a choice, not a seventh style: absent is how it
is stored, so clearing a slot drops the field and a section nobody has styled carries nothing.

**A style follows the words, wherever the words end up.** A section owns the pages it is drawn on, so
the plan carries the resolved styles for those pages: `flipPageStyles` maps the section's `title` onto
a flip half's *subtitle* (the half's own big line is its before/after label, part of the pair's
apparatus, like a page number), and `stripPageStyles` does the same for a filmstrip row. That is why
choosing `label` on a section sets its heading *and* the heading on the pages it owns — which is what
one section owning two pages has to mean — and why `pageBlockId` exists to tell a page that holds its
slide's sections (`projectId:slideId`) from one a section owns (`projectId:slideId:blockId:half`).

**The palette is written down once.** `PORTFOLIO_INK` holds the five values that had been written in
the PDF's constants *and* again as `.proj-*` classes in `globals.css`, and both surfaces read it now —
a preview that can disagree with the file is worse than no preview. The suite pins the stylesheet
against the table, so the two cannot drift apart again.

**Every word on a page is editable, including the ones that had no way in.** Pads' labels are typed
where they sit (the press on the label must not drag the pad out from under the caret, which is why
`beginPadDrag` ignores a press on contenteditable text); a before/after pair's two labels are typed
above the frames, which is also the only place they were never editable before; and a flip half or a
filmstrip row — pages a section owns, with no sections on them to click — can now be reached by
pressing **select the section this page belongs to** and then typed directly, writing through to the
section's own title, body and captions.

**A page's layout is a page's business.** Project templates and page layouts are different things, and
the code keeps them apart: `applyPageTemplate` *adds* a page from a layout, and `relayoutPage` reshapes
**one page** — the sections it already holds, given the layout's widths, columns, heights and text
placement, and keeping everything else (what they hold, their presentations, their words, their pads).
A layout with more slots than the page has sections fills it out with empty ones; a page with more
sections than the layout has slots keeps the extras untouched, because dropping someone's work to make
a shape fit is a worse trade than an uneven page. Applying the same layout twice returns the same
document, so it costs no undo step. Nothing outside that one page moves — the suite asserts exactly
that, and it is the difference between the two functions.

**A pad press has to survive its own release.** Selecting a pad you placed earlier involves the pointer,
and a click with a pixel of jitter counts as a drag — which takes pointer capture, which makes the
browser deliver the release's `click` to the *capturing* element, the page box. So the pad's own click
never fired and the box's click deselects, and the modifiers appeared while the button was held and
vanished on release. Two guards now, in one testable function (`clickClearsTools`): capture is taken
only once the pointer has travelled more than a few pixels, and the box's click clears the tools only
when the press began on the page and the click landed on the page. A pad created with the button never
touched any of this — which is why the bug only showed up on the second visit.

**A tone, not a colour.** `PAD_TONES` is six named values — wash, tint, card, line, navy, teal — each
carrying the ink that is legible on it, and each chosen to survive a greyscale printer. There is no
colour picker, deliberately: a named palette is what keeps a page looking designed rather than
decorated, and pairing every fill with its own ink means a pad's label cannot be set in something
unreadable. A pad can also carry a word ("Before", "Existing") set in that ink — which is the thing
that actually divides the page, since a label says what a group *is*.

**Pads snap to the sections' grid.** Twelfths across, twenty-fourths down, both edges, with a
tolerance so aiming between the marks still gives you free positioning — so a panel can be made to line
up with a third or a quarter exactly, which is most of what grouping a row means. A rule's minimum
height is a hairline rather than a panel's, which is the difference between a divider and a stripe.

**A pad drag is one undo step.** The drag is previewed locally and committed once, on release:
committing per pointer-move would push a hundred steps for one gesture. The same rule now holds across
the whole editing surface — `findBlock`/`findPad` plus `blockHas`/`padHas` mean a pill pressed twice,
a caption typed back to what it was, an arrow pressed at the end of a page, or a pad dropped where it
started, all hand back the *same* document, so none of them costs an undo step.

**And the honest limit:** a pad is a visual grouping, not a container. Move a section and the pad stays
where it was, because the sections re-flow and the pad does not. That is the trade that keeps the page
rearrangeable, and the pad panel says so on itself rather than letting you find out by moving
something.

**One comparison that must never be plain.** The stores rewrite `updatedAt` on every save, so a
subscriber comparing the read-back with what is on screen sees a difference every time. Asked
plainly — as the portfolio subscriber once did — that resets state, clears the undo history and
writes again: the loop that made edits appear only after a reload. `storeChangeIsReal` is the
stamp-aware question, and the suite asserts both that it answers correctly and that the subscriber
asks it.

**Undo and redo** cover every edit (`⌘Z` / `⇧⌘Z`, or the buttons in the header). History lives beside
the document in the provider, one step per gesture — a drop that changes nothing returns the *same*
document, so dragging a block back where it was does not fill the history with no-ops. The same rule
covers a move at the end of a page: the arrows return the document they were given.

**Dragging** works from the store into the pages, within a page to reorder, and between projects in
the list (drag the handle — not the header, so a stray drag cannot interrupt a rename). A block
dropped on another takes its place; an asset dropped on a block is placed in it; an asset dropped on
empty space on a page gains a section of its own rather than being swallowed. Drag state is kept in
React rather than in the drag payload, because browsers disagree about custom data types on drag
events and a drop that silently does nothing is worse than no drag at all.

It is a **proportional preview, not the PDF**: same plan, same order, same page sizes and frame
counts, drawn with web layout instead of paper. Both this and the export call `planPortfolio` with
the same store, which is what keeps them describing one document — a bug in that shared call is
caught by the PDF suite rather than by you noticing the file disagrees with the screen. When you need
the paper truth rather than the arranging surface, the live preview (or *read this page* in a caption)
renders the actual file.
`Place N unplaced` is the bridge for anything a template did not consume: leftover pairs become
comparison sections, frames go into wide rows of four, spare captions and numbers into a section
each. Applying a template with twelve images and five slots places all twelve — the promise that
loading work first never silently loses it.

PDF has no drag-and-drop, so "modular" has to mean **ordered slots in the page plan**, where they
can be laid out, measured and printed. That is the constraint the whole design works within: the
structure is data, and the drag-and-drop you would expect in a design tool becomes move-up,
move-down and re-present.

## Before/after: the flip

Marking up a change is easy; making the *before* and *after* comparable in a PDF is not,
because PDF has no drag widget and no continuous pointer events. A draggable reveal slider
— the thing people picture — is **impossible** in a PDF. There is no widget for it, and no
event model that reports pointer position. Anything that pretends otherwise is a
screenshot.

So a before/after pair ships two honest options, and `PORTFOLIO_CAPABILITIES` records both
so the UI cannot promise more than the file delivers:

| Mode | What it produces | Reads in |
|---|---|---|
| **Side by side** (`pairMode: "side"`) | Both frames on one page, labelled `Before` / `After`, matched crops and matched scale so the difference is the only thing that changes. | Every viewer, and on paper. |
| **Flip** (`pairMode: "flip"`) | Each frame on **its own page**, full width, same geometry, same caption position — so turning the page wipes one into the other instead of jumping. | Every viewer as two pages; the wipe itself animates in Acrobat and Foxit. |

The flip pairs are planned as two adjacent pages (`kind: "flip"` in `lib/portfolio.ts`) and
both halves are real, numbered, readable pages. That is deliberate: the animation is a
bonus, not the mechanism. If a viewer ignores page transitions — Chrome, Preview, every
phone — you still get two identical-framed pages, which is a comparison you can read.

### Writing a transition into the bytes

`/Trans` cannot be set through `@react-pdf/renderer` at all, and the reason is worth
knowing: its `Canvas` escape hatch hands the paint callback a **whitelist of thirty-five
drawing methods** (`rect`, `moveTo`, `fillColor`…) and nothing else — no page dictionary,
no refs, no annotation API. So the transition is written into the file afterwards by
`lib/pdfPatch.ts`, which is a small, deliberately narrow byte-level step:

1. Read the object offsets **from the file's own cross-reference table**. Hand-scanning for
   `N 0 obj … endobj` looks easier and is wrong twice over: pdfkit writes objects back to
   back with no separator (`…endobj8 0 obj…`), and a compressed content stream is arbitrary
   binary that may contain the letters `endobj`, so a body search stops early or runs past
   the object and swallows the next one.
2. Bound each object's bytes by where the **next** object starts. A fixed-size window reads
   into the following object and picks up its `/Type /Page` — which is how a page transition
   ends up attached to a font.
3. Insert `/Trans << /Type /Trans /S /Glide /D 1 /Dm /H /M /O >>` after the page
   dictionary opens, then **rebuild the cross-reference table**, because inserting bytes
   shifts the offset of every later object and the original table is now a set of lies.

Four assertions hold this together in `npm run verify:pdf`, and each one caught a real bug
while it was being written: every planned page carries exactly one glide; the rebuilt xref
points at real object headers; patching twice is the same as patching once; and — the check
that actually matters — **pdf.js re-parses the patched file** and finds the same page count
and the cover text, so the surgery did not corrupt the document.

## Export

| Button | Path |
|---|---|
| **Download PDF** | `@react-pdf/renderer`, lazily imported so it never enters the initial bundle. Real vector PDF, a single `Page`, `wrap={false}`, type size clamped to the largest that fits. With **Include cover letter** on, one extra `Page` carries the letter and the self-check splits the page count to confirm the letter took exactly one page. |
| **Print** | `@media print` pins the on-screen sheet to the page box (`@page { size: letter; margin: 0 }`), so "Save as PDF" matches the preview pixel for pixel. Highlights are stripped. |
| **Copy text** | Plain-text export with the same section headings, for pasting into application forms. |

## Keep it in a folder

`localStorage` is local, private and completely invisible: clearing the browser's site data takes the whole job
search with it, and there is nothing to copy to a backup drive. **Master Profile → Keep it in a folder** points
the app at a directory instead, and then every change is written to it as you work:

```
Career Matrix/
  workspace.json     the same bundle Export writes — profile, draft, applications, portfolio
  images/
    im-8f2c1a.jpg    the picture bytes, written once each
```

Four decisions worth knowing:

| Decision | Why |
|---|---|
| **A folder, not one file** | A single JSON with the pictures in it would be base64 — a third larger than the bytes and rewritten *in full* on every save. A portfolio with ten photographs would mean writing megabytes on every keystroke-shaped change. With a folder, `workspace.json` stays a couple of hundred kilobytes and the images are written when they arrive and never again. |
| **It is `buildBackup()` that gets written** | Byte for byte the same bundle the manual Export produces, through the same function. A folder restored from disk and a bundle pasted into the box are the same workspace, and the suite pins the file's shape. |
| **Only missing pictures are copied** | A save is a rewrite of one small file plus the images the folder has never seen. Rewriting pixels that have not changed is how a "save" turns into a stall. |
| **A remembered folder comes back un-permitted** | The handle is stored in IndexedDB, so the panel can offer *Reconnect to "Career Matrix"* on the next visit — but the browser makes the app ask again from a click. A remembered handle is never a licence to write to a folder unattended. |

**Chromium only**, because `showDirectoryPicker` is: Chrome, Edge, Brave, Vivaldi. Safari and Firefox have no
equivalent, so the panel says so in as many words and the buttons stay visible but disabled — a missing button is
a mystery, a disabled one is an answer. Export and Import JSON remain underneath for exactly that case.

The picking, the permission prompt and the writing are on the manual list rather than in the suite: jsdom has no
File System Access API. What *is* checked is everything around them — the file names (including one that cannot
escape the folder), the fact that the file's contents are the Export bundle and contain no base64, and the
fallback rendering, tested by being in a process that genuinely cannot write files.

## Running the checks

```bash
npm run verify:all        # everything, with a report
npm run verify            # engine suite only       (806 assertions)
npm run verify:pdf        # PDF artifacts only      (219 assertions)
npm run verify:screens    # the screens, as pictures (needs a Chromium browser)
npm run preview:templates # render each template's starting layout to a PDF
npm run typecheck         # tsc --noEmit
```

`verify:all` runs the type check, both suites, a route smoke test, and the screenshot check; if a
dev server is listening it requests every page and fails on a rendered error. It then writes what it could
not check by machine — the interactions — as a numbered manual list, and generates the demo
content for it:

| Output | What it is |
|---|---|
| `tmp/test-package/REPORT.md` | Results table, generated files, the option/capability table, the manual list, and the known gaps. |
| `tmp/test-package/portfolio-demo-backup.json` | A complete backup — profile, draft, a demo portfolio, and a store of captions and metrics. Import it from `/profile`. |
| `tmp/test-package/before-ceiling-void.png`, `after-ceiling-void.png` | Two real 1200×800 PNGs to import into the store and pair, which is what unlocks the before/after options. |
| `tmp/pdf-check/*.pdf` | The rendered artifacts, including the flip pages with their transitions. |
| `tmp/visual/latest/*.png` | A screenshot of every screen, as drawn now. |
| `tmp/visual/diff/*.png` | Only when a screen moved: what changed, painted red over the new picture. |

### The screenshots

The two suites check bytes and text, and neither of them can see a layout regression — a panel
that grew over its heading, a column that stopped being a column, a button that lost its padding.
`npm run verify:screens` (also run by `verify:all`) screenshots all eight routes and compares the
pixels against a baseline in `tmp/visual/baseline/<browser>/`.

- **It never leaves the machine.** The browser is pointed at the dev server by IP and at nothing
  else, so the map's tiles fail fast and the calendar is captured in its no-imagery state: the same
  picture every run, with no third party in the loop.
- **A throwaway profile**, so every capture is the *first-run* view — empty localStorage, empty
  states. The populated screens are on the manual list, not here.
- **Per-browser baselines**, because two engines do not draw the same pixels: switching browsers is
  not a regression.
- **First run writes the baseline** and reports a skip, not a pass — there was nothing to compare
  yet. After that a change fails with the share of pixels that moved, and `npm run verify:screens --
  --accept-screens` records the new baseline once you have decided the change was wanted.
- **A skip, not a failure, without a browser.** It looks for `CHROME_PATH`, then Chrome, Chromium,
  Edge and Brave; if none is there it says so. The path itself is still exercised on every run by a
  stand-in script that writes the PNGs a browser would, so capture → compare → catch → accept is
  tested even on a machine with no browser at all.

The demo document is also planned during the run rather than only written out, so a fixture
that stops matching the model fails the package instead of quietly going stale. Those metrics
sections carry no numbers of their own — if the store stops feeding the planner, the check
fails.

Everything the package writes lands in `tmp/`, which is gitignored. The exit code is non-zero
when anything fails, so it can go straight into a hook or a pipeline.

### Publishing a blank copy

This repository is a *working* copy: it has a real resume in `lib/masterProfileSeed.ts` and a
real name in a few fixtures. `npm run blank` builds the version that goes on GitHub — the same
app with a starter profile and the author's details replaced — **without touching this copy**:

```
npm run blank                      # → tmp/blank-career-matrix
npm run blank -- --out ../matrix   # somewhere else
npm run blank -- --force           # replace one that already exists
```

What it does, and why each part matters:

| Step | Why |
|---|---|
| Copies the app, the tooling and the config into the output directory | Nothing of yours moves: this copy keeps its profile, its `tmp/` and its history. |
| Overlays `blank/**` — the starter profile, and the short public README | The blank material is *in this repo*, under `blank/`, so it is reviewable and editable rather than hidden in a script. |
| Moves this README to `docs/BUILD-NOTES.md` and puts the public one in its place | The build notes are the most interesting thing in here and are worth publishing; they just are not a README for somebody who has never seen the app. Delete that file if you would rather not. |
| Replaces the author's name, email, phone, handles and employer with the starter identity | Both the *data* and the *fixtures that assert it* — a test saying "the exported PDF contains their name" becomes a test saying it contains the starter name, so the copy stays self-consistent. |
| Links `node_modules` instead of installing | The copy has to run its own checks, and downloading a second copy of the same tree to prove that is minutes for nothing. |
| **Runs the type check, the engine suite and the PDF suite inside the copy** | A published repository whose own test suite fails is worse than no repository. The only honest way to promise otherwise is to run them and look — so this exits non-zero and says "NOT ready to publish" if anything is red. |
| Leaves a **fresh git repository with one commit**, and an MIT `LICENSE` | Fresh is the point: cloning this working copy would carry its history, and `git log -p` is a surprising place to read somebody's employment history. |

The commit's author is **never** left to git's fallback: with no `user.name` configured, git commits as
`user@hostname` — a person's name and their laptop's name, permanently, in a public repository. So it uses
your `git config` if it is set, a neutral `Career Matrix <noreply@example.com>` if it is not, and
`npm run blank -- --author "Your Name <you@example.com>"` overrides either. It prints the identity it used,
and how to rewrite it (`git commit --amend --reset-author`) if you change your mind.

The copy contains no personal data by construction and is checked before it is handed over:
`grep -ri <your name>` in it returns nothing. To refresh it after further work, run
`npm run blank -- --force` again; it is a snapshot, not a branch — and because a `--force` rebuild starts a
*fresh* repository, re-add the remote afterwards (`git remote add origin …`) before pushing again.

## File map

```
app/
  layout.tsx            shell, theme bootstrap, toast host, WorkspaceProvider
  page.tsx              workspace (split view) + collapsible ATS audit panel
  calendar/page.tsx     month grid, overdue queue, agenda, .ics export, details, and the map
  pipeline/page.tsx     how the search is going: the shell around the pipeline board
  cover-letter/page.tsx letter generator, in-place editor, PDF/text export
  portfolio/page.tsx    portfolio composer: sections, the presentation menu, the two panels
  profile/page.tsx      Master Profile editor, resume import, JSON import/export
  saved/page.tsx        saved applications, pipeline stages, search/sort, re-export, details
  api/geocode/route.ts  the one network call in the app: a place, a ZIP code or an address, from the book
                        first and OpenStreetMap second, one request a second and nothing about a job in it
components/
  JobIngestion.tsx      posting input, editable parser output, keyword + market panels
  ResumePreview.tsx     true-size 8.5x11in sheet, highlighting, page-fill meter
  ResumeImportCard.tsx  PDF/DOCX/text resume import with a review-then-apply step
  SaveVariantDialog.tsx the application record form: applied date, follow-up, office address, notes
  ApplicationDetailsDialog.tsx  what arrives later: the office address (and its map pin), the contact, the notes
  JobMap.tsx            the calendar's map: a draggable tile map, a pin per application, the radius ring
  PipelineBoard.tsx     the pipeline board: the funnel, the reply rates, and what has gone quiet
  CollapsibleCard.tsx   folding panel used by the audit and version shelves
  MediaLibraryPanel.tsx the clipboard: images and text modules, as a collapsible right-hand rail
  PortfolioInspector.tsx the style/page panel on the left: text, line and pad styles, and the page's own
  PortfolioWorkspace.tsx the pages at true proportions, editable in place — the sculpting surface
  EditableText.tsx      in-place contentEditable that preserves the element's own formatting
  VersionHistory.tsx    checkpoint shelf: restore, pin, diff, save-as-variant
  TailorControls.tsx    intensity slider, emphasis toggle, type dial, auto-fit
  PdfExportButton.tsx   PDF + print export
  Navbar.tsx            navigation, saved count, theme toggle
  ResumePdfDocument.tsx react-pdf mirror of the sheet (lazy-loaded)
  PortfolioPdfDocument.tsx react-pdf portfolio: cover, project, filmstrip and flip pages
  SavedStagePicker.tsx  inline pipeline stage control
  WorkspaceFileCard.tsx "save to a folder", and the auto-save that keeps it current
  useApplyImport.ts    restoring a profile or a backup, for the two doors that can do it
  WorkspaceProvider.tsx all state: profile, draft, edits, versions, letter, applications
  ui/                   shadcn-style primitives (button, card, slider, tabs, …)
lib/
  masterProfileSeed.ts  seeded profile — the starter profile, as data
  keywordAnalyzer.ts    lexicon, parser, scoring, highlighting
  geo.ts                the places book, great-circle distances, Web Mercator for the tile map
  geocode.ts            the place lookup: the cache, the parse, and the one-request-a-second queue
  pipeline.ts           what the saved records add up to: funnel, rates, staleness, score bands
  resumeTailorer.ts     bands, relevance ordering, page-fit, ATS audit
  resumeEdits.ts        the hand-edit layer and its manifest
  sheetText.ts          edit-text normalisation, blocked format commands, DOM flattening
  versions.ts           content hashing, snapshot diffs, eviction
  coverLetterGenerator.ts  evidence-backed letter composition
  resumeImport.ts       PDF/DOCX/text extraction, resume parsing, profile merge
  dates.ts              local ISO date arithmetic and month/week grids (no UTC surprises)
  applications.ts       the save payload, stage rules, calendar events, snoozing
  applicationDetails.ts the rules behind the details editor: blanking, where a lookup goes, what gets stored
  ics.ts                RFC 5545 export: escaping, octet folding, all-day events
  portfolioTypes.ts     portfolio model: project → slide → block, fraction-based crops
  textStyles.ts         the six text styles and the five-colour palette they are set in
  portfolioTheme.ts     the document's look: five palettes, four typeface pairings, three type scales
  portfolioContact.ts   the cover's contact block: what you do, how to reply, which links may be links
  portfolioTemplates.ts modular templates: ordered slots, filled from the store
  mediaLibrary.ts       the media and text store: assets, tags, filtering, image refs
  presentationOptions.ts the menu each section picks from, cross-checked against the matrix
  portfolio.ts          page planning, page geometries, capability matrix, stats
  images.ts             image import, downscale to ~200 DPI, crop math, DPI verdicts
  imageStore.ts         IndexedDB store for the image bytes, kept out of localStorage
  pdfPatch.ts           page transitions written into the finished PDF, xref rebuilt
  storage.ts            versioned localStorage, migrations, import/export
  workspaceFile.ts       the workspace as a folder on disk: the bundle, the pictures, the handle
  samplePostings.ts     four postings for exercising the analyzer
  types.ts              domain model
  utils.ts              cn, id, date, text-diff and download helpers
scripts/
  verify-all.mts        the whole package: types, both suites, routes, screenshots, fixtures, report
  verify-engine.ts      806-assertion engine suite
  blank.mts             builds the publishable copy: starter profile in, your details out, checks run
  verify-pdf.mts        219-assertion PDF artifact suite (bundled to ESM via esbuild)
  verify-screens.mts    the screenshots on their own (needs a Chromium browser to drive)
  screens.mts           finds a browser, captures every screen, keeps the per-browser baselines
  png.mts               reads the PNGs a browser writes, and diffs two of them
  template-previews.mts renders each template's starting layout to tmp/template-previews/
  fixturePng.mts        a PNG writer, so fixture images need no image library
```

```
blank/
  README.md             the public README a published copy gets
  LICENSE               MIT, so the published copy says what a reader may do with it
  start.command         double-click to install and run it (macOS and Linux)
  start.bat             the same for Windows
  lib/masterProfileSeed.ts  the starter profile: generic identity, real shape, four skill groups
```

`blank/` is not part of the app — it is the material `npm run blank` overlays when it builds a
publishable copy, kept in the repository so it can be read and edited rather than buried in a script.

## Editing the Master Profile

Everything on the resume comes from `/profile`. Bullets carry three pieces of
metadata that drive the engine:

- **tags** — the keywords the bullet genuinely evidences. These decide which
  bullets surface for a given posting.
- **emphasis** — which facet (Technical / Delivery / Balanced) promotes the bullet.
- **rephrasings** — optional alternate truthful phrasings, each with the
  intensity at which it unlocks.

Add a certification and the credential ATS check flips to pass. Remove a role's
dates and it warns that parsers prefer a range. Export JSON before you clear site
data — there is no cloud copy, by design.

## Known limits

- The analyzer is a lexicon, not a language model: a term it does not know is
  invisible to it. Extend `SKILL_LEXICON` for a niche you are targeting.
- The page-fit engine models prose wrapping with an average-character-width
  approximation. The preview measures the real DOM and shows an overflow banner,
  but a line near the boundary can read as 96% here and spill there — hence the
  0.97 target.
- Print output depends on the browser's paper setting. `@page` pins Letter and
  zero margins; if the print dialog is set to custom margins, expect drift.
- The screenshot check (`npm run verify:screens`) needs a Chromium browser on the
  machine and a dev server up, and it captures the *first-run* state of each screen:
  a throwaway profile keeps it deterministic, which is what makes it useful, but it
  also means the empty states are what a baseline records. The populated screens are
  checked by hand from the report's list. Baselines live under `tmp/visual/`.
- Two things in a portfolio keep their own colours and sizes under a **look**: the six
  pad tones (page furniture, including two pale washes that stay navy-tinted whatever
  the palette is), and a text style a person chose by hand on a slot, which keeps the
  size and family the style table gives it. Everything else — every palette role, the
  typeface pairing, and every size in the file — follows the document.
