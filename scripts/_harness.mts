/**
 * Shared micro-harness for the tsx test scripts, so the ~12-line pass/fail
 * boilerplate isn't copy-pasted into every file. Usage:
 *
 *   const { check, done } = harness("battery");
 *   check("label", someCondition);
 *   done();   // prints the summary, exits non-zero if anything failed
 *
 * Files stay runnable standalone (`tsx scripts/x.test.mts`); the glob runner
 * `scripts/run-tests.mts` discovers and runs them all so a new *.test.mts can
 * never be silently left out of `npm test`.
 */
export function harness(name: string): {
  check: (label: string, cond: boolean, extra?: string) => void;
  done: () => void;
} {
  let pass = 0;
  let fail = 0;
  return {
    check(label, cond, extra = "") {
      if (cond) {
        pass++;
        console.log(`  ok  - ${label}`);
      } else {
        fail++;
        console.log(`  FAIL- ${label} ${extra}`);
      }
    },
    done() {
      console.log(`\n${name}: ${pass} passed, ${fail} failed`);
      if (fail > 0) process.exit(1);
    },
  };
}
