import { config } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(config.vapid.publicKey, {
    headers: { "content-type": "text/plain" },
  });
}
