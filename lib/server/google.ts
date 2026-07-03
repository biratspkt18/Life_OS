import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { googleAccount } from "./db/schema";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

/** Consent URL — offline + prompt=consent so Google returns a refresh token. */
export function authUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

function getAccount() {
  return db.select().from(googleAccount).where(eq(googleAccount.id, "app")).get();
}

/** Exchange the auth code and persist the refresh token (the reconnect key). */
export async function exchangeCode(code: string): Promise<void> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    email = me.data.email ?? null;
  } catch {
    // userinfo is best-effort; the connection still works without it.
  }

  const existing = getAccount();
  // Google only returns a refresh token on first consent; keep the old one if absent.
  const refreshToken = tokens.refresh_token ?? existing?.refreshToken ?? null;

  db.insert(googleAccount)
    .values({
      id: "app",
      refreshToken,
      accessToken: tokens.access_token ?? null,
      accessTokenExpiry: tokens.expiry_date ?? null,
      email,
      calendarId: existing?.calendarId ?? "primary",
    })
    .onConflictDoUpdate({
      target: googleAccount.id,
      set: {
        refreshToken,
        accessToken: tokens.access_token ?? null,
        accessTokenExpiry: tokens.expiry_date ?? null,
        email,
        calendarId: existing?.calendarId ?? "primary",
      },
    })
    .run();
}

export function googleStatus(): {
  connected: boolean;
  email: string | null;
  configured: boolean;
} {
  const a = getAccount();
  // `configured` = OAuth credentials exist in the env, so a connect attempt can
  // actually reach Google's consent screen (vs. failing inside /api/google/connect).
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return { connected: !!a?.refreshToken, email: a?.email ?? null, configured };
}

export function disconnectGoogle(): void {
  db.delete(googleAccount).where(eq(googleAccount.id, "app")).run();
}

/** True for Google's permanent "the refresh token is dead" error. */
export function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } };
  return (
    e?.response?.data?.error === "invalid_grant" ||
    (typeof e?.message === "string" && e.message.includes("invalid_grant"))
  );
}

/**
 * The refresh token is permanently invalid (revoked / expired), so calls will
 * never succeed again. Drop the dead credentials — keeping the email — so the
 * app reports "disconnected" and prompts a reconnect instead of failing silently.
 */
export function invalidateGoogleTokens(): void {
  db.update(googleAccount)
    .set({ refreshToken: null, accessToken: null, accessTokenExpiry: null })
    .where(eq(googleAccount.id, "app"))
    .run();
}

/**
 * An authenticated Calendar client, or null if not connected. The googleapis
 * client refreshes the short-lived access token from the stored refresh token
 * automatically (silent reconnect); we persist any rotated tokens.
 */
export async function getCalendarClient() {
  const a = getAccount();
  if (!a?.refreshToken) return null;

  const client = oauthClient();
  client.setCredentials({
    refresh_token: a.refreshToken,
    access_token: a.accessToken ?? undefined,
    expiry_date: a.accessTokenExpiry ?? undefined,
  });

  client.on("tokens", (t) => {
    db.update(googleAccount)
      .set({
        accessToken: t.access_token ?? a.accessToken,
        accessTokenExpiry: t.expiry_date ?? a.accessTokenExpiry,
        ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
      })
      .where(eq(googleAccount.id, "app"))
      .run();
  });

  const calendar = google.calendar({ version: "v3", auth: client });
  return { calendar, calendarId: a.calendarId ?? "primary" };
}
