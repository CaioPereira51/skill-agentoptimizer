import { ReworkStatus, isKnown, valueOf } from "./domain.js";

const correctionSignals = /\b(não era isso|corrija|correção|faltou|ajuste novamente|isso quebrou|volte atrás|reverta|analise novamente|wrong|fix it|missing|broke|revert|try again)\b/i;
const acceptanceSignals = /\b(aprovado|aceito|funcionou|perfeito|pronto|looks good|accepted|works|done)\b/i;

function interactionText(item) {
  if (typeof item === "string") return item;
  return `${item.role ?? ""}: ${item.content ?? item.text ?? item.message ?? ""}`;
}

export function classifyRework(session) {
  const field = session.fields.interactions;
  if (!isKnown(field)) return { status: ReworkStatus.UNKNOWN, corrections: null, reason: field?.reason ?? "interactions unknown" };
  const interactions = valueOf(field, []);
  if (!Array.isArray(interactions) || interactions.length === 0) return { status: ReworkStatus.UNKNOWN, corrections: null, reason: "no interaction sequence" };
  const texts = interactions.map(interactionText);
  const corrections = texts.filter((text) => correctionSignals.test(text)).length;
  const accepted = texts.some((text) => acceptanceSignals.test(text)) || /success|accepted|completed/i.test(String(valueOf(session.fields.result, "")));
  if (!accepted && corrections === 0) return { status: ReworkStatus.UNKNOWN, corrections: 0, reason: "no acceptance or correction evidence" };
  if (corrections === 0) return { status: ReworkStatus.ACCEPTED_FIRST_PASS, corrections: 0 };
  if (corrections === 1) return { status: ReworkStatus.SINGLE_REWORK, corrections: 1 };
  return { status: ReworkStatus.MULTIPLE_REWORKS, corrections };
}

export function classifyAll(sessions) {
  return Object.fromEntries(sessions.map((session) => [session.id, classifyRework(session)]));
}
