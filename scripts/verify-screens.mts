/**
 * Just the screens: `npm run verify:screens`.
 *
 * The visual check on its own, for when you are changing layout and do not want to wait for the whole package.
 * It needs the dev server up and a Chromium browser, and it says so rather than failing when either is missing —
 * a suite that cannot run is not the same thing as a suite that failed.
 *
 *   npm run verify:screens                  compare every screen against its baseline
 *   npm run verify:screens -- --accept-screens   accept what changed, and record it as the new baseline
 */

import { checkScreens } from "./screens.mts";

async function main() {
  const base = `http://localhost:${process.env.PORT ?? "3000"}`;

  try {
    await fetch(base, { signal: AbortSignal.timeout(2500) });
  } catch {
    console.error(`\n  No dev server on ${base} — run \`npm run dev\` first.\n`);
    process.exit(1);
  }

  const result = await checkScreens({ base, accept: process.argv.includes("--accept-screens") });
  const mark = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "SKIP";
  console.log(`\n  ${mark}  Screens (pixels)\n        ${result.detail}\n`);
  process.exit(result.status === "fail" ? 1 : 0);
}

void main();
