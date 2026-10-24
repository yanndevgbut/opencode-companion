import { createPatch } from "diff";
import {
  type Op,
  type ConfigIssue,
  validateAgainstOpenCodeSchema,
  mcpConfigSchema,
  opSchema,
} from "@occ/schemas";
import { getAt, isRecord, parseJsonc, setPath, type JsonPath } from "./jsonc";
import type { FileSpec } from "./store";

/** Sentinel for "keep the stored secret value" in header/environment maps. */
export const KEEP = "{keep}";

export class OpError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid" | "not-found" | "read-only" | "exists" | "schema" = "invalid",
  ) {
    super(message);
  }
}

export interface WorkFile {
  spec: FileSpec;
  writable: boolean;
  exists: boolean;
  text: string;
  hash: string | null;
}

export interface FileChange {
  fileId: string;
  path: string;
  role: string;
  before: string;
  after: string;
  beforeHash: string | null;
  isNew: boolean;
  unifiedDiff: string;
}

export interface OpsResult {
  changes: FileChange[];
  warnings: string[];
  summary: string[];
  newIssues: ConfigIssue[];
}

interface Located {
  file: WorkFile;
  doc: Record<string, unknown>;
}

function docs(files: Map<string, WorkFile>): Located[] {
  const out: Located[] = [];
  for (const file of files.values()) {
    const p = parseJsonc(file.text);
    if (p.doc) out.push({ file, doc: p.doc });
  }
  return out;
}

const EDIT_ERR = (name: string): string => `"${name}" is defined in a file that cannot be edited here (read-only or v2-only syntax). Edit that file manually in the Config Editor.`;

function assertEditable(f: WorkFile, what: string): void {
  if (!f.spec.editable || !f.writable) throw new OpError(`${what}: ${f.spec.path} is not writable`, "read-only");
}

/** Last (highest-precedence) writable file that defines `path` in the legacy dialect. */
function findOwner(files: Map<string, WorkFile>, path: JsonPath): Located | undefined {
  let found: Located | undefined;
  for (const l of docs(files)) if (getAt(l.doc, path) !== undefined) found = l;
  return found;
}

function findAll(files: Map<string, WorkFile>, path: JsonPath): Located[] {
  return docs(files).filter((l) => getAt(l.doc, path) !== undefined);
}

function primary(files: Map<string, WorkFile>, primaryId: string): WorkFile {
  const f = files.get(primaryId);
  if (!f) throw new OpError("primary config file is not available");
  return f;
}

const setIn = (f: WorkFile, path: JsonPath, value: unknown): void => {
  f.text = setPath(f.text, path, value);
};

function resolveKeep(next: Record<string, string> | undefined, existing: unknown, where: string): Record<string, string> | undefined {
  if (!next) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(next)) {
    if (v === KEEP) {
      const old = isRecord(existing) ? existing[k] : undefined;
      if (typeof old !== "string") throw new OpError(`${where}.${k}: no stored value to keep; provide a value`);
      out[k] = old;
    } else out[k] = v;
  }
  return out;
}

function applyOne(files: Map<string, WorkFile>, primaryId: string, op: Op, warnings: string[], summary: string[]): void {
  switch (op.op) {
    case "upsertProvider": {
      const base: JsonPath = ["provider", op.id];
      const owner = findOwner(files, base);
      if (!owner) {
        // exists only in v2 syntax?
        const v2 = findAll(files, ["providers", op.id]);
        if (v2.length) throw new OpError(`provider "${op.id}" is defined with OpenCode v2 \`providers\` syntax: ${EDIT_ERR(op.id)}`, "read-only");
      }
      const f = owner?.file ?? primary(files, primaryId);
      assertEditable(f, `provider "${op.id}"`);
      const p = op.provider;
      const existingOptions = owner ? getAt(owner.doc, [...base, "options"]) : undefined;
      if (p.name !== undefined) setIn(f, [...base, "name"], p.name);
      if (p.npm !== undefined) setIn(f, [...base, "npm"], p.npm);
      if (p.baseURL !== undefined) setIn(f, [...base, "options", "baseURL"], p.baseURL);
      if (p.apiKey !== undefined) setIn(f, [...base, "options", "apiKey"], p.apiKey);
      if (p.headers !== undefined) {
        const merged = resolveKeep(p.headers, isRecord(existingOptions) ? existingOptions.headers : undefined, `provider.${op.id}.headers`);
        setIn(f, [...base, "options", "headers"], merged);
      }
      if (p.whitelist !== undefined) setIn(f, [...base, "whitelist"], p.whitelist);
      if (p.blacklist !== undefined) setIn(f, [...base, "blacklist"], p.blacklist);
      if (p.env !== undefined) setIn(f, [...base, "env"], p.env);
      if (p.options) for (const [k, v] of Object.entries(p.options)) setIn(f, [...base, "options", k], v);
      if (!owner && Object.keys(p).length === 0) setIn(f, base, {});
      summary.push(`${owner ? "Update" : "Add"} provider ${op.id}`);
      return;
    }
    case "removeProvider": {
      const hits = findAll(files, ["provider", op.id]);
      if (!hits.length) {
        if (findAll(files, ["providers", op.id]).length) throw new OpError(`provider "${op.id}" uses v2 syntax: ${EDIT_ERR(op.id)}`, "read-only");
        throw new OpError(`provider "${op.id}" not found`, "not-found");
      }
      for (const h of hits) {
        assertEditable(h.file, `provider "${op.id}"`);
        setIn(h.file, ["provider", op.id], undefined);
      }
      for (const key of ["model", "small_model"] as const) {
        for (const l of docs(files)) {
          const v = l.doc[key];
          if (typeof v === "string" && v.startsWith(`${op.id}/`)) warnings.push(`\`${key}\` still points to "${v}", which no longer exists in the config.`);
        }
      }
      summary.push(`Remove provider ${op.id}`);
      return;
    }
    case "upsertModel": {
      const pbase: JsonPath = ["provider", op.providerId];
      const pOwner = findOwner(files, pbase);
      if (!pOwner) {
        if (findAll(files, ["providers", op.providerId]).length) throw new OpError(`provider "${op.providerId}" uses v2 syntax: ${EDIT_ERR(op.providerId)}`, "read-only");
        throw new OpError(`provider "${op.providerId}" not found; add the provider first`, "not-found");
      }
      const mbase: JsonPath = [...pbase, "models", op.modelId];
      const mOwner = findOwner(files, mbase);
      const f = mOwner?.file ?? pOwner.file;
      assertEditable(f, `model "${op.modelId}"`);
      if (!mOwner) setIn(f, mbase, {});
      for (const [k, v] of Object.entries(op.model)) if (v !== undefined) setIn(f, [...mbase, k], v);
      for (const k of op.unset ?? []) setIn(f, [...mbase, k], undefined);
      summary.push(`${mOwner ? "Update" : "Add"} model ${op.providerId}/${op.modelId}`);
      return;
    }
    case "removeModel": {
      const hits = findAll(files, ["provider", op.providerId, "models", op.modelId]);
      if (!hits.length) throw new OpError(`model "${op.providerId}/${op.modelId}" not found in the config`, "not-found");
      for (const h of hits) {
        assertEditable(h.file, `model "${op.modelId}"`);
        setIn(h.file, ["provider", op.providerId, "models", op.modelId], undefined);
      }
      const ref = `${op.providerId}/${op.modelId}`;
      for (const key of ["model", "small_model"] as const) {
        for (const l of docs(files)) if (l.doc[key] === ref) warnings.push(`\`${key}\` still points to "${ref}", which was removed.`);
      }
      summary.push(`Remove model ${ref}`);
      return;
    }
    case "setDefaultModel": {
      const key = op.target;
      if (op.value === null) {
        const hits = findAll(files, [key]);
        for (const h of hits) {
          assertEditable(h.file, key);
          setIn(h.file, [key], undefined);
        }
        summary.push(`Clear ${key}`);
        return;
      }
      const owner = findOwner(files, [key]);
      const f = owner?.file ?? primary(files, primaryId);
      assertEditable(f, key);
      setIn(f, [key], op.value);
      summary.push(`Set ${key} = ${op.value}`);
      return;
    }
    case "upsertMcp": {
      const base: JsonPath = ["mcp", op.name];
      if (op.name === "timeout" || op.name === "servers") throw new OpError(`"${op.name}" is reserved by OpenCode`);
      const owner = findOwner(files, base);
      if (!owner && findAll(files, ["mcp", "servers", op.name]).length) throw new OpError(`MCP "${op.name}" uses v2 syntax: ${EDIT_ERR(op.name)}`, "read-only");
      const f = owner?.file ?? primary(files, primaryId);
      assertEditable(f, `MCP "${op.name}"`);
      const existing = owner ? getAt(owner.doc, base) : undefined;
      const cfg: Record<string, unknown> = { ...(op.config as Record<string, unknown>) };
      const ex = isRecord(existing) ? existing : {};
      if (cfg.headers) cfg.headers = resolveKeep(cfg.headers as Record<string, string>, ex.headers, `mcp.${op.name}.headers`);
      if (cfg.environment) cfg.environment = resolveKeep(cfg.environment as Record<string, string>, ex.environment, `mcp.${op.name}.environment`);
      if (cfg.enabled === undefined && cfg.disabled === undefined) {
        if (ex.enabled !== undefined) cfg.enabled = ex.enabled;
        if (ex.disabled !== undefined) cfg.disabled = ex.disabled;
      }
      if (isRecord(cfg.oauth) && isRecord(ex.oauth) && cfg.oauth.clientSecret === KEEP) {
        if (typeof ex.oauth.clientSecret !== "string") throw new OpError(`mcp.${op.name}.oauth.clientSecret: no stored value to keep`);
        cfg.oauth = { ...cfg.oauth, clientSecret: ex.oauth.clientSecret };
      }
      const parsed = mcpConfigSchema.safeParse(cfg);
      if (!parsed.success) throw new OpError(`MCP "${op.name}": ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, "invalid");
      setIn(f, base, cfg);
      summary.push(`${owner ? "Update" : "Add"} MCP server ${op.name}`);
      return;
    }
    case "removeMcp": {
      const hits = findAll(files, ["mcp", op.name]);
      if (!hits.length) {
        if (findAll(files, ["mcp", "servers", op.name]).length) throw new OpError(`MCP "${op.name}" uses v2 syntax: ${EDIT_ERR(op.name)}`, "read-only");
        throw new OpError(`MCP server "${op.name}" not found`, "not-found");
      }
      for (const h of hits) {
        assertEditable(h.file, `MCP "${op.name}"`);
        setIn(h.file, ["mcp", op.name], undefined);
      }
      summary.push(`Remove MCP server ${op.name}`);
      return;
    }
    case "setMcpEnabled": {
      const base: JsonPath = ["mcp", op.name];
      const owner = findOwner(files, base);
      if (!owner) throw new OpError(`MCP server "${op.name}" not found (or uses v2 syntax)`, "not-found");
      assertEditable(owner.file, `MCP "${op.name}"`);
      setIn(owner.file, [...base, "enabled"], op.enabled);
      if (getAt(owner.doc, [...base, "disabled"]) !== undefined) setIn(owner.file, [...base, "disabled"], undefined);
      summary.push(`${op.enabled ? "Enable" : "Disable"} MCP server ${op.name}`);
      return;
    }
  }
}

function issueKey(i: ConfigIssue): string {
  return `${i.fileId ?? ""}|${i.path}|${i.message}`;
}

/**
 * Apply structured operations to in-memory copies of the config files. Nothing is written here.
 * Fails closed: syntax errors or newly introduced schema violations abort the whole batch.
 */
export function applyOps(inputFiles: WorkFile[], primaryId: string, ops: unknown[]): OpsResult {
  const parsedOps: Op[] = ops.map((o, i) => {
    const r = opSchema.safeParse(o);
    if (!r.success) throw new OpError(`operation #${i + 1}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`, "invalid");
    return r.data;
  });
  const files = new Map(inputFiles.map((f) => [f.spec.id, { ...f }]));
  const originals = new Map(inputFiles.map((f) => [f.spec.id, f.text]));
  for (const f of files.values()) {
    // A syntactically broken file can never be edited structurally; editing it would silently skip it.
    if (f.exists && parseJsonc(f.text).errors.length) f.writable = false;
  }
  const warnings: string[] = [];
  const summary: string[] = [];
  for (const op of parsedOps) applyOne(files, primaryId, op, warnings, summary);

  const changes: FileChange[] = [];
  const newIssues: ConfigIssue[] = [];
  for (const f of files.values()) {
    const before = originals.get(f.spec.id) ?? "";
    if (f.text === before) continue;
    const parsed = parseJsonc(f.text);
    if (!parsed.doc) throw new OpError(`internal: result for ${f.spec.path} is not valid JSON (${parsed.errors[0]?.message})`, "schema");
    const oldDoc = parseJsonc(before).doc ?? {};
    const old = new Set(validateAgainstOpenCodeSchema(oldDoc, f.spec.id).map(issueKey));
    for (const i of validateAgainstOpenCodeSchema(parsed.doc, f.spec.id)) if (!old.has(issueKey(i))) newIssues.push(i);
    changes.push({
      fileId: f.spec.id,
      path: f.spec.path,
      role: f.spec.role,
      before,
      after: f.text,
      beforeHash: f.hash,
      isNew: !f.exists,
      unifiedDiff: createPatch(f.spec.path.split(/[\\/]/).pop() ?? "config", before, f.text, "before", "after", { context: 3 }),
    });
  }
  if (newIssues.length) {
    throw new OpError(`Result would violate the OpenCode config schema: ${newIssues.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join("; ")}`, "schema");
  }
  return { changes, warnings, summary, newIssues };
}
