import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { id } = await params;
  const { backupManager, files, store, home } = await getAppContext();

  try {
    const { meta, content } = await backupManager.read(id);
    const targetFile = files.find((f) => f.spec.path === meta.sourcePath);

    if (!targetFile) {
      return NextResponse.json({ error: `Original target file ${meta.sourcePath} is not among detected files.` }, { status: 400 });
    }
    if (!targetFile.spec.editable || !targetFile.writable) {
      return NextResponse.json({ error: `Target file ${meta.sourcePath} is not writable.` }, { status: 403 });
    }

    // Backup current state first
    if (targetFile.read.exists) {
      await backupManager.create({
        content: targetFile.read.text,
        sourcePath: targetFile.spec.path,
        reason: "auto-before-restore",
        name: `Before restoring backup ${meta.name}`,
      });
    }

    await store.write(targetFile.spec.id, content, null);
    await home.logActivity("backup_restore", `Restored backup ${meta.name} to ${meta.sourcePath}`);
    return NextResponse.json({ ok: true, meta });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
