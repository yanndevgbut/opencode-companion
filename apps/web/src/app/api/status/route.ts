import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const { install, files, state, store, home } = await getAppContext();
  const recentActivity = await home.readActivity(10);

  const fileViews = files.map((f) => store.toView(f));

  return NextResponse.json({
    install,
    primaryPath: store.spec(store.primaryId)?.path ?? null,
    primaryDir: store.primaryDir,
    files: fileViews,
    summary: {
      providerCount: state.providers.length,
      modelCount: state.models.length,
      mcpCount: state.mcp.length,
      hasIssues: state.issues.length > 0,
      issueCount: state.issues.length,
      defaultModel: state.defaults.model,
      smallModel: state.defaults.smallModel,
    },
    issues: state.issues,
    recentActivity,
  });
}
