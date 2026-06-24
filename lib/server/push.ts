import webpush from "web-push";
import { eq } from "drizzle-orm";
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

export function saveSubscription(sub: BrowserSubscription): void {
  db.insert(pushSubscriptions)
    .values({
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
}

export function removeSubscription(endpoint: string): void {
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).run();
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Send a notification to every stored subscription; prune dead ones. */
export async function sendToAll(payload: PushPayload): Promise<void> {
  configure();
  const subs = db.select().from(pushSubscriptions).all();
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) removeSubscription(s.endpoint);
        else console.error("[push] send failed:", err);
      }
    }),
  );
}
