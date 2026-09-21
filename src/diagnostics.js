import { Confidence, HypothesisSupport } from "./domain.js";

const hypothesisLabels = {
  prompt_quality: "prompt",
  context: "context",
  spec_discipline: "specification",
  task_decomposition: "task_decomposition",
  implementation: "implementation",
  validation: "validation",
  agent_efficiency: "agent_selection"
};

const reworkHypotheses = ["prompt", "context", "specification", "task_decomposition", "implementation", "validation"];

function aggregateConfidence(findings) {
  const values = findings.map((finding) => finding.confidence);
  if (values.every((value) => value === Confidence.HIGH)) return Confidence.HIGH;
  if (values.some((value) => value === Confidence.LOW)) return Confidence.LOW;
  return Confidence.MEDIUM;
}

function hypothesis(category, support, findings = []) {
  return {
    category,
    support,
    evidence: findings.flatMap((finding) => finding.evidence),
    relatedFindings: findings.map((finding) => finding.id)
  };
}

export function diagnose(findings) {
  const direct = findings.filter((finding) => hypothesisLabels[finding.category]);
  const observations = direct.map((finding) => ({
    observation: finding.title,
    category: finding.category,
    evidence: finding.evidence,
    relatedFindings: [finding.id],
    hypotheses: [hypothesis(hypothesisLabels[finding.category], HypothesisSupport.SUPPORTED, [finding])],
    confidence: finding.confidence
  }));

  const reworkFindings = findings.filter((finding) => finding.category === "rework");
  if (!reworkFindings.length) return observations;
  const relatedSessions = new Set(reworkFindings.flatMap((finding) => finding.relatedSessions));
  const supporting = direct.filter((finding) => finding.relatedSessions.some((session) => relatedSessions.has(session)));
  observations.push({
    observation: "Rework observed",
    category: "rework",
    evidence: reworkFindings.flatMap((finding) => finding.evidence),
    relatedFindings: reworkFindings.map((finding) => finding.id),
    hypotheses: reworkHypotheses.map((category) => {
      const matches = supporting.filter((finding) => hypothesisLabels[finding.category] === category);
      return hypothesis(category, matches.length ? HypothesisSupport.SUPPORTED : HypothesisSupport.INSUFFICIENT_DATA, matches);
    }),
    confidence: aggregateConfidence(reworkFindings)
  });
  return observations;
}
