import Ajv2020 from "ajv/dist/2020.js";
import schema from "./opencode-config.schema.json" with { type: "json" };
import type { ConfigIssue } from "./views";

type ValidateFn = ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string; keyword: string; params: Record<string, unknown> }[] | null };
let compiled: ValidateFn | undefined;

function getValidator(): ValidateFn {
  if (!compiled) {
    const Ctor = (Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020;
    const ajv = new Ctor({ allErrors: true, strict: false, validateFormats: false });
    ajv.addSchema({
      $id: "https://models.dev/model-schema.json",
      $defs: {
        Model: {
          type: "object",
          additionalProperties: true,
        },
      },
    });
    compiled = ajv.compile(schema) as unknown as ValidateFn;
  }
  return compiled;
}

export const bundledSchema = schema;

const toPath = (p: string): string => (p ? p.replace(/^\//, "").replace(/\//g, ".") : "(root)");

/**
 * Validate a parsed OpenCode config against the official JSON Schema snapshot bundled with Companion.
 * `anyOf` noise is collapsed so users see one actionable message per location.
 */
export function validateAgainstOpenCodeSchema(doc: unknown, fileId?: string): ConfigIssue[] {
  const validate = getValidator();
  if (validate(doc)) return [];
  const seen = new Map<string, ConfigIssue>();
  for (const e of validate.errors ?? []) {
    if (e.keyword === "anyOf" || e.keyword === "oneOf") continue;
    let message = e.message ?? "invalid value";
    if (e.keyword === "additionalProperties") message = `unknown property "${String(e.params.additionalProperty)}"`;
    if (e.keyword === "enum") message = `must be one of ${JSON.stringify(e.params.allowedValues)}`;
    const path = toPath(e.instancePath) + (e.keyword === "additionalProperties" ? `.${String(e.params.additionalProperty)}` : "");
    const key = `${path}|${message}`;
    if (!seen.has(key)) seen.set(key, { level: "warning", path, message, fileId });
  }
  const out = [...seen.values()];
  // Alternatives of a union produce many unrelated errors; keep the list readable.
  return out.slice(0, 60);
}
