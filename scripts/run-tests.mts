/**
 * Test runner: discovers every `scripts/*.test.mts` and runs each in its own
 * process, so adding a new test file needs no edit to package.json (the old
 * hand-chained `&&` list silently skipped any file you forgot to add). Exits
 * non-zero if any file fails.
 */
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = readdirSync("scripts")
  .filter((f) => f.endsWith(".test.mts"))
  .sort();

const failed: string[] = [];
for (const f of files) {
  console.log(`\n▶ ${f}`);
  try {
    execFileSync("node_modules/.bin/tsx", [`scripts/${f}`], { stdio: "inherit" });
  } catch {
    failed.push(f);
  }
}

console.log(
  `\n${"=".repeat(44)}\n${files.length} test files · ${files.length - failed.length} ok · ${failed.length} failed` +
    (failed.length ? `\nFAILED: ${failed.join(", ")}` : ""),
);
if (failed.length) process.exit(1);
