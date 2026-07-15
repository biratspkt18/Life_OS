import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Settings } from "../../types";

/**
 * A person who can log in. Identity is delegated to Google: `googleSub` is
 * Google's stable, opaque per-user id (the `sub` claim on the ID token) — it
 * never changes even if the user renames their account or changes email.
 *
 * `googleSub` is nullable only to allow a *pre-seeded* row (created by the
 * multi-user migration for the original single-user data) to be adopted on the
 * owner's first Google login, which fills it in. Every real login has it set.
 */
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    googleSub: text("google_sub"),
    email: text("email").notNull(),
    name: text("name"),
    createdAt: text("created_at").notNull(),
  },
  (t) => ({
    // One account per Google identity, and per email (so adoption-by-email is safe).
    googleSubIdx: uniqueIndex("users_google_sub_idx").on(t.googleSub),
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
  }),
);

/** One scheduled (or captured) task, owned by a single user. */
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  importance: text("importance").notNull(),
  scheduledStart: text("scheduled_start"),
  /** To-do deadline (ISO, date-only at start of day). Null = no hard deadline. */
  dueDate: text("due_date"),
  /** When you'd ideally get to it (ISO, date-only). Guides scheduling. */
  preferredDate: text("preferred_date"),
  googleEventId: text("google_event_id"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  /** Set when a start-time push has been sent, so we never double-ping. */
  pingedAt: text("pinged_at"),
});

/** Per-user app settings, stored as one JSON blob (matches the `Settings` type). */
export const settings = sqliteTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  data: text("data", { mode: "json" }).notNull().$type<Settings>(),
});

/** Per-user Google connection. The refresh token = silent reconnect. */
export const googleAccount = sqliteTable("google_account", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  accessTokenExpiry: integer("access_token_expiry"), // epoch ms
  email: text("email"),
  calendarId: text("calendar_id"),
});

/** A browser's web-push subscription, owned by the user who registered it. */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
});
