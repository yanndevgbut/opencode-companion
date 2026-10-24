import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REF_RE = /\{(env|file):([^}]+)\}/g;

export interface RefContext {
  env: Record<string, string | undefined>;
  /** Directory of the config file that holds the reference (for relative `{file:}` paths). */
  baseDir: string;
  home: string;
}

export interface ResolveResult {
  value: string;
  missing: string[];
}

/** Resolve `{env:X}` and `{file:path}` the way OpenCode documents them. Used only to *test* connectivity. */
export function resolveRefs(input: string, ctx: RefContext): ResolveResult {
  const missing: string[] = [];
  const value = input.replace(REF_RE, (_m, kind: string, arg: string) => {
    const a = arg.trim();
    if (kind === "env") {
      const v = ctx.env[a];
      if (v === undefined || v === "") {
        missing.push(`env:${a}`);
        return "";
      }
      return v;
    }
    let file = a;
    if (file.startsWith("~/")) file = path.join(ctx.home || os.homedir(), file.slice(2));
    else if (!path.isAbsolute(file)) file = path.join(ctx.baseDir, file);
    try {
      return fs.readFileSync(file, "utf8").trim();
    } catch {
      missing.push(`file:${a}`);
      return "";
    }
  });
  return { value, missing };
}

export const hasRefs = (s: string): boolean => /\{(env|file):[^}]+\}/.test(s);
