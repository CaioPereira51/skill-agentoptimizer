import { ReworkStatus, createMetric, isKnown, valueOf } from "./domain.js";
import { validationExpectations } from "./rules/spec-validation.js";
import { overlapRatio, textFor } from "./rules/helpers.js";

function eligible(sessions, fields) {
  return sessions.filter((session) => fields.every((field) => isKnown(session.fields[field])));
}

function percent(numerator, denominator) { return denominator ? (numerator / denominator) * 100 : null; }
function findingsFor(findings, category, sessionId) { return findings.filter((f) => f.category === category && f.relatedSessions.includes(sessionId)); }

function validationCoverage(session) {
  const actualText = [...valueOf(session.fields.testsExecuted, []), ...valueOf(session.fields.validation, [])].join(" ").toLowerCase();
  const expected = validationExpectations(session);
  const matches = expected.filter((item) => {
    if (item === "diff_review") return /diff|review|revis/.test(actualText);
    if (item === "tests") return /test|e2e|integration|unit/.test(actualText);
    if (item === "smoke_or_e2e") return /smoke|e2e/.test(actualText);
    return actualText.includes(item.replace("_", "")) || actualText.includes(item.replace("_", " "));
  });
  return { matched: matches.length, expected: expected.length };
}

export function calculateMetrics({ sessions, findings, rework, patterns = [] }) {
  const metrics = [];
  const promptEligible = eligible(sessions, ["prompts"]);
  const promptPass = promptEligible.filter((s) => findingsFor(findings, "prompt_quality", s.id).length === 0).length;
  metrics.push(createMetric("prompt_quality", "Prompt Quality", percent(promptPass, promptEligible.length), "sessions without prompt-quality findings / sessions with observed prompts × 100", ["prompts"], { numerator: promptPass, denominator: promptEligible.length }));

  const contextEligible = sessions.filter((s) => isKnown(s.fields.context) && isKnown(s.fields.prompts) && valueOf(s.fields.context, []).length > 0);
  const contextRatios = contextEligible.map((session) => {
    const prompt = textFor(session, "prompts");
    const items = valueOf(session.fields.context, []);
    const relevant = items.filter((item) => (overlapRatio(String(item), prompt) ?? 0) >= 0.05).length;
    return percent(relevant, items.length);
  });
  metrics.push(createMetric("context_efficiency", "Context Efficiency", contextRatios.length ? contextRatios.reduce((a, b) => a + b, 0) / contextRatios.length : null, "mean(context items with ≥5% lexical overlap with prompt / observed context items × 100)", ["context", "prompts"], { denominator: contextEligible.length, methodology: "Lexical proxy; does not claim actual model usage." }));

  for (const [id, label, category, fields] of [
    ["task_decomposition", "Task Decomposition", "task_decomposition", ["task"]],
    ["spec_discipline", "Spec Discipline", "spec_discipline", ["specArtifacts"]]
  ]) {
    const observed = sessions.filter((s) => fields.some((field) => isKnown(s.fields[field])));
    const pass = observed.filter((s) => findingsFor(findings, category, s.id).length === 0).length;
    metrics.push(createMetric(id, label, percent(pass, observed.length), `eligible sessions without ${category} findings / eligible sessions × 100`, fields, { numerator: pass, denominator: observed.length }));
  }

  const validationEligible = sessions.filter((s) => isKnown(s.fields.testsExecuted) || isKnown(s.fields.validation));
  const coverage = validationEligible.map(validationCoverage);
  const matched = coverage.reduce((sum, item) => sum + item.matched, 0);
  const expected = coverage.reduce((sum, item) => sum + item.expected, 0);
  metrics.push(createMetric("validation_coverage", "Validation Coverage", percent(matched, expected), "observed applicable validation categories / expected categories by task type × 100", ["testsExecuted or validation", "filesChanged/task"], { numerator: matched, denominator: expected }));

  const classified = Object.values(rework).filter((item) => item.status !== ReworkStatus.UNKNOWN);
  const firstPass = classified.filter((item) => item.status === ReworkStatus.ACCEPTED_FIRST_PASS).length;
  const reworked = classified.filter((item) => [ReworkStatus.SINGLE_REWORK, ReworkStatus.MULTIPLE_REWORKS].includes(item.status)).length;
  metrics.push(createMetric("first_pass_success", "First-Pass Success", percent(firstPass, classified.length), "accepted_first_pass tasks / tasks with observable acceptance or correction outcome × 100", ["ordered interactions", "acceptance/correction evidence"], { numerator: firstPass, denominator: classified.length }));
  metrics.push(createMetric("rework_rate", "Rework Rate", percent(reworked, classified.length), "tasks with one or more correction cycles / classified tasks × 100", ["ordered interactions", "acceptance/correction evidence"], { numerator: reworked, denominator: classified.length }));

  const agentEligible = sessions.filter((s) => isKnown(s.fields.operations) && isKnown(s.fields.result));
  const efficient = agentEligible.filter((s) => !findingsFor(findings, "agent_efficiency", s.id).length && !/failed|error|falhou|erro/i.test(String(valueOf(s.fields.result, "")))).length;
  metrics.push(createMetric("agent_efficiency", "Agent Efficiency", percent(efficient, agentEligible.length), "successful eligible sessions without disproportionate-usage findings / eligible sessions × 100", ["operations", "result"], { numerator: efficient, denominator: agentEligible.length }));

  const automated = patterns.filter((p) => p.automated === true).length;
  metrics.push(createMetric("automation_coverage", "Automation Coverage", percent(automated, patterns.length), "recurring patterns marked automated / detected recurring patterns × 100", ["at least two comparable sessions", "automation state"], { numerator: automated, denominator: patterns.length }));

  const comparable = sessions.filter((s) => isKnown(s.fields.prompts));
  const consistent = comparable.filter((s) => !findings.some((f) => f.relatedSessions.includes(s.id) && ["HIGH", "CRITICAL"].includes(f.priority))).length;
  metrics.push(createMetric("workflow_consistency", "Workflow Consistency", percent(consistent, comparable.length), "sessions without HIGH/CRITICAL findings / comparable sessions × 100", ["prompts", "findings"], { numerator: consistent, denominator: comparable.length }));
  return metrics;
}
