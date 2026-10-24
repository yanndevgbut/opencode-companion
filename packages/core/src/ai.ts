import { aiPlanSchema, type AiPlan } from "@occ/schemas";
import type { ConfigState } from "@occ/adapter";
import type { AiSettings } from "./home";
import { httpRequest } from "./net";
import { redactSecrets } from "./redact";

const SYSTEM_PROMPT = `You are OpenCode Companion Config Assistant.
Your task is to analyze user requests regarding OpenCode configuration and generate a structured JSON plan to modify the configuration safely.

You must respond ONLY with a single valid JSON object strictly matching this TypeScript type:
{
  "answer": string, // Explanation of what you are doing, explanations of errors, or advice.
  "operations": Array<Op> // List of allowed operations to apply to the configuration.
}

Allowed Operations:
1. { "op": "upsertProvider", "id": string, "provider": { "name"?: string, "npm"?: string, "baseURL"?: string, "apiKey"?: string, "headers"?: Record<string, string>, "whitelist"?: string[], "blacklist"?: string[], "options"?: Record<string, any> } }
2. { "op": "removeProvider", "id": string }
3. { "op": "upsertModel", "providerId": string, "modelId": string, "model": { "name"?: string, "modalities"?: { "input"?: string[], "output"?: string[] }, "limit"?: { "context": number, "output": number }, "reasoning"?: boolean, "tool_call"?: boolean, "attachment"?: boolean } }
4. { "op": "removeModel", "providerId": string, "modelId": string }
5. { "op": "setDefaultModel", "target": "model" | "small_model", "value": string | null } // value format: "provider/model"
6. { "op": "upsertMcp", "name": string, "config": { "type": "local", "command": string[], "cwd"?: string, "environment"?: Record<string, string>, "enabled"?: boolean } | { "type": "remote", "url": string, "headers"?: Record<string, string>, "enabled"?: boolean } }
7. { "op": "removeMcp", "name": string }
8. { "op": "setMcpEnabled", "name": string, "enabled": boolean }

Safety Rules:
- Return ONLY the JSON object. No Markdown code fences, no introductory or trailing text.
- If the user asks for arbitrary shell execution, refuse it and explain in "answer" with empty "operations".
- If the user asks for explanations or diagnostics suggestions, provide them in "answer" and set "operations": [].
- Never invent API keys or make up non-existent provider settings. Use references like {env:VAR} when appropriate.
`;

export class AiAssistantError extends Error {
  constructor(
    message: string,
    public readonly code: "not-configured" | "network" | "invalid-response" | "timeout" = "network",
  ) {
    super(message);
  }
}

export async function generateConfigPlan(input: {
  instruction: string;
  settings: AiSettings | null;
  state: ConfigState;
  recentActivity?: string[];
}): Promise<AiPlan> {
  if (!input.settings || !input.settings.baseURL || !input.settings.model) {
    throw new AiAssistantError(
      "AI Assistant is not configured. Please set AI Provider baseURL and model in Companion Settings.",
      "not-configured",
    );
  }

  // Redact state summary to ensure sensitive secrets are not sent to AI model
  const contextSummary = {
    providers: input.state.providers.map((p) => ({
      id: p.id,
      name: p.name,
      npm: p.npm,
      baseURL: p.baseURL,
      apiKeyConfigured: p.apiKey.state !== "none",
      modelCount: p.modelCount,
    })),
    models: input.state.models.map((m) => ({
      ref: `${m.providerId}/${m.modelId}`,
      name: m.name,
      isDefault: m.isDefault,
      isSmall: m.isSmall,
    })),
    mcp: input.state.mcp.map((s) => ({
      name: s.name,
      type: s.type,
      enabled: s.enabled,
      url: s.url,
      command: s.command,
    })),
    defaults: input.state.defaults,
    issues: input.state.issues,
  };

  const userPrompt = `Current OpenCode Config Context:
${JSON.stringify(contextSummary, null, 2)}

User Instruction:
${input.instruction}
`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const url = `${input.settings.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (input.settings.apiKey) {
    headers["authorization"] = `Bearer ${input.settings.apiKey}`;
  }

  const payload = JSON.stringify({
    model: input.settings.model,
    messages,
    temperature: input.settings.temperature ?? 0.2,
    response_format: { type: "json_object" },
  });

  const res = await httpRequest({
    url,
    method: "POST",
    headers,
    body: payload,
    timeoutMs: 40_000,
    secrets: input.settings.apiKey ? [input.settings.apiKey] : [],
  });

  if (res.kind === "timeout") {
    throw new AiAssistantError("AI provider request timed out (40s limit).", "timeout");
  }
  if (res.kind === "network") {
    throw new AiAssistantError(`Failed to reach AI provider: ${res.message}`, "network");
  }

  if (res.status < 200 || res.status >= 300) {
    let msg = `AI Provider returned HTTP ${res.status}`;
    try {
      const errJson = JSON.parse(res.text) as { error?: { message?: string } };
      if (errJson.error?.message) {
        msg += `: ${errJson.error.message}`;
      }
    } catch {
      /* ignore */
    }
    throw new AiAssistantError(redactSecrets(msg), "network");
  }

  let content = "";
  try {
    const data = JSON.parse(res.text) as { choices?: Array<{ message?: { content?: string } }> };
    content = data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    throw new AiAssistantError("AI response was not valid JSON.", "invalid-response");
  }

  if (!content) {
    throw new AiAssistantError("AI response content was empty.", "invalid-response");
  }

  // Clean code fences if any leaked
  if (content.startsWith("```")) {
    content = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(content);
  } catch (e) {
    throw new AiAssistantError(`Failed to parse AI output as JSON: ${(e as Error).message}`, "invalid-response");
  }

  const validated = aiPlanSchema.safeParse(parsedRaw);
  if (!validated.success) {
    throw new AiAssistantError(
      `AI returned invalid plan schema: ${validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      "invalid-response",
    );
  }

  return validated.data;
}
