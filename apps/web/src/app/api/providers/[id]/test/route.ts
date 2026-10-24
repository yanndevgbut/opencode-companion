import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { testProviderEndpoint, type RefContext } from "@occ/core";
import { getAt, isRecord } from "@occ/adapter";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { id } = await params;
  const { files, penv } = await getAppContext();

  // Find the provider config in files
  let baseURL: string | undefined;
  let apiKey: string | undefined;
  let npm: string | undefined;
  let headers: Record<string, string> | undefined;
  let baseDir = process.cwd();

  for (const f of files) {
    if (!f.read.exists || !f.parse.doc) continue;
    const p = getAt(f.parse.doc, ["provider", id]);
    if (isRecord(p)) {
      baseDir = f.spec.path.split(/[\\/]/).slice(0, -1).join("/") || baseDir;
      if (typeof p.npm === "string") npm = p.npm;
      const opts = isRecord(p.options) ? p.options : {};
      if (typeof opts.baseURL === "string") baseURL = opts.baseURL;
      if (typeof opts.apiKey === "string") apiKey = opts.apiKey;
      if (isRecord(opts.headers)) {
        headers = opts.headers as Record<string, string>;
      }
    }
  }

  const ctx: RefContext = {
    env: penv.env,
    baseDir,
    home: penv.home,
  };

  const result = await testProviderEndpoint({
    baseURL,
    apiKey,
    npm,
    headers,
    ctx,
    timeoutMs: 10_000,
  });

  return NextResponse.json(result);
}
