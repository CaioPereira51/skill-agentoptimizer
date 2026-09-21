import { Confidence, isKnown, known, unknown, valueOf } from "./domain.js";
import { textFor } from "./rules/helpers.js";

const workflowFamilies = [
  { id: "investigate-only", regex: /investig|encontre a causa|diagnos|não (?:altere|implemente)|do not (?:change|implement)/i, abstraction: "Skill" },
  { id: "validate-before-finish", regex: /teste|lint|typecheck|build|valide|before finish/i, abstraction: "Rule" },
  { id: "review-diff", regex: /revise o diff|review (?:the )?diff/i, abstraction: "Hook" },
  { id: "spec-first", regex: /prd|tech spec|spec-driven|especificação.*antes/i, abstraction: "Skill" },
  { id: "repository-audit", regex: /investigue o repositório|inspect (?:the )?repository|analise o projeto/i, abstraction: "Command" }
];

export function detectPatterns(sessions, minimumOccurrences = 2) {
  const patterns = [];
  for (const family of workflowFamilies) {
    const examples = sessions.flatMap((session) => {
      const prompt = textFor(session, "prompts");
      return family.regex.test(prompt) ? [{ sessionId: session.id, excerpt: prompt.slice(0, 240) }] : [];
    });
    if (examples.length >= minimumOccurrences) {
      const observedStates = sessions.flatMap((session) => {
        const field = session.fields.automationEvidence;
        if (!isKnown(field)) return [];
        return valueOf(field, []).filter((item) => item?.pattern === family.id && typeof item.automated === "boolean").map((item) => item.automated);
      });
      const distinctStates = [...new Set(observedStates)];
      const automationState = distinctStates.length === 1
        ? known(distinctStates[0])
        : unknown(distinctStates.length > 1 ? "conflicting automation evidence" : "no source reported automation state");
      patterns.push({
        pattern: family.id,
        occurrences: examples.length,
        examples,
        suggestedAbstraction: family.abstraction,
        automationState,
        confidence: examples.length >= 3 ? Confidence.HIGH : Confidence.MEDIUM
      });
    }
  }
  return patterns;
}

export function automationOpportunities(patterns) {
  return patterns.map((pattern) => ({
    id: `automation:${pattern.pattern}`,
    pattern: pattern.pattern,
    type: pattern.suggestedAbstraction,
    recommendation: `Transforme o workflow recorrente '${pattern.pattern}' em ${pattern.suggestedAbstraction}.`,
    evidence: pattern.examples,
    expectedImpact: `Reduzir repetição em ${pattern.occurrences} ocorrências observadas.`,
    priority: pattern.occurrences >= 4 ? "HIGH" : "MEDIUM",
    confidence: pattern.confidence
  }));
}
