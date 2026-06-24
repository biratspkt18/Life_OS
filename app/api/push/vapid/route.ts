export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(process.env.VAPID_PUBLIC_KEY ?? "", {
    headers: { "content-type": "text/plain" },
  });
}
