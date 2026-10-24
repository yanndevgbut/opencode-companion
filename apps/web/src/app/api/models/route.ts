import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { applyOps, type WorkFile } from "@occ/adapter";
import { modelConfigSchema } from "@occ/schemas";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { state } = await getAppContext();
  return NextResponse.json({
    models: state.models,
    defaults: state.defaults,
  });
}

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { providerId, modelId, model, unset } = body;

  if (!providerId || !modelId) {
    return NextResponse.json({ error: "Missing providerId or modelId" }, { status: 400 });
  }

  const parsed = modelConfigSchema.safeParse(model || {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") }, { status: 400 });
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
      { op: "upsertModel", providerId, modelId, model: parsed.data, unset },
    ]);

    for (const change of res.changes) {
      if (!change.isNew) {
        await backupManager.create({
          content: change.before,
          sourcePath: change.path,
          reason: "auto-before-change",
          name: `Before updating model ${providerId}/${modelId}`,
        });
      }
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("model_upsert", `Upserted model ${providerId}/${modelId}`);
    return NextResponse.json({ ok: true, summary: res.summary, warnings: res.warnings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to upsert model" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const url = new URL(req.url);
  const providerId = url.searchParams.get("providerId");
  const modelId = url.searchParams.get("modelId");

  if (!providerId || !modelId) {
    return NextResponse.json({ error: "Missing providerId or modelId" }, { status: 400 });
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
      { op: "removeModel", providerId, modelId },
    ]);

    for (const change of res.changes) {
      await backupManager.create({
        content: change.before,
        sourcePath: change.path,
        reason: "auto-before-change",
        name: `Before removing model ${providerId}/${modelId}`,
      });
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("model_remove", `Removed model ${providerId}/${modelId}`);
    return NextResponse.json({ ok: true, summary: res.summary, warnings: res.warnings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to remove model" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { target, value } = body;

  if (target !== "model" && target !== "small_model") {
    return NextResponse.json({ error: 'Target must be "model" or "small_model"' }, { status: 400 });
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
      { op: "setDefaultModel", target, value },
    ]);

    for (const change of res.changes) {
      await backupManager.create({
        content: change.before,
        sourcePath: change.path,
        reason: "auto-before-change",
        name: `Before setting ${target}`,
      });
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("model_default", `Set ${target} = ${value ?? "none"}`);
    return NextResponse.json({ ok: true, summary: res.summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to set default model" }, { status: 400 });
  }
}
