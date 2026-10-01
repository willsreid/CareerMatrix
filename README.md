# Career Matrix

A local-first job-search workspace: paste a posting, get a **tailored resume** that only
uses evidence from your own Master Profile, plus a cover letter, a portfolio builder, and
the record-keeping that turns applications into a pipeline.

Everything runs in the browser. There is no account, no server and no database: your
resume, letters, applications and portfolio live in `localStorage` on your machine, and
the only request the app ever makes is a place-name lookup for the map, which you can
turn off by turning the map's imagery off.

## Get it running

1. **Install [Node.js](https://nodejs.org) 20 or newer**, if you do not have it. That is the only
   thing this needs — no extensions, no accounts, no services.
2. **Get the files**, either way:
   - **With git:** `git clone <the repository>` — if it is private, ask whoever sent you it to add you
     as a collaborator first (repo → **Settings** → **Collaborators** → add your username), then accept
     the invitation.
   - **Without git:** the repository's green **Code** button → **Download ZIP**, and unzip it.
3. **Start it:**
   - **macOS or Linux:** double-click **`start.command`**. If it opens as text, or says *permission
     denied* — which is what happens to that file inside a ZIP — run `chmod +x start.command` once, or
     just `bash start.command`.
   - **Windows:** double-click **`start.bat`**.
   - **By hand, any platform:** `npm install` then `npm run dev`, and open <http://localhost:3000>.

The first run installs the dependencies: a couple of minutes, and it needs internet. After that it
starts in seconds and opens in your browser.

### What you get when it opens

An empty workspace with a **starter profile** in it — see below. Type your resume in, or paste it and
let the importer read it, and everything else follows from there. Nothing you do is sent anywhere.

## Start here: your profile

**`lib/masterProfileSeed.ts`** is a starter profile — one example, in one industry, with
obvious placeholder values (`Alex Rivera`, `Your City, ST`, `Example Engineering Group`).
Replace it with your own, or leave it and paste a resume into **Master Profile** in the app
and let the importer fill the profile in for you. Either way, nothing is invented: every
line the tailoring engine prints is traced back to a bullet, a skill or a project in that
file, and the audit panel says so.

There are three rules the profile has to keep, because the engine reads it structurally:

| Rule | Why |
|---|---|
| Every entry has an `id` | Hand edits, version snapshots and portfolio sections point at entries by id. |
| Every bullet carries `tags` | The tags are the vocabulary a posting is matched against. No tags, no matches — the audit panel will tell you rather than quietly producing a thin resume. |
| Every bullet lists `emphasis` | `balanced`, `technical` and `delivery` are the three focus pitches. A bullet with no emphasis belongs to none of them. |

## What is in here

| Screen | What it does |
|---|---|
| **Workspace** (`/`) | Posting on the left, live resume sheet on the right, ATS audit underneath. |
| **Cover Letter** | The same analysis and tone dials, as a one-page letter. |
| **Master Profile** | Everything the engine is allowed to draw on, plus PDF/DOCX/text import. |
| **Portfolio** | A portfolio composer: a store of assets, pages at true proportions, a real PDF, and a document look (palette, typeface, type scale) of its own. |
| **Saved Target Roles** | The applications you have saved, with stages, dates and notes. |
| **Pipeline** | What the saved records add up to: funnel, reply rates, what has gone quiet. |
| **Follow-up Calendar** | Applied dates and follow-ups, overdue queue, `.ics` export, and a map of where you applied. |

## Checks

```
npm run verify        # the engine suite: ~800 assertions, no browser and no network
npm run verify:pdf    # renders the real PDFs and reads the bytes back
npm run verify:all    # everything, including the routes, if a dev server is up
npm run verify:screens  # pixel comparison per screen, needs a Chromium browser
```

The suite is the point of the project as much as the app is: a no-fabrication invariant
(no claim on a tailored resume that is not traceable to the profile), a one-page guard, an
ATS audit, iCalendar output checked against a real parser, the map's Mercator arithmetic,
and the portfolio's planner — all runnable on a laptop with no services.

## Publishing a copy of this app

This repository was produced by `npm run blank` in a private working copy: it takes the
app, swaps in the starter profile, replaces the author's details and runs the checks
against the result, so a published copy is a *working* copy. The full build notes — why
each decision in here was made, what was rejected, and what is still missing — are in
[`docs/BUILD-NOTES.md`](docs/BUILD-NOTES.md).

## Limits worth knowing

- **Nothing leaves the machine** except a place lookup for the map (OpenStreetMap), and
  only for names the built-in book of places does not know. Turn map imagery off and the
  app makes no requests at all.
- **Your data lives in this browser, not in a cloud.** That is the point, but it means
  clearing site data — or using a different browser, or a private window — starts you at
  the starter profile again. Two ways to be safe: **use Export JSON in Master Profile**
  whenever you have done a lot of work, or **point the app at a folder** (see below) and
  stop thinking about it.
- **The tailoring engine does not write prose.** It selects, reorders and re-frames the
  bullets you wrote. If it cannot find evidence for a requirement, it says so in the audit
  panel instead of inventing a line for it.
- **The portfolio's crop tool is not built** (the resolution warning is). A frame shows the
  whole picture, fitted to the frame.

## Keep it in a folder (recommended)

On **Master Profile**, the **Keep it in a folder** panel points the app at a directory on
your disk, and from then on every change is written to it as you work:

```
Career Matrix/
  workspace.json     your profile, applications and portfolio
  images/            the pictures
```

Nothing to export, nothing to remember, and clearing your browser data cannot touch it.
That folder is also what you copy to a backup drive or another computer.

It needs a Chromium browser — **Chrome, Edge, Brave or Vivaldi** — because Safari and
Firefox have no way to write a file. In those browsers the panel says so and the JSON
Export/Import under it does the same job by hand.
