import { Confidence, Priority, createFinding, isKnown, valueOf } from "../domain.js";

export function textFor(session, key) {
  const value = valueOf(session.fields[key]);
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n");
  return value == null ? "" : String(value);
}

export function evidence(session, field, excerpt, type = "normalized-field") {
  return { sessionId: session.id, field, type, excerpt: String(excerpt).slice(0, 300) };
}

export function finding(session, ruleId, input) {
  return createFinding({
    id: `${ruleId}:${session.id}${input.suffix ? `:${input.suffix}` : ""}`,
    ruleId,
    relatedSessions: [session.id],
    confidence: Confidence.MEDIUM,
    severity: Priority.MEDIUM,
    ...input
  });
}

export function hasKnown(session, key) { return isKnown(session.fields[key]); }
export function list(session, key) { return valueOf(session.fields[key], []); }

export function tokenize(text) {
  return new Set(String(text).toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) ?? []);
}

export function overlapRatio(a, b) {
  const left = tokenize(a); const right = tokenize(b);
  if (!left.size || !right.size) return null;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / left.size;
}
