import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { id } = await params;
  const { backupManager } = await getAppContext();

  try {
    const data = await backupManager.read(id);
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { id } = await params;
  const { backupManager, home } = await getAppContext();

  try {
    await backupManager.remove(id);
    await home.logActivity("backup_delete", `Deleted backup ${id}`);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
