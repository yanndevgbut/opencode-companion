import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/server/context";
import { validateRequest } from "@/lib/server/security";
import { redactText, restoreText, parseJsonc } from "@occ/adapter";
import { validateAgainstOpenCodeSchema } from "@occ/schemas";

export async function GET(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const url = new URL(req.url);
  const fileId = url.searchParams.get("fileId");
  const { store, files, home } = await getAppContext();

  if (!fileId) {
    return NextResponse.json({
      files: files.map((f) => store.toView(f)),
      primaryId: store.primaryId,
    });
  }

  const loaded = files.find((f) => f.spec.id === fileId);
  if (!loaded) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const key = await home.secretKey();
  const redacted = loaded.read.exists ? redactText(loaded.read.text, key) : "";

  return NextResponse.json({
    file: store.toView(loaded),
    content: redacted,
    originalHash: loaded.read.hash,
  });
}

export async function POST(req: NextRequest) {
  const auth = validateRequest(req);
  if (!auth.authorized) return auth.response!;

  const body = await req.json();
  const { fileId, content, expectedHash } = body;

  if (!fileId || typeof content !== "string") {
    return NextResponse.json({ error: "Missing fileId or content" }, { status: 400 });
  }

  const { store, files, home, backupManager } = await getAppContext();
  const loaded = files.find((f) => f.spec.id === fileId);
  if (!loaded) return NextResponse.json({ error: "File not found" }, { status: 404 });
  if (!loaded.spec.editable || !loaded.writable) {
    return NextResponse.json({ error: "This file is read-only and cannot be modified." }, { status: 403 });
  }

  // Restore secrets from HMAC placeholder
  const key = await home.secretKey();
  let restored = content;
  try {
    restored = restoreText(content, loaded.read.text, key);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  // Syntax and schema check before writing
  const parsed = parseJsonc(restored);
  if (!parsed.doc) {
    return NextResponse.json({ error: `JSON syntax error: ${parsed.errors[0]?.message ?? "Invalid JSON"}` }, { status: 400 });
  }
  const issues = validateAgainstOpenCodeSchema(parsed.doc, fileId);
  const fatalErrors = issues.filter((i) => i.level === "error");
  if (fatalErrors.length > 0) {
    return NextResponse.json({
      error: `Config violates OpenCode schema: ${fatalErrors[0]?.message} at ${fatalErrors[0]?.path}`,
    }, { status: 400 });
  }

  // Auto-backup before saving
  if (loaded.read.exists) {
    await backupManager.create({
      content: loaded.read.text,
      sourcePath: loaded.spec.path,
      reason: "auto-before-change",
      name: `Before editor save of ${loaded.spec.path.split(/[\\/]/).pop()}`,
    });
  }

  try {
    const written = await store.write(fileId, restored, expectedHash ?? loaded.read.hash);
    await home.logActivity("editor_save", `Saved ${loaded.spec.path.split(/[\\/]/).pop()} via Config Editor`);
    return NextResponse.json({ ok: true, hash: written.hash, size: written.size });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to write file" }, { status: 409 });
  }
}
