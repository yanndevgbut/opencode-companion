const PATTERNS: RegExp[] = [
  /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
  /(["']?(?:api[-_]?key|token|secret|password|authorization)["']?\s*[:=]\s*)(["'])[^"'\n]{6,}\2/gi,
  /\/\/[^/@\s:]+:[^/@\s]+@/g,
  /([?&](?:api[-_]?key|key|token|access_token|secret)=)[^&\s"']+/gi,
];

/** Remove known secret values and common secret shapes from any text before it is logged or returned. */
export function redactSecrets(text: string, knownValues: readonly string[] = []): string {
  let out = text;
  for (const v of knownValues) {
    if (v.length >= 4) out = out.split(v).join("***");
  }
  for (const re of PATTERNS) {
    out = out.replace(re, (m, p1: unknown, p2: unknown) => {
      if (typeof p1 === "string" && p1 && typeof p2 === "string") return `${p1}${p2}***${p2}`;
      if (typeof p1 === "string" && p1) return `${p1}***`;
      if (m.startsWith("//")) return "//***@";
      return "***";
    });
  }
  return out;
}
