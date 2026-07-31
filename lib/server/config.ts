/**
 * Central, read-once configuration. Every runtime `process.env` read in the
 * server goes through here, so there is one place to see what configures the
 * app and one place that validates it (instead of ~24 scattered reads with
 * duplicated defaults). Required vars fail-fast in production; optional
 * integrations expose a `configured` flag so features degrade gracefully.
 *
 * Deliberately NOT used by the edge modules (`middleware.ts`, `lib/server/auth.ts`)
 * — they read their own single var directly to stay in the edge bundle — nor by
 * the build-tool config (`drizzle.config.ts`).
 */

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

/** A var the app can't run without in production; blank-but-tolerated in dev. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (isProd) throw new Error(`[config] ${name} must be set in production`);
    return "";
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Parse an integer env var, falling back (with a warning) on garbage/range. */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    console.warn(`[config] ${name}="${raw}" is not a number in ${min}–${max}; using ${fallback}`);
    return fallback;
  }
  return n;
}

const google = {
  clientId: required("GOOGLE_CLIENT_ID"),
  clientSecret: required("GOOGLE_CLIENT_SECRET"),
  redirectUri: required("GOOGLE_REDIRECT_URI"),
};
const gemini = {
  apiKey: optional("GEMINI_API_KEY"),
  model: optional("GEMINI_MODEL", "gemini-2.5-flash"),
};
const vapid = {
  publicKey: optional("VAPID_PUBLIC_KEY"),
  privateKey: optional("VAPID_PRIVATE_KEY"),
  subject: optional("VAPID_SUBJECT", "mailto:you@example.com"),
};

export const config = Object.freeze({
  nodeEnv,
  isProd,
  dbPath: optional("DB_PATH", "data/lifeos.db"),
  /** Absolute origin for OAuth redirects behind a proxy; "" → use request origin. */
  appOrigin: optional("APP_ORIGIN"),
  google: Object.freeze({ ...google, configured: !!(google.clientId && google.clientSecret) }),
  gemini: Object.freeze({ ...gemini, configured: !!gemini.apiKey }),
  vapid: Object.freeze({ ...vapid, configured: !!(vapid.publicKey && vapid.privateKey) }),
  worker: Object.freeze({
    pingLeadMinutes: intEnv("PING_LEAD_MINUTES", 5, 1, 120),
    summaryHour: intEnv("MORNING_SUMMARY_HOUR", 7, 0, 23),
  }),
});

/** One-line startup summary of which integrations are live. */
export function logConfigSummary(): void {
  console.log(
    `[config] db=${config.dbPath} · ` +
      `google=${config.google.configured ? "on" : "OFF"} · ` +
      `gemini=${config.gemini.configured ? "on" : "OFF"} · ` +
      `push=${config.vapid.configured ? "on" : "OFF"}`,
  );
}
