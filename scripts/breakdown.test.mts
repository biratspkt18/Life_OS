import { buildBreakdownPrompt, parseStepsResponse } from "../lib/breakdown";

import { harness } from "./_harness.mts";

const { check, done } = harness("breakdown");

{
  // 1. Prompt assembly.
  const p = buildBreakdownPrompt({ title: "Fix the portfolio site", tag: "web dev", deferralCount: 6 });
  check("prompt contains title", p.includes("Task: Fix the portfolio site"));
  check("prompt contains tag", p.includes("Category: web dev"));
  check("prompt contains defer count", p.includes("Times rescheduled: 6"));
  check(
    "null tag → none",
    buildBreakdownPrompt({ title: "x", tag: null, deferralCount: 0 }).includes("Category: none"),
  );
}

{
  // 2. Clean JSON array parses.
  const steps = parseStepsResponse('["Open the laptop", "Create one file"]');
  check("clean array parses", steps?.length === 2 && steps[0] === "Open the laptop");

  // 3. Markdown fences are tolerated.
  check(
    "```json fence stripped",
    parseStepsResponse('```json\n["Open it", "Do it"]\n```')?.length === 2,
  );

  // 4. Preamble and trailing prose are cut.
  check(
    "preamble + trailing prose ignored",
    parseStepsResponse('Here you go!\n["Step one", "Step two"]\nHope that helps.')?.length === 2,
  );

  // 5. Non-array JSON → null, but an array *inside* an object wrapper is
  //    salvaged (the bracket-slice finds it) — lenient on purpose.
  check("bare string → null", parseStepsResponse('"just a string"') === null);
  check("object wrapper → inner array salvaged", parseStepsResponse('{"steps": ["a"]}')?.[0] === "a");

  // 6. Mixed types keep only strings.
  const mixed = parseStepsResponse('["Real step", 42, null, {"x":1}, "Another"]');
  check("non-strings dropped", mixed?.length === 2 && mixed[1] === "Another");

  // 7. Blank/whitespace items are dropped.
  check("empty items dropped", parseStepsResponse('["  ", "Do it", ""]')?.length === 1);

  // 8. Overlong lists cap at 6.
  const eight = parseStepsResponse(JSON.stringify(["a", "b", "c", "d", "e", "f", "g", "h"]));
  check("8 items capped to 6", eight?.length === 6);

  // 9. Overlong steps are truncated to the title limit.
  const long = parseStepsResponse(JSON.stringify(["x".repeat(500)]));
  check("500-char step truncated to 300", long?.[0].length === 300);

  // 10. Nothing usable → null (callers fall back to manual mode).
  check("empty array → null", parseStepsResponse("[]") === null);
  check("garbage → null", parseStepsResponse("total nonsense") === null);
  check("broken JSON → null", parseStepsResponse('["unclosed"') === null);
}

done();
