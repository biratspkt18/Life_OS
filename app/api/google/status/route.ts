import { NextResponse } from "next/server";
import { googleStatus } from "@/lib/server/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(googleStatus());
}
