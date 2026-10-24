import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FileView } from "@occ/schemas";
import { atomicWriteConfig, canWrite, readConfigFile, type ReadResult } from "./files";
import { parseJsonc } from "./jsonc";
import {
  CONFIG_FILE_NAMES,
  customConfigDir,
  customConfigFile,
  globalConfigDir,
  managedConfigDir,
  pathApi,
  type PathEnv,
} from "./paths";

export type FileRole = FileView["role"];
export interface FileSpec {
  id: string;
  path: string;
  role: FileRole;
  /** managed (admin) files are never written. */
  editable: boolean;
}

export interface DiscoverOptions {
  /** Directory chosen manually in settings or via CLI flag. Replaces the default global dir as the primary location. */
  configDirOverride?: string | null;
  /** Optional project directory; its opencode.json(c) are listed after global ones. */
  projectDir?: string | null;
}

const shortId = (role: string, file: string): string => `${role}-${createHash("sha1").update(file).digest("hex").slice(0, 8)}`;

/**
 * Config sources in OpenCode precedence order (later overrides earlier), according to the official docs:
 * global → OPENCODE_CONFIG → project → OPENCODE_CONFIG_DIR → managed.
 * The primary writable file is `<global or chosen dir>/opencode.json`.
 */
export function discoverConfigFiles(p: PathEnv, opts: DiscoverOptions = {}): { files: FileSpec[]; primaryId: string; primaryDir: string } {
  const pa = pathApi(p.platform);
  const files: FileSpec[] = [];
  const seen = new Set<string>();
  const add = (file: string, role: FileRole, editable = true): void => {
    const key = p.platform === "win32" ? file.toLowerCase() : file;
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ id: shortId(role, file), path: file, role, editable });
  };

  const primaryDir = opts.configDirOverride && pa.isAbsolute(opts.configDirOverride) ? opts.configDirOverride : globalConfigDir(p);
  const primaryRole: FileRole = opts.configDirOverride ? "custom" : "global";
  for (const name of CONFIG_FILE_NAMES) add(pa.join(primaryDir, name), name === "opencode.json" ? "primary" : primaryRole);

  const cf = customConfigFile(p);
  if (cf) add(cf, "custom");
  if (opts.projectDir && pa.isAbsolute(opts.projectDir)) {
    for (const name of CONFIG_FILE_NAMES) add(pa.join(opts.projectDir, name), "project");
  }
  const cd = customConfigDir(p);
  if (cd) for (const name of CONFIG_FILE_NAMES) add(pa.join(cd, name), "custom");
  const managed = managedConfigDir(p);
  if (managed) for (const name of CONFIG_FILE_NAMES) add(pa.join(managed, name), "managed", false);

  const primary = files.find((f) => f.role === "primary");
  if (!primary) throw new Error("internal: primary config file missing");
  return { files, primaryId: primary.id, primaryDir };
}

export interface LoadedFile {
  spec: FileSpec;
  read: ReadResult;
  parse: ReturnType<typeof parseJsonc>;
  writable: boolean;
}

export class ConfigStore {
  private specs: FileSpec[] = [];
  primaryId = "";
  primaryDir = "";

  constructor(
    private readonly penv: PathEnv,
    private opts: DiscoverOptions = {},
  ) {
    this.refreshSpecs();
  }

  private refreshSpecs(): void {
    const d = discoverConfigFiles(this.penv, this.opts);
    this.specs = d.files;
    this.primaryId = d.primaryId;
    this.primaryDir = d.primaryDir;
  }

  setOptions(opts: DiscoverOptions): void {
    this.opts = opts;
    this.refreshSpecs();
  }

  getOptions(): DiscoverOptions {
    return { ...this.opts };
  }

  listSpecs(): FileSpec[] {
    return [...this.specs];
  }

  /** Resolve an opaque file id to a registered spec. This is the only way a path reaches the filesystem. */
  spec(id: string): FileSpec | undefined {
    return this.specs.find((s) => s.id === id);
  }

  async load(id: string): Promise<LoadedFile> {
    const spec = this.spec(id);
    if (!spec) throw new Error(`unknown config file id`);
    const read = await readConfigFile(spec.path);
    const parse = read.readable ? parseJsonc(read.text) : { doc: null, errors: [], empty: false };
    const writable = spec.editable && (await canWrite(spec.path));
    return { spec, read, parse, writable };
  }

  async loadAll(): Promise<LoadedFile[]> {
    return Promise.all(this.specs.map((s) => this.load(s.id)));
  }

  toView(f: LoadedFile): FileView {
    const err = !f.read.readable ? (f.read.error ?? "unreadable") : f.parse.errors[0] ? `${f.parse.errors[0].message} (line ${f.parse.errors[0].line}, col ${f.parse.errors[0].column})` : undefined;
    return {
      id: f.spec.id,
      path: f.spec.path,
      role: f.spec.role,
      exists: f.read.exists,
      readable: f.read.readable,
      writable: f.writable,
      size: f.read.size,
      mtimeMs: f.read.mtimeMs,
      hash: f.read.hash,
      parseOk: f.read.exists ? f.read.readable && f.parse.errors.length === 0 : true,
      parseError: err,
    };
  }

  async write(id: string, text: string, expectedHash: string | null): Promise<{ hash: string; size: number }> {
    const spec = this.spec(id);
    if (!spec) throw new Error("unknown config file id");
    if (!spec.editable) throw new Error("this file is managed by an administrator and is read-only");
    return atomicWriteConfig(spec.path, text, { expectedHash });
  }
}

export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export const joinConfig = (dir: string, name: string): string => path.join(dir, name);
