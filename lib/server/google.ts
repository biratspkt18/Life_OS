import { google } from "googleapis";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { googleAccount } from "./db/schema";
import { config } from "./config";
import type { GoogleIdentity } from "./users";

// `openid`+`email`+`profile` identify the person (login); `calendar.events` lets
// us mirror tasks. One consent grants all of it — identity and calendar together.
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
];

export function oauthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
}

/**
 * Consent URL. `select_account` forces Google's account chooser so a person
 * can pick *which* Google account to sign in with (essential for switching
 * accounts — otherwise Google silently reuses whichever one the browser is
 * already signed into). `consent` + offline access guarantee a refresh token.
 */
export function authUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    scope: SCOPES,
    state,
  });
}

export interface ExchangeResult {
  identity: GoogleIdentity;
  refreshToken: string | null;
  accessToken: string | null;
  accessTokenExpiry: number | null;
}

/**
 * Exchange the OAuth code for tokens *and* the caller's Google identity. The
 * identity comes from the verified `id_token` (a Google-signed JWT), which is
 * the trustworthy source of the stable `sub` — never a value the browser can
 * forge. Throws if the code is bad or no id_token comes back.
 */
export async function exchangeCodeForIdentity(code: string): Promise<ExchangeResult> {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) throw new Error("no id_token in token response");
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientId,
  });
  const p = ticket.getPayload();
  if (!p?.sub) throw new Error("id_token has no sub");

  return {
    identity: { sub: p.sub, email: p.email ?? null, name: p.name ?? null },
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    accessTokenExpiry: tokens.expiry_date ?? null,
  };
}

function getAccount(userId: string) {
  return db.select().from(googleAccount).where(eq(googleAccount.userId, userId)).get();
}

/**
 * Persist the calendar tokens for a user. Google only returns a refresh token on
 * the *first* consent, so an absent one on re-consent must not wipe the stored
 * key; same for the email.
 */
export function saveGoogleTokensForUser(
  userId: string,
  t: { refreshToken: string | null; accessToken: string | null; accessTokenExpiry: number | null; email: string | null },
): void {
  const existing = getAccount(userId);
  const refreshToken = t.refreshToken ?? existing?.refreshToken ?? null;
  const email = t.email ?? existing?.email ?? null;
  const calendarId = existing?.calendarId ?? "primary";

  db.insert(googleAccount)
    .values({
      userId,
      refreshToken,
      accessToken: t.accessToken,
      accessTokenExpiry: t.accessTokenExpiry,
      email,
      calendarId,
    })
    .onConflictDoUpdate({
      target: googleAccount.userId,
      set: { refreshToken, accessToken: t.accessToken, accessTokenExpiry: t.accessTokenExpiry, email, calendarId },
    })
    .run();
}

export function googleStatus(userId: string): {
  connected: boolean;
  email: string | null;
  configured: boolean;
} {
  const a = getAccount(userId);
  // `configured` = OAuth credentials exist in the env, so a connect attempt can
  // actually reach Google's consent screen (vs. failing inside the start route).
  return { connected: !!a?.refreshToken, email: a?.email ?? null, configured: config.google.configured };
}

export function disconnectGoogle(userId: string): void {
  db.delete(googleAccount).where(eq(googleAccount.userId, userId)).run();
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
 * The user's refresh token is permanently invalid (revoked / expired), so calls
 * will never succeed again. Drop the dead credentials — keeping the email — so
 * the app reports "disconnected" and prompts a reconnect instead of failing
 * silently. Only clears calendar access; the login/identity is unaffected.
 */
export function invalidateGoogleTokens(userId: string): void {
  db.update(googleAccount)
    .set({ refreshToken: null, accessToken: null, accessTokenExpiry: null })
    .where(eq(googleAccount.userId, userId))
    .run();
}

/**
 * An authenticated Calendar client for a user, or null if not connected. The
 * googleapis client refreshes the short-lived access token from the stored
 * refresh token automatically (silent reconnect); we persist any rotated tokens.
 */
export async function getCalendarClient(userId: string) {
  const a = getAccount(userId);
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
      .where(eq(googleAccount.userId, userId))
      .run();
  });

  const calendar = google.calendar({ version: "v3", auth: client });
  return { calendar, calendarId: a.calendarId ?? "primary" };
}
