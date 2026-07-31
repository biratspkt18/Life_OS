import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";

export interface GoogleIdentity {
  /** Google's stable per-user id (the `sub` claim). Required. */
  sub: string;
  email: string | null;
  name: string | null;
}

type UserRow = typeof users.$inferSelect;

/**
 * Resolve the app user for a Google identity, creating one if needed.
 *
 * Match order:
 *  1. by `google_sub` — the returning user, identified by their stable Google id.
 *  2. by `email` — *adopts* a pre-seeded row (e.g. the original single-user
 *     account created by the multi-user migration) on its owner's first login,
 *     filling in the `google_sub` so future logins match on step 1.
 *  3. otherwise, create a brand-new user.
 */
/** The signed-in user's own row (for "who am I" / account display). */
export function getUserById(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function findOrCreateUserFromGoogle(identity: GoogleIdentity): UserRow {
  const bySub = db.select().from(users).where(eq(users.googleSub, identity.sub)).get();
  if (bySub) return bySub;

  if (identity.email) {
    const byEmail = db.select().from(users).where(eq(users.email, identity.email)).get();
    if (byEmail) {
      db.update(users)
        .set({ googleSub: identity.sub, name: identity.name ?? byEmail.name })
        .where(eq(users.id, byEmail.id))
        .run();
      return { ...byEmail, googleSub: identity.sub, name: identity.name ?? byEmail.name };
    }
  }

  const row: UserRow = {
    id: randomUUID(),
    googleSub: identity.sub,
    // Google always returns an email with the `email` scope; fall back defensively.
    email: identity.email ?? `${identity.sub}@google`,
    name: identity.name,
    createdAt: new Date().toISOString(),
  };
  db.insert(users).values(row).run();
  return row;
}
