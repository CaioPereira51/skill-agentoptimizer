import { Confidence } from "./domain.js";

const categoryCause = {
  prompt_quality: "Prompt problem",
  context: "Context problem",
  spec_discipline: "Specification problem",
  task_decomposition: "Task decomposition problem",
  agent_efficiency: "Agent selection problem",
  implementation: "Implementation problem",
  validation: "Validation problem",
  rework: "Implementation problem"
};

export function diagnose(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const cause = categoryCause[finding.category];
    if (!cause) continue;
    const group = groups.get(cause) ?? { cause, evidence: [], relatedFindings: [], confidences: [] };
    group.evidence.push(...finding.evidence);
    group.relatedFindings.push(finding.id);
    group.confidences.push(finding.confidence);
    groups.set(cause, group);
  }
  return [...groups.values()].map((group) => ({
    cause: group.cause,
    evidence: group.evidence,
    relatedFindings: group.relatedFindings,
    confidence: group.confidences.every((value) => value === Confidence.HIGH) ? Confidence.HIGH
      : group.confidences.some((value) => value === Confidence.LOW) ? Confidence.LOW : Confidence.MEDIUM
  }));
}
