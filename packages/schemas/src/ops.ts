import { z } from "zod";
import { MCP_NAME_RE, PROVIDER_ID_RE, mcpConfigSchema, modelConfigSchema, providerPatchSchema } from "./config";

const providerId = z.string().regex(PROVIDER_ID_RE, "invalid provider id (letters, digits, . _ : - only; no '/')");
const modelId = z.string().min(1).max(200).refine((v) => !v.includes("\n"), "invalid model id");
const mcpName = z.string().regex(MCP_NAME_RE, "invalid MCP server name");
const modelRef = z.string().regex(/^[^/#]+\/[^#]+(?:#[^#]+)?$/, "expected provider/model");

/** Structured, allowlisted configuration operations. Used by the UI forms and the AI assistant alike. */
export const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("upsertProvider"), id: providerId, provider: providerPatchSchema }).strict(),
  z.object({ op: z.literal("removeProvider"), id: providerId }).strict(),
  z.object({ op: z.literal("upsertModel"), providerId, modelId, model: modelConfigSchema, unset: z.array(z.string().min(1)).max(40).optional() }).strict(),
  z.object({ op: z.literal("removeModel"), providerId, modelId }).strict(),
  z.object({ op: z.literal("setDefaultModel"), target: z.enum(["model", "small_model"]), value: modelRef.nullable() }).strict(),
  z.object({ op: z.literal("upsertMcp"), name: mcpName, config: mcpConfigSchema }).strict(),
  z.object({ op: z.literal("removeMcp"), name: mcpName }).strict(),
  z.object({ op: z.literal("setMcpEnabled"), name: mcpName, enabled: z.boolean() }).strict(),
]);
export type Op = z.infer<typeof opSchema>;
export const opsSchema = z.array(opSchema).min(1).max(50);

/** What an AI plan must look like. */
export const aiPlanSchema = z
  .object({
    answer: z.string().max(8000).default(""),
    operations: z.array(opSchema).max(25).default([]),
  })
  .strict();
export type AiPlan = z.infer<typeof aiPlanSchema>;
