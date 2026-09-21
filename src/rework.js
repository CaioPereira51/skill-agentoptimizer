import { Confidence, InteractionType, ReworkStatus, isKnown, valueOf } from "./domain.js";

const correctionSignals = /\b(não era isso|corrija|correção|faltou|ajuste novamente|isso quebrou|volte atrás|reverta|analise novamente|wrong|fix it|missing|broke|revert|try again)\b/i;
const acceptanceSignals = /\b(aprovado|aceito|funcionou|perfeito|pronto|looks good|accepted|works|done)\b/i;
const rollbackSignals = /\b(volte atrás|reverta|rollback|revert)\b/i;
const abandonmentSignals = /\b(abandone|cancele|desista|cancel|abandon|stop working)\b/i;
const validationSignals = /\b(test|lint|typecheck|build|valid|smoke|e2e)\b/i;
const validTypes = new Set(Object.values(InteractionType));

function interactionParts(item) {
  if (typeof item === "string") {
    const roleMatch = item.match(/^\s*(user|assistant|agent|tool)\s*:\s*/i);
    return { role: roleMatch?.[1]?.toLowerCase(), text: roleMatch ? item.slice(roleMatch[0].length) : item, explicitType: undefined };
  }
  return {
    role: typeof item?.role === "string" ? item.role.toLowerCase() : undefined,
    text: String(item?.content ?? item?.text ?? item?.message ?? ""),
    explicitType: validTypes.has(item?.type) ? item.type : undefined,
    timestamp: item?.timestamp,
    evidence: item?.evidence
  };
}

function inferType(parts, hasPriorAgentWork) {
  if (parts.explicitType) {
    if (!hasPriorAgentWork && [InteractionType.CORRECTION, InteractionType.ROLLBACK].includes(parts.explicitType)) return InteractionType.REQUEST;
    if (!hasPriorAgentWork && parts.explicitType === InteractionType.ACCEPTANCE) return InteractionType.UNKNOWN;
    return parts.explicitType;
  }
  if (["assistant", "agent", "tool"].includes(parts.role)) {
    return validationSignals.test(parts.text) ? InteractionType.VALIDATION : InteractionType.AGENT_RESPONSE;
  }
  if (abandonmentSignals.test(parts.text)) return InteractionType.ABANDONMENT;
  if (rollbackSignals.test(parts.text) && hasPriorAgentWork) return InteractionType.ROLLBACK;
  if (acceptanceSignals.test(parts.text) && hasPriorAgentWork) return InteractionType.ACCEPTANCE;
  if (correctionSignals.test(parts.text) && hasPriorAgentWork) return InteractionType.CORRECTION;
  return hasPriorAgentWork ? InteractionType.CLARIFICATION : InteractionType.REQUEST;
}

export function normalizeInteractionEvents(interactions) {
  const events = [];
  let hasPriorAgentWork = false;
  for (const [index, item] of interactions.entries()) {
    const parts = interactionParts(item);
    const type = inferType(parts, hasPriorAgentWork);
    const explicit = Boolean(parts.explicitType);
    events.push({
      type,
      role: parts.role,
      text: parts.text,
      timestamp: parts.timestamp,
      evidence: parts.evidence,
      index,
      inferred: !explicit
    });
    if ([InteractionType.AGENT_RESPONSE, InteractionType.IMPLEMENTATION, InteractionType.VALIDATION].includes(type)) hasPriorAgentWork = true;
  }
  return events;
}

export function classifyRework(session) {
  const field = session.fields.interactions;
  if (!isKnown(field)) return { status: ReworkStatus.UNKNOWN, corrections: null, reason: field?.reason ?? "interactions unknown", events: [] };
  const interactions = valueOf(field, []);
  if (!Array.isArray(interactions) || interactions.length === 0) return { status: ReworkStatus.UNKNOWN, corrections: null, reason: "no interaction sequence", events: [] };
  const events = normalizeInteractionEvents(interactions);
  const corrections = events.filter((event) => [InteractionType.CORRECTION, InteractionType.ROLLBACK].includes(event.type)).length;
  const hasAgentWork = events.some((event) => [InteractionType.AGENT_RESPONSE, InteractionType.IMPLEMENTATION, InteractionType.VALIDATION].includes(event.type));
  const accepted = events.some((event) => event.type === InteractionType.ACCEPTANCE)
    || (hasAgentWork && /success|accepted|completed/i.test(String(valueOf(session.fields.result, ""))));
  const confidence = events.every((event) => !event.inferred) ? Confidence.HIGH : Confidence.MEDIUM;
  if (!accepted && corrections === 0) return { status: ReworkStatus.UNKNOWN, corrections: 0, reason: "no ordered acceptance or correction evidence", events, confidence };
  if (corrections === 0) return { status: ReworkStatus.ACCEPTED_FIRST_PASS, corrections: 0, events, confidence };
  if (corrections === 1) return { status: ReworkStatus.SINGLE_REWORK, corrections: 1, events, confidence };
  return { status: ReworkStatus.MULTIPLE_REWORKS, corrections, events, confidence };
}

export function classifyAll(sessions) {
  return Object.fromEntries(sessions.map((session) => [session.id, classifyRework(session)]));
}
