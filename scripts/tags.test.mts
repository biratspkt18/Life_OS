import { findTagMatch, normalizeTag } from "../lib/tags";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    pass++;
    console.log(`  ok  - ${name}`);
  } else {
    fail++;
    console.log(`  FAIL- ${name} ${extra}`);
  }
}

{
  // normalizeTag
  check("trims whitespace", normalizeTag("  uni  ") === "uni");
  check("collapses inner whitespace", normalizeTag("web   dev") === "web dev");
  check("preserves case as typed", normalizeTag("Web Dev") === "Web Dev");
  check("empty → null", normalizeTag("") === null);
  check("whitespace-only → null", normalizeTag("   ") === null);
  check("non-string → null", normalizeTag(42) === null);
  check("null → null", normalizeTag(null) === null);
  check("40 chars ok", normalizeTag("x".repeat(40)) === "x".repeat(40));
  check("41 chars → null", normalizeTag("x".repeat(41)) === null);
}

{
  // findTagMatch
  const existing = ["uni", "web dev", "Football"];
  check("exact match", findTagMatch(existing, "uni") === "uni");
  check("case-insensitive match returns stored spelling", findTagMatch(existing, "UNI") === "uni");
  check("matches differently-cased stored tag", findTagMatch(existing, "football") === "Football");
  check("trims before matching", findTagMatch(existing, "  uni ") === "uni");
  check("no match → null", findTagMatch(existing, "work") === null);
  check("empty candidate → null", findTagMatch(existing, "") === null);
}

console.log(`\ntags: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
