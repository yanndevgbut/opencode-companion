import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseJsonc, sha256 } from "@occ/adapter";
import type { BackupMeta } from "@occ/schemas";
import { APP_VERSION } from "./home";
import { atomicWriteText } from "./fsutil";

const metaSchema = z.object({
  id: z.string().regex(/^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/),
  name: z.string().max(120),
  createdAt: z.string(),
  reason: z.enum(["manual", "auto-before-change", "auto-before-restore", "import"]),
  sourcePath: z.string(),
  fileName: z.string().regex(/^opencode\.jsonc?$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  appVersion: z.string(),
});

export class BackupError extends Error {
  constructor(
    message: string,
    public readonly code: "not-found" | "corrupt" | "invalid" | "incompatible" = "invalid",
  ) {
    super(message);
  }
}

const ID_RE = /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}$/;
export const MAX_BACKUPS_PER_CONFIG = 100;

function newId(): string {
  const d = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return `${d}-${randomBytes(3).toString("hex")}`;
}

export class BackupManager {
  constructor(private readonly dir: string) {}

  private dirFor(id: string): string {
    if (!ID_RE.test(id)) throw new BackupError("invalid backup id", "invalid");
    return path.join(this.dir, id);
  }

  async create(input: { content: string; sourcePath: string; reason: BackupMeta["reason"]; name?: string }): Promise<BackupMeta> {
    const id = newId();
    const fileName = path.basename(input.sourcePath);
    if (!/^opencode\.jsonc?$/.test(fileName)) throw new BackupError("only opencode.json / opencode.jsonc can be backed up");
    const buf = Buffer.from(input.content, "utf8");
    const meta: BackupMeta = {
      id,
      name: (input.name?.trim() || `${input.reason === "manual" ? "Manual" : input.reason === "import" ? "Imported" : "Auto"} ${id.slice(0, 15)}`).slice(0, 120),
      createdAt: new Date().toISOString(),
      reason: input.reason,
      sourcePath: input.sourcePath,
      fileName,
      sha256: sha256(buf),
      size: buf.length,
      appVersion: APP_VERSION,
    };
    const d = this.dirFor(id);
    await fsp.mkdir(d, { recursive: true, mode: 0o700 });
    await atomicWriteText(path.join(d, fileName), input.content, 0o600);
    await atomicWriteText(path.join(d, "meta.json"), JSON.stringify(meta, null, 2) + "\n", 0o600);
    await this.prune(input.sourcePath).catch(() => undefined);
    return meta;
  }

  async list(): Promise<BackupMeta[]> {
    let names: string[] = [];
    try {
      names = await fsp.readdir(this.dir);
    } catch {
      return [];
    }
    const out: BackupMeta[] = [];
    for (const n of names) {
      if (!ID_RE.test(n)) continue;
      try {
        const raw = JSON.parse(await fsp.readFile(path.join(this.dir, n, "meta.json"), "utf8")) as unknown;
        const m = metaSchema.safeParse(raw);
        if (m.success && m.data.id === n) out.push(m.data);
      } catch {
        /* unreadable entries are skipped from the list; they cannot be restored either */
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<BackupMeta> {
    const d = this.dirFor(id);
    let raw: unknown;
    try {
      raw = JSON.parse(await fsp.readFile(path.join(d, "meta.json"), "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new BackupError("backup not found", "not-found");
      throw new BackupError("backup metadata is corrupt", "corrupt");
    }
    const m = metaSchema.safeParse(raw);
    if (!m.success) throw new BackupError("backup metadata is corrupt or from an incompatible version", "incompatible");
    return m.data;
  }

  /** Read and fully verify a backup: checksum, JSON syntax. Throws a precise error otherwise. */
  async read(id: string): Promise<{ meta: BackupMeta; content: string }> {
    const meta = await this.get(id);
    let buf: Buffer;
    try {
      buf = await fsp.readFile(path.join(this.dirFor(id), meta.fileName));
    } catch {
      throw new BackupError("backup file is missing", "corrupt");
    }
    if (sha256(buf) !== meta.sha256) throw new BackupError("backup checksum mismatch — the file was modified or damaged", "corrupt");
    const content = buf.toString("utf8");
    const parsed = parseJsonc(content);
    if (!parsed.doc) throw new BackupError(`backup is not valid JSON: ${parsed.errors[0]?.message ?? "unknown error"}`, "corrupt");
    return { meta, content };
  }

  async remove(id: string): Promise<void> {
    const d = this.dirFor(id);
    await this.get(id).catch((e: BackupError) => {
      if (e.code === "not-found") throw e;
    });
    await fsp.rm(d, { recursive: true, force: true });
  }

  async rename(id: string, name: string): Promise<BackupMeta> {
    const meta = await this.get(id);
    const next = { ...meta, name: name.trim().slice(0, 120) || meta.name };
    await atomicWriteText(path.join(this.dirFor(id), "meta.json"), JSON.stringify(next, null, 2) + "\n", 0o600);
    return next;
  }

  private async prune(sourcePath: string): Promise<void> {
    const mine = (await this.list()).filter((b) => b.sourcePath === sourcePath && b.reason.startsWith("auto"));
    for (const old of mine.slice(MAX_BACKUPS_PER_CONFIG)) await fsp.rm(this.dirFor(old.id), { recursive: true, force: true });
  }
}
