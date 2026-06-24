import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import type { Settings } from "../../types";

/** One scheduled (or captured) task. Mirrors the client `Task` shape. */
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  importance: text("importance").notNull(),
  scheduledStart: text("scheduled_start"),
  googleEventId: text("google_event_id"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  /** Set when a start-time push has been sent, so we never double-ping. */
  pingedAt: text("pinged_at"),
});

/** Single-row app settings, stored as one JSON blob (matches the `Settings` type). */
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  data: text("data", { mode: "json" }).notNull().$type<Settings>(),
});

/** Single-row Google connection. The refresh token = silent reconnect. */
export const googleAccount = sqliteTable("google_account", {
  id: text("id").primaryKey(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  accessTokenExpiry: integer("access_token_expiry"), // epoch ms
  email: text("email"),
  calendarId: text("calendar_id"),
});

/** A browser's web-push subscription. */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
});
