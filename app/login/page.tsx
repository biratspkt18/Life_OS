import { GoogleButton } from "./GoogleButton";

/** Human-readable text for the `?error=` reasons the OAuth callback bounces back. */
const ERROR_TEXT: Record<string, string> = {
  access_denied: "You cancelled the Google sign-in.",
  state_mismatch: "The sign-in link expired. Please try again.",
  no_state_cookie: "The sign-in link expired. Please try again.",
  exchange_failed: "Couldn't complete sign-in with Google. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (ERROR_TEXT[error] ?? "Sign-in failed. Please try again.") : null;

  return (
    <div className="paper-grain relative flex min-h-screen items-center justify-center px-4">
      <div className="surface relative z-10 w-full max-w-sm animate-scale-in p-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-ink">Life OS</h1>
        <p className="mb-5 mt-0.5 text-sm text-muted">
          Sign in to plan your day and sync your calendar.
        </p>
        <GoogleButton />
        {message && <p className="mt-3 text-sm text-accent">{message}</p>}
        <p className="mt-5 text-xs text-muted-soft">
          One tap creates your account and connects Google Calendar.
        </p>
      </div>
    </div>
  );
}
