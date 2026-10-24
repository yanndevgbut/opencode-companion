import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { testMcpRemote, testMcpLocal, type RefContext } from "@occ/core";
import { getAt, isRecord } from "@occ/adapter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { name } = await params;
  const body = await req.json().catch(() => ({}));
  const { confirmLocalExecution } = body;

  const { files, penv } = await getAppContext();

  let config: Record<string, unknown> | null = null;
  let baseDir = process.cwd();

  for (const f of files) {
    if (!f.read.exists || !f.parse.doc) continue;
    const m = getAt(f.parse.doc, ["mcp", name]);
    if (isRecord(m)) {
      config = m;
      baseDir = f.spec.path.split(/[\\/]/).slice(0, -1).join("/") || baseDir;
    }
  }

  if (!config) {
    return NextResponse.json({ error: `MCP server "${name}" not found in configuration.` }, { status: 404 });
  }

  const ctx: RefContext = {
    env: penv.env,
    baseDir,
    home: penv.home,
  };

  const type = config.type;

  if (type === "remote") {
    if (typeof config.url !== "string") {
      return NextResponse.json({ error: "Remote MCP server has no URL configured." }, { status: 400 });
    }
    const headers = isRecord(config.headers) ? (config.headers as Record<string, string>) : undefined;
    const result = await testMcpRemote({
      url: config.url,
      headers,
      ctx,
      timeoutMs: 12_000,
    });
    return NextResponse.json(result);
  }

  if (type === "local") {
    const cmd = Array.isArray(config.command) ? (config.command as string[]) : [];
    if (cmd.length === 0) {
      return NextResponse.json({ error: "Local MCP server has no command configured." }, { status: 400 });
    }

    if (!confirmLocalExecution) {
      return NextResponse.json({
        confirmationRequired: true,
        command: cmd,
        message: `Local server execution requires confirmation. Command to be executed: "${cmd.join(" ")}"`,
      }, { status: 200 });
    }

    const environment = isRecord(config.environment) ? (config.environment as Record<string, string>) : undefined;
    const cwd = typeof config.cwd === "string" ? config.cwd : undefined;

    const result = await testMcpLocal({
      command: cmd,
      cwd,
      environment,
      ctx,
      timeoutMs: 15_000,
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: `Unsupported MCP type "${String(type)}"` }, { status: 400 });
}
