import { Availability } from "./domain.js";
import { normalizeSession, OBSERVABLE_FIELDS } from "./normalize.js";

export const INTERCHANGE_SCHEMA = "agentoptimizer.interchange/v1";

function parseDocument(input) {
  const document = typeof input === "string" ? JSON.parse(input) : input;
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new TypeError("Interchange document must be an object");
  if (document.schema !== INTERCHANGE_SCHEMA) throw new Error(`Unsupported interchange schema: ${document.schema ?? "missing"}`);
  if (!Array.isArray(document.sessions)) throw new TypeError("Interchange document requires a sessions array");
  return document;
}

function convertSession(record, index, documentSource) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError(`Interchange session ${index + 1} must be an object`);
  const raw = { id: record.id, evidence: Array.isArray(record.evidence) ? [...record.evidence] : [] };
  const observability = {};
  const limitations = {};
  const fields = record.fields ?? {};
  for (const key of OBSERVABLE_FIELDS) {
    const descriptor = fields[key];
    if (descriptor == null) continue;
    if (descriptor.status === Availability.KNOWN) raw[key] = descriptor.value;
    else if ([Availability.UNKNOWN, Availability.UNAVAILABLE].includes(descriptor.status)) {
      observability[key] = descriptor.status;
      if (descriptor.reason) limitations[key] = descriptor.reason;
    } else {
      raw[key] = descriptor;
    }
    if (descriptor?.provenance) raw.evidence.push({ type: "field-provenance", field: key, ...descriptor.provenance });
  }
  raw.observability = observability;
  return normalizeSession(raw, {
    source: record.source?.adapter ?? record.source ?? documentSource ?? "interchange",
    format: INTERCHANGE_SCHEMA,
    limitations,
    index
  });
}

export function importInterchange(input) {
  const document = parseDocument(input);
  return document.sessions.map((record, index) => convertSession(record, index, document.source));
}

export function createInterchange(sessions, source = "agentoptimizer") {
  return {
    schema: INTERCHANGE_SCHEMA,
    source,
    sessions: sessions.map((session) => ({
      id: session.id,
      source: { adapter: session.source, format: session.sourceFormat },
      fields: session.fields,
      evidence: session.rawEvidence,
      warnings: session.normalizationWarnings
    }))
  };
}
