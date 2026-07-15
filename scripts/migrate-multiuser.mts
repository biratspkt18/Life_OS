/**
 * One-time migration: single-user → multi-user.
 *
 * Adds a `users` table and stamps every existing row (tasks, settings, the
 * Google connection, push subscriptions) with an owner. The original data
 * becomes the first user's, seeded from the email already stored in
 * `google_account` so the owner's first Google login *adopts* this account
 * (matched by email) instead of creating a duplicate.
 *
 * Safe to abort: it backs the database up first and runs the whole rewrite in
 * one transaction. Idempotent — it refuses to run once `users` exists.
 *
 * Run with:  npx tsx scripts/migrate-multiuser.mts
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const dbPath = process.env.DB_PATH ?? "data/lifeos.db";
const resolved = path.resolve(dbPath);

if (!fs.existsSync(resolved)) {
  console.error(`No database at ${resolved} — nothing to migrate.`);
  process.exit(1);
}

const db = new Database(resolved);
db.pragma("journal_mode = WAL");

// Already migrated? Bail before touching anything.
const hasUsers = db
  .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'")
  .get();
if (hasUsers) {
  console.log("`users` table already exists — this database is already multi-user. Nothing to do.");
  process.exit(0);
}

// --- Back up first --------------------------------------------------------
// Flush the WAL into the main file so a plain file copy is a complete snapshot.
db.pragma("wal_checkpoint(TRUNCATE)");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = `${resolved}.bak-${stamp}`;
fs.copyFileSync(resolved, backup);
console.log(`Backup written: ${backup}`);

// --- Who is the first user? -----------------------------------------------
const existingGoogle = db
  .prepare("SELECT email FROM google_account LIMIT 1")
  .get() as { email: string | null } | undefined;
const firstUserId = randomUUID();
const firstUserEmail = existingGoogle?.email ?? "owner@localhost";
const now = new Date().toISOString();

const before = {
  tasks: (db.prepare("SELECT COUNT(*) c FROM tasks").get() as { c: number }).c,
  settings: (db.prepare("SELECT COUNT(*) c FROM settings").get() as { c: number }).c,
  google: (db.prepare("SELECT COUNT(*) c FROM google_account").get() as { c: number }).c,
  push: (db.prepare("SELECT COUNT(*) c FROM push_subscriptions").get() as { c: number }).c,
};

// --- Rewrite, atomically --------------------------------------------------
// Foreign keys off while we drop/rename tables mid-rebuild; the transaction
// still makes the whole thing all-or-nothing.
db.pragma("foreign_keys = OFF");
const migrate = db.transaction(() => {
  db.exec(`
    CREATE TABLE \`users\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`google_sub\` text,
      \`email\` text NOT NULL,
      \`name\` text,
      \`created_at\` text NOT NULL
    );
    CREATE UNIQUE INDEX \`users_google_sub_idx\` ON \`users\` (\`google_sub\`);
    CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);
  `);

  db.prepare(
    "INSERT INTO users (id, google_sub, email, name, created_at) VALUES (?, NULL, ?, NULL, ?)",
  ).run(firstUserId, firstUserEmail, now);

  // tasks: add owner, keep everything else.
  db.exec(`
    CREATE TABLE \`__new_tasks\` (
      \`id\` text PRIMARY KEY NOT NULL,
      \`user_id\` text NOT NULL,
      \`title\` text NOT NULL,
      \`duration_minutes\` integer NOT NULL,
      \`importance\` text NOT NULL,
      \`scheduled_start\` text,
      \`due_date\` text,
      \`preferred_date\` text,
      \`google_event_id\` text,
      \`completed\` integer DEFAULT false NOT NULL,
      \`completed_at\` text,
      \`created_at\` text NOT NULL,
      \`updated_at\` text NOT NULL,
      \`pinged_at\` text,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
  `);
  db.prepare(
    `INSERT INTO __new_tasks
       (id, user_id, title, duration_minutes, importance, scheduled_start,
        due_date, preferred_date, google_event_id, completed, completed_at,
        created_at, updated_at, pinged_at)
     SELECT
        id, ?, title, duration_minutes, importance, scheduled_start,
        due_date, preferred_date, google_event_id, completed, completed_at,
        created_at, updated_at, pinged_at
     FROM tasks`,
  ).run(firstUserId);
  db.exec("DROP TABLE tasks; ALTER TABLE __new_tasks RENAME TO tasks;");

  // settings: single JSON row, now keyed by user_id (drops the old `id`='app').
  db.exec(`
    CREATE TABLE \`__new_settings\` (
      \`user_id\` text PRIMARY KEY NOT NULL,
      \`data\` text NOT NULL,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
  `);
  db.prepare("INSERT INTO __new_settings (user_id, data) SELECT ?, data FROM settings").run(
    firstUserId,
  );
  db.exec("DROP TABLE settings; ALTER TABLE __new_settings RENAME TO settings;");

  // google_account: single row, now keyed by user_id.
  db.exec(`
    CREATE TABLE \`__new_google_account\` (
      \`user_id\` text PRIMARY KEY NOT NULL,
      \`refresh_token\` text,
      \`access_token\` text,
      \`access_token_expiry\` integer,
      \`email\` text,
      \`calendar_id\` text,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
  `);
  db.prepare(
    `INSERT INTO __new_google_account
       (user_id, refresh_token, access_token, access_token_expiry, email, calendar_id)
     SELECT ?, refresh_token, access_token, access_token_expiry, email, calendar_id
     FROM google_account`,
  ).run(firstUserId);
  db.exec("DROP TABLE google_account; ALTER TABLE __new_google_account RENAME TO google_account;");

  // push_subscriptions: add owner.
  db.exec(`
    CREATE TABLE \`__new_push_subscriptions\` (
      \`endpoint\` text PRIMARY KEY NOT NULL,
      \`user_id\` text NOT NULL,
      \`p256dh\` text NOT NULL,
      \`auth\` text NOT NULL,
      \`created_at\` text NOT NULL,
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
  `);
  db.prepare(
    `INSERT INTO __new_push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
     SELECT endpoint, ?, p256dh, auth, created_at FROM push_subscriptions`,
  ).run(firstUserId);
  db.exec(
    "DROP TABLE push_subscriptions; ALTER TABLE __new_push_subscriptions RENAME TO push_subscriptions;",
  );
});

migrate();
db.pragma("foreign_keys = ON");

// --- Verify integrity + report -------------------------------------------
const fkErrors = db.pragma("foreign_key_check");
const after = {
  tasks: (db.prepare("SELECT COUNT(*) c FROM tasks WHERE user_id = ?").get(firstUserId) as { c: number }).c,
  settings: (db.prepare("SELECT COUNT(*) c FROM settings WHERE user_id = ?").get(firstUserId) as { c: number }).c,
  google: (db.prepare("SELECT COUNT(*) c FROM google_account WHERE user_id = ?").get(firstUserId) as { c: number }).c,
  push: (db.prepare("SELECT COUNT(*) c FROM push_subscriptions WHERE user_id = ?").get(firstUserId) as { c: number }).c,
};
db.close();

console.log(`\nFirst user created: ${firstUserId}  (${firstUserEmail})`);
console.log("Rows re-owned (before → after, scoped to that user):");
console.log(`  tasks:    ${before.tasks} → ${after.tasks}`);
console.log(`  settings: ${before.settings} → ${after.settings}`);
console.log(`  google:   ${before.google} → ${after.google}`);
console.log(`  push:     ${before.push} → ${after.push}`);

if (Array.isArray(fkErrors) && fkErrors.length > 0) {
  console.error("\n⚠️  Foreign-key check FAILED:", fkErrors);
  console.error(`Restore from the backup if needed: ${backup}`);
  process.exit(1);
}
console.log("\n✅ Foreign-key check clean. Migration complete.");
