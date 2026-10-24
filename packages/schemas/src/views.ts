export type Dialect = "legacy" | "v2";
export type Level = "error" | "warning" | "info";

export interface ConfigIssue {
  level: Level;
  path: string;
  message: string;
  fileId?: string;
}

export interface SecretState {
  state: "none" | "literal" | "env" | "file";
  /** e.g. `••••a1b2` for literals, or the `{env:X}` reference itself. Never the real value. */
  display?: string;
}

export interface SourceRef {
  fileId: string;
  path: string;
  role: string;
}

export interface ModelView {
  providerId: string;
  modelId: string;
  name?: string;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number; input?: number };
  reasoning?: boolean;
  toolCall?: boolean;
  attachment?: boolean;
  status?: string;
  isDefault: boolean;
  isSmall: boolean;
  source: SourceRef;
  editable: boolean;
  /** Whether the provider's own listing confirmed this model (from a real connectivity test). */
  availability: "unverified" | "detected" | "not-listed";
  raw: Record<string, unknown>;
}

export interface ProviderView {
  id: string;
  name?: string;
  npm?: string;
  baseURL?: string;
  apiKey: SecretState;
  headerNames: string[];
  modelCount: number;
  source: SourceRef;
  dialect: Dialect;
  editable: boolean;
  lastTest?: ProviderTestResult;
}

export interface McpView {
  name: string;
  type: "local" | "remote" | "unknown";
  enabled: boolean;
  command?: string[];
  cwd?: string;
  url?: string;
  headerNames: string[];
  envNames: string[];
  oauth?: "disabled" | "configured" | "auto";
  source: SourceRef;
  dialect: Dialect;
  editable: boolean;
  issues: string[];
  lastTest?: McpTestResult;
}

export interface ProviderTestResult {
  at: string;
  ok: boolean;
  kind: "ok" | "unauthorized" | "not-found" | "unsupported" | "network" | "timeout" | "blocked" | "skipped";
  httpStatus?: number;
  latencyMs?: number;
  host: string;
  credentialsSent: boolean;
  message: string;
  modelIds?: string[];
}

export interface McpTestResult {
  at: string;
  ok: boolean;
  kind: "ok" | "oauth-required" | "unsupported" | "network" | "timeout" | "protocol" | "spawn-failed" | "skipped";
  message: string;
  hint?: string;
  serverName?: string;
  serverVersion?: string;
  tools?: { name: string; description?: string }[];
  latencyMs?: number;
}

export interface FileView {
  id: string;
  path: string;
  role: "primary" | "global" | "custom" | "project" | "managed";
  exists: boolean;
  readable: boolean;
  writable: boolean;
  size: number;
  mtimeMs: number;
  hash: string | null;
  parseOk: boolean;
  parseError?: string;
}

export type CheckStatus = "PASS" | "WARNING" | "ERROR";
export interface DiagnosticCheck {
  id: string;
  group: string;
  title: string;
  status: CheckStatus;
  detail: string;
  cause?: string;
  fix?: string;
}
export interface DiagnosticsReport {
  at: string;
  connectivityRun: boolean;
  summary: Record<CheckStatus, number>;
  checks: DiagnosticCheck[];
}

export interface BackupMeta {
  id: string;
  name: string;
  createdAt: string;
  reason: "manual" | "auto-before-change" | "auto-before-restore" | "import";
  sourcePath: string;
  fileName: string;
  sha256: string;
  size: number;
  appVersion: string;
}

export interface ActivityEvent {
  ts: string;
  type: string;
  summary: string;
}
