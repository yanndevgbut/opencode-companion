import type {
  ConfigIssue,
  Dialect,
  McpView,
  ModelView,
  ProviderView,
  SecretState,
  SourceRef,
} from "@occ/schemas";
import { RESERVED_MCP_KEYS, mcpConfigSchema, validateAgainstOpenCodeSchema } from "@occ/schemas";
import { getAt, isRecord, maskLiteral } from "./jsonc";
import type { LoadedFile } from "./store";

const REF_RE = /^\s*\{(env|file):[^}]+\}\s*$/;

export function secretState(value: unknown): SecretState {
  if (typeof value !== "string" || value === "") return { state: "none" };
  const ref = REF_RE.exec(value);
  if (ref) return { state: ref[1] === "env" ? "env" : "file", display: value.trim() };
  return { state: "literal", display: maskLiteral(value) };
}

/** Remove credentials from a URL string for display (userinfo and secret-looking query values). */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
    }
    for (const k of [...u.searchParams.keys()]) {
      if (/key|token|secret|auth|password|sig/i.test(k)) u.searchParams.set(k, "***");
    }
    return u.toString().replace(/%2A%2A%2A/g, "***");
  } catch {
    return raw.replace(/\/\/[^/@\s]+@/, "//***@").replace(/([?&](?:api[-_]?key|key|token|secret)=)[^&\s]+/gi, "$1***");
  }
}

export interface ConfigState {
  providers: ProviderView[];
  models: ModelView[];
  mcp: McpView[];
  mcpSettings: { timeout?: unknown } | null;
  defaults: { model: string | null; smallModel: string | null; modelSourceFileId: string | null };
  issues: ConfigIssue[];
  hasAnyConfig: boolean;
}

const asStrArr = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined);

function modelRefToString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (isRecord(v) && typeof v.providerID === "string" && typeof v.model === "string") return `${v.providerID}/${v.model}`;
  return null;
}

interface ProviderAcc {
  id: string;
  view: ProviderView;
  models: Map<string, { raw: Record<string, unknown>; source: SourceRef; editable: boolean }>;
}

/** Build UI-facing state from every loaded config file. Later files override earlier ones, as OpenCode does. */
export function buildState(files: LoadedFile[]): ConfigState {
  const issues: ConfigIssue[] = [];
  const providers = new Map<string, ProviderAcc>();
  const mcp = new Map<string, McpView>();
  let mcpSettings: ConfigState["mcpSettings"] = null;
  let model: string | null = null;
  let smallModel: string | null = null;
  let modelSourceFileId: string | null = null;
  let hasAnyConfig = false;

  for (const f of files) {
    if (!f.read.exists) continue;
    hasAnyConfig = true;
    if (!f.read.readable) {
      issues.push({ level: "error", path: "(file)", message: `Cannot read file: ${f.read.error ?? "unknown error"}`, fileId: f.spec.id });
      continue;
    }
    if (f.parse.errors.length || !f.parse.doc) {
      for (const e of f.parse.errors.slice(0, 5)) {
        issues.push({ level: "error", path: `line ${e.line}:${e.column}`, message: `JSON syntax: ${e.message}`, fileId: f.spec.id });
      }
      continue;
    }
    const doc = f.parse.doc;
    const editable = f.writable;
    const src = (_path: string): SourceRef => ({ fileId: f.spec.id, path: f.spec.path, role: f.spec.role });
    void src;

    for (const i of validateAgainstOpenCodeSchema(doc, f.spec.id)) issues.push(i);

    if (doc.model !== undefined) {
      const m = modelRefToString(doc.model);
      if (m) {
        model = m;
        modelSourceFileId = f.spec.id;
      }
    }
    if (doc.small_model !== undefined) {
      const m = modelRefToString(doc.small_model);
      if (m) smallModel = m;
    }

    const addProvider = (id: string, raw: unknown, dialect: Dialect): void => {
      if (!isRecord(raw)) {
        issues.push({ level: "error", path: `provider.${id}`, message: "provider must be an object", fileId: f.spec.id });
        return;
      }
      const settings = dialect === "legacy" ? (isRecord(raw.options) ? raw.options : {}) : isRecord(raw.settings) ? raw.settings : {};
      const headers = dialect === "legacy" ? (isRecord(settings.headers) ? settings.headers : {}) : isRecord(raw.headers) ? raw.headers : {};
      const source: SourceRef = { fileId: f.spec.id, path: f.spec.path, role: f.spec.role };
      const prev = providers.get(id);
      const view: ProviderView = {
        id,
        name: typeof raw.name === "string" ? raw.name : prev?.view.name,
        npm: dialect === "legacy" ? (typeof raw.npm === "string" ? raw.npm : prev?.view.npm) : typeof raw.package === "string" ? raw.package.replace(/^aisdk:/, "") : prev?.view.npm,
        baseURL: typeof settings.baseURL === "string" ? redactUrl(settings.baseURL) : prev?.view.baseURL,
        apiKey: settings.apiKey !== undefined ? secretState(settings.apiKey) : (prev?.view.apiKey ?? { state: "none" }),
        headerNames: [...new Set([...(prev?.view.headerNames ?? []), ...Object.keys(headers)])],
        modelCount: 0,
        source,
        dialect,
        editable: dialect === "legacy" && editable,
      };
      const acc: ProviderAcc = prev ?? { id, view, models: new Map() };
      acc.view = view;
      const models = isRecord(raw.models) ? raw.models : {};
      for (const [mid, mraw] of Object.entries(models)) {
        if (!isRecord(mraw)) {
          issues.push({ level: "error", path: `provider.${id}.models.${mid}`, message: "model must be an object", fileId: f.spec.id });
          continue;
        }
        acc.models.set(mid, { raw: mraw, source, editable: dialect === "legacy" && editable });
      }
      providers.set(id, acc);
    };

    if (isRecord(doc.provider)) for (const [id, raw] of Object.entries(doc.provider)) addProvider(id, raw, "legacy");
    if (isRecord(doc.providers)) for (const [id, raw] of Object.entries(doc.providers)) addProvider(id, raw, "v2");

    if (isRecord(doc.mcp)) {
      const flat = doc.mcp;
      const addMcp = (name: string, raw: unknown, dialect: Dialect): void => {
        const source: SourceRef = { fileId: f.spec.id, path: f.spec.path, role: f.spec.role };
        if (!isRecord(raw)) {
          issues.push({ level: "error", path: `mcp.${name}`, message: "MCP entry must be an object", fileId: f.spec.id });
          return;
        }
        const prev = mcp.get(name);
        const type = raw.type === "local" || raw.type === "remote" ? raw.type : "unknown";
        const enabled = raw.enabled === false || raw.disabled === true ? false : raw.enabled === true || type !== "unknown" || prev?.enabled !== false;
        const itemIssues: string[] = [];
        if (type !== "unknown") {
          const parsed = mcpConfigSchema.safeParse(raw);
          if (!parsed.success) for (const i of parsed.error.issues.slice(0, 4)) itemIssues.push(`${i.path.join(".") || "(entry)"}: ${i.message}`);
        }
        if (type === "unknown" && !prev) itemIssues.push("entry has no `type` (expected \"local\" or \"remote\")");
        if (raw.enabled === true && raw.disabled === true) itemIssues.push("both `enabled: true` and `disabled: true` are set");
        const base = type === "unknown" && prev ? prev : undefined;
        const view: McpView = {
          name,
          type: base?.type ?? type,
          enabled,
          command: base?.command ?? asStrArr(raw.command),
          cwd: base?.cwd ?? (typeof raw.cwd === "string" ? raw.cwd : undefined),
          url: base?.url ?? (typeof raw.url === "string" ? redactUrl(raw.url) : undefined),
          headerNames: base?.headerNames ?? (isRecord(raw.headers) ? Object.keys(raw.headers) : []),
          envNames: base?.envNames ?? (isRecord(raw.environment) ? Object.keys(raw.environment) : []),
          oauth: raw.oauth === false ? "disabled" : isRecord(raw.oauth) ? "configured" : type === "remote" ? "auto" : undefined,
          source: base ? base.source : source,
          dialect,
          editable: dialect === "legacy" && editable,
          issues: itemIssues,
        };
        mcp.set(name, view);
      };
      for (const [name, raw] of Object.entries(flat)) {
        if (RESERVED_MCP_KEYS.has(name)) continue;
        addMcp(name, raw, "legacy");
      }
      if (isRecord(flat.servers)) for (const [name, raw] of Object.entries(flat.servers)) addMcp(name, raw, "v2");
      if (flat.timeout !== undefined) mcpSettings = { timeout: flat.timeout };
    }
  }

  const models: ModelView[] = [];
  const providerViews: ProviderView[] = [];
  for (const acc of providers.values()) {
    acc.view.modelCount = acc.models.size;
    providerViews.push(acc.view);
    for (const [mid, m] of acc.models) {
      const raw = m.raw;
      const ref = `${acc.id}/${mid}`;
      const caps = isRecord(raw.capabilities) ? raw.capabilities : undefined;
      const modalities = isRecord(raw.modalities) ? raw.modalities : isRecord(caps) ? { input: caps.input, output: caps.output } : undefined;
      const limit = isRecord(raw.limit) ? raw.limit : undefined;
      models.push({
        providerId: acc.id,
        modelId: mid,
        name: typeof raw.name === "string" ? raw.name : undefined,
        modalities: modalities
          ? { input: asStrArr(modalities.input), output: asStrArr(modalities.output) }
          : undefined,
        limit: limit
          ? {
              context: typeof limit.context === "number" ? limit.context : undefined,
              output: typeof limit.output === "number" ? limit.output : undefined,
              input: typeof limit.input === "number" ? limit.input : undefined,
            }
          : undefined,
        reasoning: typeof raw.reasoning === "boolean" ? raw.reasoning : undefined,
        toolCall: typeof raw.tool_call === "boolean" ? raw.tool_call : typeof caps?.tools === "boolean" ? caps.tools : undefined,
        attachment: typeof raw.attachment === "boolean" ? raw.attachment : undefined,
        status: typeof raw.status === "string" ? raw.status : undefined,
        isDefault: model === ref,
        isSmall: smallModel === ref,
        source: m.source,
        editable: m.editable,
        availability: "unverified",
        raw: stripSecrets(raw),
      });
    }
  }

  for (const [which, ref] of [["model", model], ["small_model", smallModel]] as const) {
    if (!ref) continue;
    const slash = ref.indexOf("/");
    const pid = slash > 0 ? ref.slice(0, slash) : "";
    const mid = ref.slice(slash + 1).split("#")[0] ?? "";
    const pv = providers.get(pid);
    if (pv && !pv.models.has(mid)) {
      issues.push({ level: "info", path: which, message: `"${ref}" is not listed under provider "${pid}" in the config (it may come from the OpenCode catalog).` });
    }
  }

  return {
    providers: providerViews,
    models,
    mcp: [...mcp.values()],
    mcpSettings,
    defaults: { model, smallModel, modelSourceFileId },
    issues,
    hasAnyConfig,
  };
}

/** Model raw metadata is shown in the UI; drop anything that looks like a credential. */
function stripSecrets(raw: Record<string, unknown>): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  const walk = (o: unknown, key = ""): unknown => {
    if (Array.isArray(o)) return o.map((x) => walk(x, key));
    if (isRecord(o)) {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(o)) r[k] = walk(v, k);
      return r;
    }
    if (typeof o === "string" && /key|token|secret|authorization|password/i.test(key) && !REF_RE.test(o)) return "••••";
    return o;
  };
  return walk(out) as Record<string, unknown>;
}

export { getAt };
