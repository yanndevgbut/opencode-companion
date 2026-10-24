import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { backupManager } = await getAppContext();
  const list = await backupManager.list();
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { fileId, name } = body;

  const { files, store, home, backupManager } = await getAppContext();
  const target = fileId ? files.find((f) => f.spec.id === fileId) : files.find((f) => f.spec.id === store.primaryId);

  if (!target || !target.read.exists) {
    return NextResponse.json({ error: "Target file does not exist to back up" }, { status: 400 });
  }

  const meta = await backupManager.create({
    content: target.read.text,
    sourcePath: target.spec.path,
    reason: "manual",
    name: name?.trim() || undefined,
  });

  await home.logActivity("backup_create", `Created manual backup ${meta.name}`);
  return NextResponse.json(meta);
}
