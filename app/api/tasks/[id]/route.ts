import { NextResponse } from "next/server";
import { ConflictError, deleteTask, patchTask } from "@/lib/server/tasks";
import { parseTaskPatch } from "@/lib/server/validate";
import { requireUserId } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseTaskPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const task = await patchTask(userId, id, parsed.value);
    if (!task) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(task);
  } catch (err) {
    if (err instanceof ConflictError) {
      return NextResponse.json({ error: err.message, conflict: err.conflict }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId();
  const { id } = await params;
  await deleteTask(userId, id);
  return NextResponse.json({ ok: true });
}
