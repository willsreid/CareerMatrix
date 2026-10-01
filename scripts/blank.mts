/* -------------------------------------------------------------------------- */
/* A blank copy, ready to publish                                             */
/*                                                                            */
/* This repository is a *working* copy: it has somebody's real resume in       */
/* `lib/masterProfileSeed.ts`, their name in the download filenames and their  */
/* details in a couple of fixtures. This script builds the version that goes   */
/* on GitHub instead — the same app, with a starter profile and the author's   */
/* details replaced — **without touching the working copy**.                   */
/*                                                                            */
/* It then runs the checks *inside the copy*, which is the part that matters:  */
/* a published repository whose own test suite fails is worse than no          */
/* repository at all, and the only honest way to promise otherwise is to run   */
/* them and look.                                                             */
/*                                                                            */
/*   npm run blank                 → tmp/blank-career-matrix                   */
/*   npm run blank -- --out ../x   → somewhere else                            */
/*   npm run blank -- --force      → replace a directory that already exists   */
/* -------------------------------------------------------------------------- */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const OUT = outFlag >= 0 ? (argv[outFlag + 1] ?? "") : join(ROOT, "tmp", "blank-career-matrix");
const FORCE = argv.includes("--force");

if (!OUT) {
  console.error("  --out needs a path.");
  process.exit(1);
}

/** What a published copy needs. `blank/` is deliberately absent: the copy is already blank. */
const INCLUDE = [
  "app",
  "components",
  "lib",
  "scripts",
  "public",
  ".gitignore",
  "README.md",
  "package.json",
  "package-lock.json",
  "components.json",
  "next.config.mjs",
  "postcss.config.mjs",
  "tailwind.config.ts",
  "tsconfig.json",
];

/** The files that differ in a published copy, and where they belong in it. */
const OVERLAY: [string, string][] = [
  ["blank/lib/masterProfileSeed.ts", "lib/masterProfileSeed.ts"],
  // Double-clickable starters, so somebody who downloads the repository does not have to know npm.
  ["blank/start.command", "start.command"],
  ["blank/start.bat", "start.bat"],
  // MIT, so the code says what a reader is allowed to do with it. Change the holder to your legal name if you
  // would rather it read that way.
  ["blank/LICENSE", "LICENSE"],
];

/**
 * The author's details, replaced by the starter identity the blank profile uses.
 *
 * Longest first, and applied everywhere: a name in a fixture, an email in a test that asserts the exported PDF
 * contains it, a handle in a resume fixture. Keeping the *replacement* identical to the starter profile's own
 * values is what keeps the copy's checks passing — an assertion that reads "Alex Rivera" and a seed that says
 * "Alex Rivera" agree, whatever the working copy happened to say.
 */
const SCRUB: [string, string][] = [
  ["Regional Contracting Firms", "Regional Contracting Firms"],
  ["linkedin.com/in/alexrivera", "linkedin.com/in/alexrivera"],
  ["alex.rivera@example.com", "alex.rivera@example.com"],
  ["alex.rivera@example.com", "alex.rivera@example.com"],
  ["github.com/alexrivera", "github.com/alexrivera"],
  ["github.com/alexrivera", "github.com/alexrivera"],
  ["(555) 010-0142", "(555) 010-0142"],
  ["(555) 010-0100", "(555) 010-0100"],
  ["ALEX RIVERA", "ALEX RIVERA"],
  ["Alex Rivera", "Alex Rivera"],
  ["Alex_Rivera", "Alex_Rivera"],
  ["Alex Rivera", "Alex Rivera"],
  ["alex.rivera", "alex.rivera"],
  ["alexrivera", "alexrivera"],
  ["Meridian Construction Group", "Meridian Construction Group"],
  ["the starter profile, as data", "the starter profile, as data"],
  // The package description names the target market, which is somebody's job search rather than the app.
  [
    "Local-first resume tailoring, cover letters, applications and a portfolio builder.",
    "Local-first resume tailoring, cover letters, applications and a portfolio builder.",
  ],
].sort((a, b) => b[0].length - a[0].length);

/** What counts as text worth scrubbing. The lockfile is skipped: it holds no prose and it is enormous. */
const TEXT_FILES = new Set([".ts", ".tsx", ".mts", ".mjs", ".js", ".md", ".json", ".css", ".yml", ".yaml"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "tmp"]);

/** Who a published commit is attributed to when nothing else says. Never `user@hostname`. */
const AUTHOR_FALLBACK = "Career Matrix <noreply@example.com>";

/** A command's trimmed stdout, or an empty string. */
function read(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}


/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

if (existsSync(OUT) && readdirSync(OUT).length) {
  if (!FORCE) {
    console.error(`  ${OUT} already has something in it. Pass --force to replace it.`);
    process.exit(1);
  }
  rmSync(OUT, { recursive: true, force: true });
}
mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const entry of INCLUDE) {
  const from = join(ROOT, entry);
  if (!existsSync(from)) continue;
  cpSync(from, join(OUT, entry), { recursive: true });
  copied += 1;
}

for (const [from, to] of OVERLAY) cpSync(join(ROOT, from), join(OUT, to));

// The working copy's README is the build notes — it is a record of decisions about *this* app, and it is worth
// keeping. The published README is the short one: what the app is, how to run it, what to change first.
mkdirSync(join(OUT, "docs"), { recursive: true });
cpSync(join(OUT, "README.md"), join(OUT, "docs", "BUILD-NOTES.md"));
cpSync(join(ROOT, "blank", "README.md"), join(OUT, "README.md"));

let scrubbedFiles = 0;
let scrubbedStrings = 0;
const walk = (dir: string) => {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      if (!SKIP_DIRS.has(item.name)) walk(path);
      continue;
    }
    if (!TEXT_FILES.has(extname(item.name)) || item.name === "package-lock.json") continue;
    let source = readFileSync(path, "utf8");
    let changed = false;
    for (const [from, to] of SCRUB) {
      if (!source.includes(from)) continue;
      scrubbedStrings += source.split(from).length - 1;
      source = source.split(from).join(to);
      changed = true;
    }
    if (changed) {
      writeFileSync(path, source);
      scrubbedFiles += 1;
    }
  }
};
walk(OUT);

/**
 * `node_modules`, linked rather than installed.
 *
 * A published repository does not contain it, but this copy has to run its own test suite before it can be
 * trusted, and installing a second copy of the same tree to prove that would take minutes for no benefit.
 */
const link = join(OUT, "node_modules");
if (!existsSync(link)) symlinkSync(join(ROOT, "node_modules"), link, "dir");

/* -------------------------------------------------------------------------- */
/* Check the copy                                                             */
/* -------------------------------------------------------------------------- */

const bin = (name: string) => join(OUT, "node_modules", ".bin", name);
const run = (name: string, args: string[]) =>
  spawnSync(bin(name), args, { cwd: OUT, stdio: "inherit" }).status === 0;

console.log(`\n  copied ${copied} entries to ${OUT}`);
console.log("  blank profile in place · README swapped for docs/BUILD-NOTES.md");
console.log(`  scrubbed ${scrubbedStrings} details across ${scrubbedFiles} files\n`);

const typesClean = run("tsc", ["--noEmit", "--noUnusedLocals"]);
const suiteClean = run("tsx", ["scripts/verify-engine.ts"]);

/**
 * And the PDF suite, which is the check that actually reads the profile: it renders the real documents and
 * asserts the exported file carries the *profile's* name and email. In a blank copy that is the starter
 * identity, which is exactly the thing a scrub could have got half-right.
 */
const bundled = run("esbuild", [
  "scripts/verify-pdf.mts",
  "--bundle",
  "--platform=node",
  "--format=esm",
  "--target=node20",
  "--external:@react-pdf/*",
  "--external:react",
  "--external:react-dom",
  "--outfile=tmp/pdf-verify.mjs",
]);
// `node` is not in `node_modules/.bin`, so the running interpreter runs the bundle.
const pdfClean =
  bundled &&
  spawnSync(process.execPath, ["tmp/pdf-verify.mjs"], { cwd: OUT, stdio: "inherit" }).status === 0;

console.log("");
if (typesClean && suiteClean && pdfClean) {
  console.log("  The copy is a working copy: type check clean, engine suite green, PDF suite green.\n");

  /**
   * A *fresh* repository, so publishing is "add a remote and push".
   *
   * Fresh is the point: cloning the working copy would carry its history, and history is exactly where a resume
   * hides — `git log -p` is a surprising place to read somebody's employment history. This is one commit of the
   * files as they are now.
   *
   * The author is never left to git's fallback. With no `user.name` configured, git commits as `user@hostname` —
   * a person's name and their laptop's name, in a public repository, permanently. So: your `git config` if it is
   * set, the neutral default otherwise, and `--author "Name <email>"` overrides either.
   */
  const authorFlag = argv.indexOf("--author");
  const configuredName = read("git", ["config", "user.name"]);
  const configuredEmail = read("git", ["config", "user.email"]);
  const author =
    (authorFlag >= 0 ? argv[authorFlag + 1] : undefined) ??
    (configuredName && configuredEmail ? `${configuredName} <${configuredEmail}>` : AUTHOR_FALLBACK);
  const [, authorName = AUTHOR_FALLBACK, authorEmail = "noreply@example.com"] =
    /^(.*?)\s*<(.+)>$/.exec(author) ?? [];

  const git = (args: string[]) => spawnSync("git", args, { cwd: OUT, stdio: "inherit" }).status === 0;
  const hasGit = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0;
  if (hasGit && !existsSync(join(OUT, ".git"))) {
    git(["init", "-q"]);
    git(["add", "-A"]);
    git([
      "-c",
      `user.name=${authorName}`,
      "-c",
      `user.email=${authorEmail}`,
      "commit",
      "-q",
      "-m",
      "Career Matrix: a local-first job-search workspace",
    ]);
    console.log(`  Committed as ${author} — one commit, none of your history.`);
    console.log(
      "  (To put your own name on it: git config user.name/email, then git commit --amend --reset-author.)\n",
    );
  }

  console.log("  Publish it with:");
  console.log(`    cd ${OUT}`);
  console.log("    git remote add origin git@github.com:<you>/career-matrix.git");
  console.log("    git push -u origin main");
  console.log("\n  Fill in lib/masterProfileSeed.ts first, or run npm run dev and import your resume.\n");
} else {
  console.log("  NOT ready to publish — the copy failed its own checks above. Fix, then run this again.\n");
  process.exit(1);
}
