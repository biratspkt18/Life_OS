import { isEnergyLane, laneDayKey, matchesLane, resolveStoredLane } from "../lib/energyLane";
import { matchesQuery } from "../components/SearchField";

import { harness } from "./_harness.mts";

const { check, done } = harness("energyLane");

{
  // No lane → everything shows.
  check("no lane: low", matchesLane(null, "low"));
  check("no lane: medium", matchesLane(null, "medium"));
  check("no lane: high", matchesLane(null, "high"));
  check("no lane: unlabeled", matchesLane(null, null));
}

{
  // Slow lane → low only, plus unlabeled.
  check("slow: low shows", matchesLane("slow", "low"));
  check("slow: medium hidden", !matchesLane("slow", "medium"));
  check("slow: high hidden", !matchesLane("slow", "high"));
  check("slow: unlabeled shows", matchesLane("slow", null));
}

{
  // Zippy lane → medium + high, plus unlabeled.
  check("zippy: low hidden", !matchesLane("zippy", "low"));
  check("zippy: medium shows", matchesLane("zippy", "medium"));
  check("zippy: high shows", matchesLane("zippy", "high"));
  check("zippy: unlabeled shows", matchesLane("zippy", null));
}

{
  // Stored-value guard.
  check("isEnergyLane slow", isEnergyLane("slow"));
  check("isEnergyLane zippy", isEnergyLane("zippy"));
  check("isEnergyLane rejects junk", !isEnergyLane("turbo"));
  check("isEnergyLane rejects null", !isEnergyLane(null));
  check("isEnergyLane rejects number", !isEnergyLane(3));
}

{
  // Composes with search exactly like the views do.
  const list = [
    { title: "Fold laundry", tag: "home", energy: "low" as const },
    { title: "Write essay", tag: "uni", energy: "high" as const },
    { title: "Email tutor", tag: "uni", energy: null },
  ];
  const filtered = list.filter(
    (t) => matchesQuery("uni", t.title, t.tag) && matchesLane("zippy", t.energy),
  );
  check(
    "search + zippy: uni tasks minus low-energy",
    filtered.length === 2 &&
      filtered.some((t) => t.title === "Write essay") &&
      filtered.some((t) => t.title === "Email tutor"),
    JSON.stringify(filtered.map((t) => t.title)),
  );
  const slowOnly = list.filter(
    (t) => matchesQuery("", t.title, t.tag) && matchesLane("slow", t.energy),
  );
  check(
    "empty search + slow: low + unlabeled",
    slowOnly.length === 2 && !slowOnly.some((t) => t.title === "Write essay"),
    JSON.stringify(slowOnly.map((t) => t.title)),
  );
}

{
  // Daily reset: a stored lane only counts on the day it was chosen.
  const today = "2026-07-25";
  const stored = JSON.stringify({ lane: "slow", day: today });
  check("stored today → lane", resolveStoredLane(stored, today) === "slow");
  check("stored yesterday → null (daily reset)", resolveStoredLane(stored, "2026-07-26") === null);
  check("legacy plain string → null", resolveStoredLane("slow", today) === null);
  check("junk JSON → null", resolveStoredLane("{not json", today) === null);
  check("bad lane value → null", resolveStoredLane(JSON.stringify({ lane: "turbo", day: today }), today) === null);
  check("missing day → null", resolveStoredLane(JSON.stringify({ lane: "zippy" }), today) === null);
  check("nothing stored → null", resolveStoredLane(null, today) === null);
  check("laneDayKey format", laneDayKey(new Date(2026, 6, 25)) === "2026-07-25");
}

done();
