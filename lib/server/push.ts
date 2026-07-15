import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { pushSubscriptions } from "./db/schema";

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys are not set");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:you@example.com",
    pub,
    priv,
  );
  configured = true;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function saveSubscription(userId: string, sub: BrowserSubscription): void {
  db.insert(pushSubscriptions)
    .values({
      endpoint: sub.endpoint,
      userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: new Date().toISOString(),
    })
    // A browser can re-register the same endpoint under a new owner (e.g. a
    // shared device someone else logs into) — keep the row, update the owner.
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
    .run();
}

// Scoped to the owner so one user can't delete another's subscription, even
// with a known endpoint URL.
export function removeSubscription(userId: string, endpoint: string): void {
  db.delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)))
    .run();
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Send a notification to one user's subscribed browsers; prune dead ones. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  configure();
  const subs = db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .all();
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) removeSubscription(s.userId, s.endpoint);
        else console.error("[push] send failed:", err);
      }
    }),
  );
}
