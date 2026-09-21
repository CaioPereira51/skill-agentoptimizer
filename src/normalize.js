import { known, unknown, unavailable, Availability } from "./domain.js";

const OBSERVABLE_FIELDS = [
  "tool", "session", "task", "prompts", "context", "commands", "filesRead",
  "filesChanged", "testsExecuted", "result", "timestamp", "interactions", "model",
  "cost", "specArtifacts", "validation", "operations"
];

const ARRAYS = new Set(["prompts", "context", "commands", "filesRead", "filesChanged", "testsExecuted", "interactions", "specArtifacts", "validation", "operations"]);

function cleanArray(value) {
  if (!Array.isArray(value)) return value == null ? [] : [value];
  return value.filter((item) => item != null);
}

function fieldFrom(raw, key, limitations) {
  const explicit = raw.observability?.[key];
  if (explicit === Availability.UNAVAILABLE) return unavailable(limitations?.[key]);
  if (explicit === Availability.UNKNOWN) return unknown(limitations?.[key]);
  if (!Object.prototype.hasOwnProperty.call(raw, key) || raw[key] == null) return unknown(limitations?.[key]);
  const value = ARRAYS.has(key) ? cleanArray(raw[key]) : raw[key];
  return known(value);
}

export function normalizeSession(raw, metadata = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("Session must be an object");
  const fields = Object.fromEntries(OBSERVABLE_FIELDS.map((key) => [key, fieldFrom(raw, key, metadata.limitations)]));
  const id = raw.id ?? raw.sessionId ?? fields.session.value ?? `session-${metadata.index ?? 0}`;
  return {
    id: String(id),
    source: metadata.source ?? raw.source ?? "imported",
    sourceFormat: metadata.format ?? raw.sourceFormat ?? "generic",
    fields,
    rawEvidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    normalizationWarnings: metadata.warnings ?? []
  };
}

export function normalizeMany(records, metadata = {}) {
  if (!Array.isArray(records)) throw new TypeError("Expected an array of sessions");
  return records.map((record, index) => normalizeSession(record, { ...metadata, index }));
}

export function semanticSession(session) {
  return Object.fromEntries(Object.entries(session.fields).map(([key, field]) => [key, field.status === Availability.KNOWN ? field.value : undefined]));
}

export { OBSERVABLE_FIELDS };
