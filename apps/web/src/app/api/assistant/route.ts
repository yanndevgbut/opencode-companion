import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { generateConfigPlan } from "@occ/core";
import { applyOps, type WorkFile } from "@occ/adapter";

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { instruction } = body;

  if (!instruction || typeof instruction !== "string") {
    return NextResponse.json({ error: "Instruction string is required" }, { status: 400 });
  }

  const { home, state, files, store } = await getAppContext();
  const settings = await home.readSettings();

  try {
    const plan = await generateConfigPlan({
      instruction,
      settings: settings.ai,
      state,
    });

    let previewChanges: any[] = [];
    let warnings: string[] = [];

    if (plan.operations.length > 0) {
      const workFiles: WorkFile[] = files.map((f) => ({
        spec: f.spec,
        writable: f.writable,
        exists: f.read.exists,
        text: f.read.text,
        hash: f.read.hash,
      }));

      const res = applyOps(workFiles, store.primaryId, plan.operations);
      previewChanges = res.changes;
      warnings = res.warnings;
    }

    return NextResponse.json({
      answer: plan.answer,
      operations: plan.operations,
      changes: previewChanges,
      warnings,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      code: err.code || "unknown",
    }, { status: err.code === "not-configured" ? 428 : 400 });
  }
}
