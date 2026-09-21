import { Availability, known, unknown, valueOf } from "./domain.js";
import { OBSERVABLE_FIELDS } from "./normalize.js";

const TOOL_ALIASES = new Map([
  ["claude", "claude-code"],
  ["claude_code", "claude-code"],
  ["codex-cli", "codex"]
]);

function canonicalTool(session) {
  const tool = String(valueOf(session.fields.tool, session.source) ?? "unknown").toLowerCase();
  return TOOL_ALIASES.get(tool) ?? tool;
}

function timeBucket(session, windowMs) {
  const timestamp = valueOf(session.fields.timestamp);
  const value = timestamp == null ? NaN : new Date(timestamp).valueOf();
  return Number.isNaN(value) ? null : Math.floor(value / windowMs);
}

function identityKey(session, windowMs) {
  const tool = canonicalTool(session);
  const sessionId = valueOf(session.fields.session);
  if (sessionId != null && String(sessionId).trim()) return `${tool}:session:${String(sessionId).trim()}`;
  const project = valueOf(session.fields.project);
  const bucket = timeBucket(session, windowMs);
  if (project != null && bucket != null) return `${tool}:project:${String(project)}:time:${bucket}`;
  return `unique:${session.source}:${session.id}`;
}

function projectTimeKey(session, windowMs) {
  const project = valueOf(session.fields.project);
  const bucket = timeBucket(session, windowMs);
  if (project == null || bucket == null) return null;
  return `${canonicalTool(session)}:project:${String(project)}:time:${bucket}`;
}

function uniqueArray(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeField(key, fields) {
  const knownFields = fields.filter((field) => field?.status === Availability.KNOWN);
  if (!knownFields.length) {
    const unavailable = fields.find((field) => field?.status === Availability.UNAVAILABLE);
    return unavailable ?? fields.find(Boolean) ?? unknown("no merged source provided this field");
  }
  const values = knownFields.map((field) => field.value);
  if (values.every(Array.isArray)) return known(uniqueArray(values.flat()));
  const first = JSON.stringify(values[0]);
  if (values.every((value) => JSON.stringify(value) === first)) return known(values[0]);
  return unknown(`conflicting known values while merging field '${key}'`);
}

function mergeGroup(group, key) {
  if (group.length === 1) return group[0];
  const fields = Object.fromEntries(OBSERVABLE_FIELDS.map((field) => [field, mergeField(field, group.map((session) => session.fields[field]))]));
  const fieldProvenance = Object.fromEntries(OBSERVABLE_FIELDS.map((field) => [field, group.filter((session) => session.fields[field]?.status === Availability.KNOWN).map((session) => ({ source: session.source, sourceFormat: session.sourceFormat, sessionId: session.id }))]));
  return {
    id: `merged:${key}`,
    source: uniqueArray(group.map((session) => session.source)).join("+"),
    sourceFormat: uniqueArray(group.map((session) => session.sourceFormat)).join("+"),
    fields,
    fieldProvenance,
    rawEvidence: uniqueArray(group.flatMap((session) => [
      ...session.rawEvidence,
      { type: "merge-source", source: session.source, sourceFormat: session.sourceFormat, sessionId: session.id }
    ])),
    normalizationWarnings: uniqueArray(group.flatMap((session) => session.normalizationWarnings))
  };
}

export function mergeSessions(sessions, { timeWindowMs = 5 * 60 * 1000 } = {}) {
  if (!Array.isArray(sessions)) throw new TypeError("mergeSessions expects an array");
  const groups = new Map();
  const projectTimeToSessionGroups = new Map();
  const withoutSessionId = [];
  for (const session of sessions) {
    const sessionId = valueOf(session.fields.session);
    if (sessionId == null || !String(sessionId).trim()) { withoutSessionId.push(session); continue; }
    const key = identityKey(session, timeWindowMs);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
    const projectTime = projectTimeKey(session, timeWindowMs);
    if (projectTime) {
      if (!projectTimeToSessionGroups.has(projectTime)) projectTimeToSessionGroups.set(projectTime, new Set());
      projectTimeToSessionGroups.get(projectTime).add(key);
    }
  }
  for (const session of withoutSessionId) {
    const projectTime = projectTimeKey(session, timeWindowMs);
    const candidates = projectTime ? [...(projectTimeToSessionGroups.get(projectTime) ?? [])] : [];
    const key = candidates.length === 1 ? candidates[0] : identityKey(session, timeWindowMs);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }
  return [...groups.entries()].map(([key, group]) => mergeGroup(group, key));
}
