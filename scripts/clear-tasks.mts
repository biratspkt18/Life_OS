/**
 * Delete every task from the database.
 *
 *   npm run clear-tasks          # lists tasks, asks for confirmation
 *   npm run clear-tasks -- --yes # skip the prompt (for scripts/CI)
 *
 * Uses the app's own deleteTask so any linked Google Calendar events are
 * removed too (when connected), instead of leaving orphaned events behind.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { deleteTask, listTasks } from "../lib/server/tasks";

async function main() {
  const tasks = listTasks();

  if (tasks.length === 0) {
    console.log("No tasks to clear — the database is already empty.");
    return;
  }

  console.log(`This will delete ${tasks.length} task${tasks.length === 1 ? "" : "s"}:`);
  for (const t of tasks) console.log(`  • ${t.title}`);

  const withEvents = tasks.filter((t) => t.googleEventId).length;
  if (withEvents > 0) {
    console.log(
      `\n${withEvents} of these are linked to Google Calendar events, which will also be removed (if connected).`,
    );
  }

  const skipPrompt = process.argv.includes("--yes") || process.argv.includes("-y");
  if (!skipPrompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question("\nDelete all of them? This cannot be undone. [y/N] ");
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      console.log("Aborted — nothing was deleted.");
      return;
    }
  }

  for (const t of tasks) {
    await deleteTask(t.id);
  }

  console.log(`\nDeleted ${tasks.length} task${tasks.length === 1 ? "" : "s"}. The tasks table is now empty.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("clear-tasks failed:", err);
    process.exit(1);
  });
