import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { isAllowedConfigBasename } from "./paths";

export const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

export class ConflictError extends Error {
  constructor(public readonly currentHash: string | null) {
    super("The file changed on disk since it was loaded.");
  }
}
export class UnsafePathError extends Error {}
export class ConfigTooLargeError extends Error {}

export interface ReadResult {
  exists: boolean;
  text: string;
  hash: string | null;
  size: number;
  mtimeMs: number;
  readable: boolean;
  error?: string;
}

export async function readConfigFile(file: string): Promise<ReadResult> {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) return { exists: true, text: "", hash: null, size: 0, mtimeMs: st.mtimeMs, readable: false, error: "not a regular file" };
    if (st.size > MAX_CONFIG_BYTES) {
      return { exists: true, text: "", hash: null, size: st.size, mtimeMs: st.mtimeMs, readable: false, error: `file larger than ${MAX_CONFIG_BYTES} bytes` };
    }
    const buf = await fsp.readFile(file);
    return { exists: true, text: buf.toString("utf8"), hash: sha256(buf), size: buf.length, mtimeMs: st.mtimeMs, readable: true };
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") return { exists: false, text: "", hash: null, size: 0, mtimeMs: 0, readable: true };
    return { exists: true, text: "", hash: null, size: 0, mtimeMs: 0, readable: false, error: err.code ?? err.message };
  }
}

export async function canWrite(file: string): Promise<boolean> {
  try {
    const st = await fsp.stat(file).catch(() => null);
    if (st) {
      await fsp.access(file, fs.constants.W_OK);
      await fsp.access(path.dirname(file), fs.constants.W_OK); // atomic replace needs directory write access
      return true;
    }
    let dir = path.dirname(file);
    for (let i = 0; i < 8; i++) {
      try {
        await fsp.access(dir, fs.constants.W_OK);
        return true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") return false;
        const parent = path.dirname(dir);
        if (parent === dir) return false;
        dir = parent;
      }
    }
    return false;
  } catch {
    return false;
  }
}

const locks = new Map<string, Promise<unknown>>();
export async function withFileLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt < 5 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
        await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

export interface WriteOptions {
  /** Hash the caller loaded. `null` means "file must not exist". `undefined` skips the check (never used by the API). */
  expectedHash?: string | null;
  mode?: number;
}

/**
 * Atomic write: temp file in the same directory, fsync, rename over the target.
 * Symlinks are resolved first so dotfile managers keep working. The expected hash is re-checked under a lock
 * immediately before the rename.
 */
export async function atomicWriteConfig(file: string, text: string, opts: WriteOptions = {}): Promise<{ hash: string; size: number }> {
  if (!path.isAbsolute(file)) throw new UnsafePathError("config path must be absolute");
  if (!isAllowedConfigBasename(path.basename(file))) throw new UnsafePathError(`refusing to write ${path.basename(file)}`);
  const buf = Buffer.from(text, "utf8");
  if (buf.length > MAX_CONFIG_BYTES) throw new ConfigTooLargeError("config too large");

  return withFileLock(file, async () => {
    let target = file;
    let existingMode: number | undefined;
    try {
      target = await fsp.realpath(file);
      existingMode = (await fsp.stat(target)).mode & 0o777;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (opts.expectedHash !== undefined) {
      const cur = await readConfigFile(target);
      const curHash = cur.exists ? cur.hash : null;
      if (curHash !== opts.expectedHash) throw new ConflictError(curHash);
    }
    await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const tmp = path.join(path.dirname(target), `.${path.basename(target)}.occ-${process.pid}-${Date.now().toString(36)}.tmp`);
    const mode = existingMode ?? opts.mode ?? 0o600;
    const fh = await fsp.open(tmp, "wx", mode);
    try {
      await fh.writeFile(buf);
      await fh.sync().catch(() => undefined);
    } finally {
      await fh.close();
    }
    try {
      await fsp.chmod(tmp, mode).catch(() => undefined);
      await renameWithRetry(tmp, target);
    } catch (e) {
      await fsp.rm(tmp, { force: true }).catch(() => undefined);
      throw e;
    }
    return { hash: sha256(buf), size: buf.length };
  });
}
