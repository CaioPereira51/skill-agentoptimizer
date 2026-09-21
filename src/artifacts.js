import { Confidence, valueOf } from "./domain.js";

export function generateCandidateArtifacts(patterns, { minimumOccurrences = 3 } = {}) {
  return patterns.filter((pattern) => pattern.occurrences >= minimumOccurrences && pattern.confidence === Confidence.HIGH && valueOf(pattern.automationState) !== true).map((pattern) => ({
    id: `candidate:${pattern.pattern}`,
    kind: pattern.suggestedAbstraction,
    status: "draft",
    name: pattern.pattern,
    description: `Reusable ${pattern.suggestedAbstraction} candidate derived from ${pattern.occurrences} observed occurrences.`,
    recurrence: pattern.occurrences,
    confidence: pattern.confidence,
    evidence: pattern.examples
  }));
}
