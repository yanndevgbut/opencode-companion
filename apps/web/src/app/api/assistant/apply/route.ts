import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { applyOps, type WorkFile } from "@occ/adapter";

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { operations } = body;

  if (!Array.isArray(operations) || operations.length === 0) {
    return NextResponse.json({ error: "Array of operations is required" }, { status: 400 });
  }

  const { files, store, home, backupManager } = await getAppContext();
  const workFiles: WorkFile[] = files.map((f) => ({
    spec: f.spec,
    writable: f.writable,
    exists: f.read.exists,
    text: f.read.text,
    hash: f.read.hash,
  }));

  try {
    const res = applyOps(workFiles, store.primaryId, operations);

    for (const change of res.changes) {
      if (!change.isNew) {
        await backupManager.create({
          content: change.before,
          sourcePath: change.path,
          reason: "auto-before-change",
          name: `Before applying AI assistant plan`,
        });
      }
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("ai_apply", `Applied ${operations.length} operations from AI Assistant plan`);
    return NextResponse.json({ ok: true, summary: res.summary, warnings: res.warnings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
