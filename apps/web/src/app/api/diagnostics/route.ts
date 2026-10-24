import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { runDiagnostics } from "@occ/core";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { install, penv, files, state } = await getAppContext();
  const port = parseInt(process.env.PORT || "3000", 10);

  const report = await runDiagnostics({
    install,
    penv,
    files,
    state,
    port,
  });

  return NextResponse.json(report);
}
