import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { applyOps, type WorkFile } from "@occ/adapter";
import { providerPatchSchema, PROVIDER_ID_RE } from "@occ/schemas";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { state } = await getAppContext();
  return NextResponse.json(state.providers);
}

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { id, provider } = body;

  if (!id || typeof id !== "string" || !PROVIDER_ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid provider ID. Alphanumeric, dot, underscore, dash only." }, { status: 400 });
  }

  const patchParsed = providerPatchSchema.safeParse(provider || {});
  if (!patchParsed.success) {
    return NextResponse.json({ error: patchParsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") }, { status: 400 });
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
    const res = applyOps(workFiles, store.primaryId, [
      { op: "upsertProvider", id, provider: patchParsed.data },
    ]);

    // Perform auto-backups before committing writes
    for (const change of res.changes) {
      if (!change.isNew) {
        await backupManager.create({
          content: change.before,
          sourcePath: change.path,
          reason: "auto-before-change",
          name: `Before updating provider ${id}`,
        });
      }
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("provider_upsert", `Upserted provider ${id}`);
    return NextResponse.json({ ok: true, summary: res.summary, warnings: res.warnings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to upsert provider" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing provider id" }, { status: 400 });

  const { files, store, home, backupManager } = await getAppContext();
  const workFiles: WorkFile[] = files.map((f) => ({
    spec: f.spec,
    writable: f.writable,
    exists: f.read.exists,
    text: f.read.text,
    hash: f.read.hash,
  }));

  try {
    const res = applyOps(workFiles, store.primaryId, [
      { op: "removeProvider", id },
    ]);

    for (const change of res.changes) {
      await backupManager.create({
        content: change.before,
        sourcePath: change.path,
        reason: "auto-before-change",
        name: `Before removing provider ${id}`,
      });
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("provider_remove", `Removed provider ${id}`);
    return NextResponse.json({ ok: true, summary: res.summary, warnings: res.warnings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to remove provider" }, { status: 400 });
  }
}
