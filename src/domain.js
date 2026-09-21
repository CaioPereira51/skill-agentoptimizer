export const Confidence = Object.freeze({ HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" });
export const Priority = Object.freeze({ CRITICAL: "CRITICAL", HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" });
export const Availability = Object.freeze({ KNOWN: "known", UNKNOWN: "unknown", UNAVAILABLE: "unavailable" });
export const ReworkStatus = Object.freeze({
  ACCEPTED_FIRST_PASS: "accepted_first_pass",
  SINGLE_REWORK: "single_rework",
  MULTIPLE_REWORKS: "multiple_reworks",
  UNKNOWN: "unknown"
});

export function known(value) {
  return { status: Availability.KNOWN, value };
}

export function unknown(reason = "not provided by source") {
  return { status: Availability.UNKNOWN, reason };
}

export function unavailable(reason = "source cannot provide this field") {
  return { status: Availability.UNAVAILABLE, reason };
}

export function isKnown(field) {
  return field?.status === Availability.KNOWN;
}

export function valueOf(field, fallback = undefined) {
  return isKnown(field) ? field.value : fallback;
}

export function createFinding(input) {
  if (!input.id || !input.category || !input.title || !input.description) {
    throw new Error("Finding requires id, category, title and description");
  }
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) {
    throw new Error(`Finding ${input.id} requires traceable evidence`);
  }
  return {
    id: input.id,
    ruleId: input.ruleId ?? input.id,
    category: input.category,
    severity: input.severity ?? Priority.MEDIUM,
    priority: input.priority ?? input.severity ?? Priority.MEDIUM,
    title: input.title,
    description: input.description,
    evidence: input.evidence,
    recommendation: input.recommendation,
    confidence: input.confidence ?? Confidence.MEDIUM,
    relatedSessions: input.relatedSessions ?? []
  };
}

export function createMetric(id, label, value, formula, requiredData, details = {}) {
  return {
    id,
    label,
    value: value == null ? null : Math.round(value * 100) / 100,
    status: value == null ? "insufficient_data" : "calculated",
    formula,
    requiredData,
    ...details
  };
}
