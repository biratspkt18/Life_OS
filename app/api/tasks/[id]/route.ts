import { NextResponse } from "next/server";
import { ConflictError, deleteTask, patchTask, type TaskPatch } from "@/lib/server/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as TaskPatch;
  try {
    const task = await patchTask(id, body);
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
  const { id } = await params;
  await deleteTask(id);
  return NextResponse.json({ ok: true });
}
