import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCompanionHome } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { settingsSchema } from "@occ/core";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const home = await getCompanionHome();
  const settings = await home.readSettings();

  // Mask AI API key in response
  const sanitized = {
    ...settings,
    ai: settings.ai
      ? {
          ...settings.ai,
          apiKey: settings.ai.apiKey ? (settings.ai.apiKey.length >= 10 ? `••••${settings.ai.apiKey.slice(-4)}` : "••••") : undefined,
        }
      : null,
  };

  return NextResponse.json(sanitized);
}

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const home = await getCompanionHome();
  const current = await home.readSettings();
  const body = await req.json();

  // If apiKey was masked/unchanged, retain original
  if (body.ai && body.ai.apiKey?.startsWith("••••") && current.ai?.apiKey) {
    body.ai.apiKey = current.ai.apiKey;
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") }, { status: 400 });
  }

  await home.writeSettings(parsed.data);
  await home.logActivity("settings_update", "Updated Companion settings");

  return NextResponse.json({ ok: true });
}
