import { z } from "zod";

/** Keys inside the legacy flat `mcp` object that are settings, not servers. */
export const RESERVED_MCP_KEYS = new Set(["timeout", "servers"]);

export const PROVIDER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
export const MCP_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const isHttpUrl = (v: string): boolean => {
  if (v.includes("{env:") || v.includes("{file:")) return true; // substituted by OpenCode at load time
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export const httpUrlSchema = z.string().min(1).refine(isHttpUrl, "must be an http(s) URL");

const mcpTimeout = z.union([
  z.number().int().positive(),
  z
    .object({
      startup: z.number().int().positive().optional(),
      catalog: z.number().int().positive().optional(),
      execution: z.number().int().positive().optional(),
    })
    .strict(),
]);

const stringMap = z.record(z.string(), z.string());

export const mcpLocalSchema = z
  .object({
    type: z.literal("local"),
    command: z.array(z.string().min(1)).min(1, "command needs at least one entry"),
    cwd: z.string().optional(),
    environment: stringMap.optional(),
    enabled: z.boolean().optional(),
    disabled: z.boolean().optional(),
    codemode: z.boolean().optional(),
    protocol: z.enum(["legacy", "auto", "2026-07-28"]).optional(),
    timeout: mcpTimeout.optional(),
  })
  .strict();

export const mcpRemoteSchema = z
  .object({
    type: z.literal("remote"),
    url: httpUrlSchema,
    headers: stringMap.optional(),
    oauth: z
      .union([
        z.literal(false),
        z
          .object({
            clientId: z.string().optional(),
            clientSecret: z.string().optional(),
            scope: z.string().optional(),
            callbackPort: z.number().int().min(1).max(65535).optional(),
            redirectUri: z.string().optional(),
          })
          .strict(),
      ])
      .optional(),
    enabled: z.boolean().optional(),
    disabled: z.boolean().optional(),
    codemode: z.boolean().optional(),
    protocol: z.enum(["legacy", "auto", "2026-07-28"]).optional(),
    timeout: mcpTimeout.optional(),
  })
  .strict();

export const mcpConfigSchema = z.discriminatedUnion("type", [mcpLocalSchema, mcpRemoteSchema]);
export type McpConfig = z.infer<typeof mcpConfigSchema>;

export const modalitySchema = z.enum(["text", "audio", "image", "video", "pdf"]);

/** Legacy `provider.<id>.models.<modelId>` entry (documented format). Unknown keys are preserved on write. */
export const modelConfigSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    family: z.string().optional(),
    release_date: z.string().optional(),
    attachment: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    temperature: z.boolean().optional(),
    tool_call: z.boolean().optional(),
    cost: z
      .object({ input: z.number(), output: z.number(), cache_read: z.number().optional(), cache_write: z.number().optional() })
      .passthrough()
      .optional(),
    limit: z.object({ context: z.number().int().positive(), output: z.number().int().positive(), input: z.number().int().positive().optional() }).strict().optional(),
    modalities: z.object({ input: z.array(modalitySchema).optional(), output: z.array(modalitySchema).optional() }).strict().optional(),
    status: z.enum(["alpha", "beta", "deprecated", "active"]).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    headers: stringMap.optional(),
  })
  .passthrough();
export type ModelConfig = z.infer<typeof modelConfigSchema>;

export const providerPatchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    npm: z.string().min(1).max(200).optional(),
    baseURL: httpUrlSchema.optional(),
    /** Literal key or an `{env:VAR}` / `{file:path}` reference. Omit to keep the stored value. */
    apiKey: z.string().min(1).max(4096).optional(),
    headers: stringMap.optional(),
    whitelist: z.array(z.string()).optional(),
    blacklist: z.array(z.string()).optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    env: z.array(z.string()).optional(),
  })
  .strict();
export type ProviderPatch = z.infer<typeof providerPatchSchema>;

export const secretKeyRe = /(api[-_]?key|token|secret|password|passwd|authorization|credential|cookie|bearer)/i;
export const referenceRe = /\{(env|file):[^}]+\}/;
