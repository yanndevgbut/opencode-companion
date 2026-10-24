import { createHmac } from "node:crypto";
import {
  applyEdits,
  findNodeAtLocation,
  getNodePath,
  modify,
  parse,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";
import { secretKeyRe } from "@occ/schemas";

export type JsonPath = (string | number)[];

export interface ParsedConfig {
  doc: Record<string, unknown> | null;
  errors: { message: string; line: number; column: number; offset: number }[];
  empty: boolean;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseJsonc(text: string): ParsedConfig {
  const src = stripBom(text);
  if (src.trim() === "") return { doc: {}, errors: [], empty: true };
  const errs: ParseError[] = [];
  const value = parse(src, errs, { allowTrailingComma: true, disallowComments: false });
  const lines = src.split(/\r?\n/);
  const errors = errs.map((e) => {
    let remaining = e.offset;
    let line = 0;
    for (; line < lines.length; line++) {
      const len = (lines[line]?.length ?? 0) + 1;
      if (remaining < len) break;
      remaining -= len;
    }
    return { message: printParseErrorCode(e.error), line: line + 1, column: remaining + 1, offset: e.offset };
  });
  if (errors.length === 0 && (value === null || typeof value !== "object" || Array.isArray(value))) {
    return { doc: null, errors: [{ message: "Top-level value must be a JSON object", line: 1, column: 1, offset: 0 }], empty: false };
  }
  return { doc: errors.length ? null : (value as Record<string, unknown>), errors, empty: false };
}

export function detectFormatting(text: string): { insertSpaces: boolean; tabSize: number; eol: string } {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const m = /^([ \t]+)["}\]]/m.exec(text);
  if (m?.[1]?.startsWith("\t")) return { insertSpaces: false, tabSize: 1, eol };
  const size = m?.[1]?.length ?? 2;
  return { insertSpaces: true, tabSize: size >= 1 && size <= 8 ? size : 2, eol };
}

/** Set (or delete when value === undefined) a path, preserving comments and formatting. */
export function setPath(text: string, path: JsonPath, value: unknown): string {
  const base = text.trim() === "" ? "{}\n" : text;
  const edits = modify(base, path, value, { formattingOptions: detectFormatting(base) });
  return applyEdits(base, edits);
}

export function getAt(doc: unknown, path: JsonPath): unknown {
  let cur: unknown = doc;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}

export const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

// ---------- secret detection & redaction ----------

const REF_ONLY_RE = /^\s*\{(env|file):[^}]+\}\s*$/;
const URL_CRED_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i;
const URL_QUERY_SECRET_RE = /[?&](api[-_]?key|key|token|access_token|secret|auth|password|sig|signature)=[^&\s]+/i;
export const PLACEHOLDER_RE = /^\{secret:([0-9a-f]{8})\}$/;

export function isSecretValue(path: JsonPath, value: string): boolean {
  if (value === "" || REF_ONLY_RE.test(value)) return false;
  const last = path[path.length - 1];
  if (typeof last === "string" && secretKeyRe.test(last)) return true;
  return URL_CRED_RE.test(value) || URL_QUERY_SECRET_RE.test(value);
}

export interface SecretSite {
  path: JsonPath;
  value: string;
  node: Node;
}

export function findSecretSites(text: string): SecretSite[] {
  const root = parseTree(stripBom(text), [], { allowTrailingComma: true });
  const out: SecretSite[] = [];
  const walk = (n: Node | undefined): void => {
    if (!n) return;
    if (n.type === "string" && typeof n.value === "string") {
      const path = getNodePath(n);
      if (isSecretValue(path, n.value)) out.push({ path, value: n.value, node: n });
    }
    n.children?.forEach((c) => {
      if (n.type === "property" && c === n.children?.[0]) return; // property key
      walk(c);
    });
  };
  walk(root);
  return out;
}

export function tagFor(key: Buffer | string, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex").slice(0, 8);
}

/** Replace every secret string value by `{secret:<hmac8>}` so diffs show *that* a secret changed, never its value. */
export function redactText(text: string, key: Buffer | string): string {
  const src = stripBom(text);
  const sites = findSecretSites(src).sort((a, b) => b.node.offset - a.node.offset);
  let out = src;
  for (const s of sites) {
    out = out.slice(0, s.node.offset) + JSON.stringify(`{secret:${tagFor(key, s.value)}}`) + out.slice(s.node.offset + s.node.length);
  }
  return out;
}

export function collectSecretValues(text: string): string[] {
  return [...new Set(findSecretSites(text).map((s) => s.value))];
}

export class PlaceholderError extends Error {}

/**
 * Inverse of redactText: placeholders at a given path are replaced by the original value found at that
 * same path in `original`, but only when the tag matches. Anything else is rejected, never guessed.
 */
export function restoreText(submitted: string, original: string, key: Buffer | string): string {
  const src = stripBom(submitted);
  const root = parseTree(src, [], { allowTrailingComma: true });
  if (!root) return src;
  const origRoot = parseTree(stripBom(original), [], { allowTrailingComma: true });
  const hits: { node: Node; path: JsonPath }[] = [];
  const walk = (n: Node): void => {
    if (n.type === "string" && typeof n.value === "string" && PLACEHOLDER_RE.test(n.value)) hits.push({ node: n, path: getNodePath(n) });
    n.children?.forEach((c) => {
      if (n.type === "property" && c === n.children?.[0]) return;
      walk(c);
    });
  };
  walk(root);
  hits.sort((a, b) => b.node.offset - a.node.offset);
  let out = src;
  for (const h of hits) {
    const tag = PLACEHOLDER_RE.exec(h.node.value as string)?.[1];
    const origNode = origRoot ? findNodeAtLocation(origRoot, h.path) : undefined;
    const origValue = origNode?.type === "string" ? (origNode.value as string) : undefined;
    const where = h.path.join(".");
    if (origValue === undefined) {
      throw new PlaceholderError(`Placeholder at "${where}" has no stored value to restore. Type the real value or an {env:VAR} reference.`);
    }
    if (tagFor(key, origValue) !== tag) {
      throw new PlaceholderError(`Placeholder at "${where}" does not match the stored secret (reload the editor).`);
    }
    out = out.slice(0, h.node.offset) + JSON.stringify(origValue) + out.slice(h.node.offset + h.node.length);
  }
  return out;
}

/** Masked display for UI lists: never more than 4 trailing characters of a literal. */
export function maskLiteral(value: string): string {
  return value.length >= 12 ? `••••${value.slice(-4)}` : "••••";
}
