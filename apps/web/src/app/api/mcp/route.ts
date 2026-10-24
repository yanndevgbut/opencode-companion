import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { applyOps, type WorkFile } from "@occ/adapter";
import { mcpConfigSchema, MCP_NAME_RE } from "@occ/schemas";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { state } = await getAppContext();
  return NextResponse.json({
    servers: state.mcp,
    settings: state.mcpSettings,
  });
}

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { name, config } = body;

  if (!name || !MCP_NAME_RE.test(name)) {
    return NextResponse.json({ error: "Invalid MCP server name." }, { status: 400 });
  }

  const parsed = mcpConfigSchema.safeParse(config);
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
      { op: "upsertMcp", name, config: parsed.data },
    ]);

    for (const change of res.changes) {
      if (!change.isNew) {
        await backupManager.create({
          content: change.before,
          sourcePath: change.path,
          reason: "auto-before-change",
          name: `Before updating MCP ${name}`,
        });
      }
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("mcp_upsert", `Upserted MCP server ${name}`);
    return NextResponse.json({ ok: true, summary: res.summary, warnings: res.warnings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to upsert MCP server" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const url = new URL(req.url);
  const name = url.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing MCP server name" }, { status: 400 });

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
      { op: "removeMcp", name },
    ]);

    for (const change of res.changes) {
      await backupManager.create({
        content: change.before,
        sourcePath: change.path,
        reason: "auto-before-change",
        name: `Before removing MCP ${name}`,
      });
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("mcp_remove", `Removed MCP server ${name}`);
    return NextResponse.json({ ok: true, summary: res.summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to remove MCP server" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { name, enabled } = body;
  if (!name || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Missing name or enabled boolean" }, { status: 400 });
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
      { op: "setMcpEnabled", name, enabled },
    ]);

    for (const change of res.changes) {
      await backupManager.create({
        content: change.before,
        sourcePath: change.path,
        reason: "auto-before-change",
        name: `Before toggling MCP ${name}`,
      });
      await store.write(change.fileId, change.after, change.beforeHash);
    }

    await home.logActivity("mcp_toggle", `${enabled ? "Enabled" : "Disabled"} MCP server ${name}`);
    return NextResponse.json({ ok: true, summary: res.summary });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to toggle MCP server" }, { status: 400 });
  }
}
