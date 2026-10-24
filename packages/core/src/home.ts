import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { atomicWriteText } from "./fsutil";

export const APP_VERSION = "0.1.0";

export const aiSettingsSchema = z
  .object({
    baseURL: z.string().url().refine((u) => /^https?:/.test(u), "must be http(s)"),
    apiKey: z.string().max(4096).optional(),
    model: z.string().min(1).max(200),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict();
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const settingsSchema = z
  .object({
    configDirOverride: z.string().nullable().default(null),
    projectDir: z.string().nullable().default(null),
    ai: aiSettingsSchema.nullable().default(null),
  })
  .strip();
export type Settings = z.infer<typeof settingsSchema>;

const ACTIVITY_MAX = 200;

/** Owns `~/.opencode-companion`: settings, HMAC key for secret placeholders, activity log. */
export class CompanionHome {
  readonly dir: string;
  readonly backupsDir: string;
  private key: Buffer | null = null;

  constructor(dir: string) {
    this.dir = dir;
    this.backupsDir = path.join(dir, "backups");
  }

  async init(): Promise<void> {
    await fsp.mkdir(this.dir, { recursive: true, mode: 0o700 });
    await fsp.chmod(this.dir, 0o700).catch(() => undefined);
    await fsp.mkdir(this.backupsDir, { recursive: true, mode: 0o700 });
    await this.secretKey();
  }

  async secretKey(): Promise<Buffer> {
    if (this.key) return this.key;
    const file = path.join(this.dir, "secret.key");
    try {
      const hex = (await fsp.readFile(file, "utf8")).trim();
      if (/^[0-9a-f]{64}$/.test(hex)) {
        this.key = Buffer.from(hex, "hex");
        return this.key;
      }
    } catch {
      /* create below */
    }
    const k = randomBytes(32);
    await atomicWriteText(file, k.toString("hex"), 0o600);
    this.key = k;
    return k;
  }

  private settingsFile(): string {
    return path.join(this.dir, "settings.json");
  }

  async readSettings(): Promise<Settings> {
    try {
      const raw = JSON.parse(await fsp.readFile(this.settingsFile(), "utf8")) as unknown;
      const r = settingsSchema.safeParse(raw);
      if (r.success) return r.data;
    } catch {
      /* default */
    }
    return settingsSchema.parse({});
  }

  async writeSettings(next: Settings): Promise<void> {
    await atomicWriteText(this.settingsFile(), JSON.stringify(next, null, 2) + "\n", 0o600);
  }

  // ---- activity log (no secrets are ever passed in) ----
  private activityFile(): string {
    return path.join(this.dir, "activity.jsonl");
  }

  async logActivity(type: string, summary: string): Promise<void> {
    const line = JSON.stringify({ ts: new Date().toISOString(), type, summary: summary.slice(0, 300) }) + "\n";
    try {
      await fsp.appendFile(this.activityFile(), line, { mode: 0o600 });
      const st = await fsp.stat(this.activityFile());
      if (st.size > 256 * 1024) {
        const lines = (await fsp.readFile(this.activityFile(), "utf8")).trim().split("\n").slice(-ACTIVITY_MAX);
        await atomicWriteText(this.activityFile(), lines.join("\n") + "\n", 0o600);
      }
    } catch {
      /* activity is best-effort */
    }
  }

  async readActivity(limit = 20): Promise<{ ts: string; type: string; summary: string }[]> {
    try {
      const lines = (await fsp.readFile(this.activityFile(), "utf8")).trim().split("\n").filter(Boolean);
      return lines
        .slice(-limit)
        .reverse()
        .map((l) => JSON.parse(l) as { ts: string; type: string; summary: string });
    } catch {
      return [];
    }
  }
}
