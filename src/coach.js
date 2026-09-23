import { valueOf } from "./domain.js";

function unique(values) { return [...new Set(values)]; }

function promptCount(sessions) {
  return sessions.reduce((total, session) => total + (Array.isArray(valueOf(session.fields.prompts)) ? valueOf(session.fields.prompts).length : 0), 0);
}

/**
 * Render a deliberately narrow coaching report. It coaches the observable
 * prompt-writing habits; it never presents prompt-only history as a complete
 * conversation transcript or as evidence of agent outcomes.
 */
export function renderCoachingReport(audit, sessions) {
  const byRecommendation = new Map();
  for (const finding of audit.findings) {
    if (finding.category !== "prompt_quality" || !finding.recommendation) continue;
    const current = byRecommendation.get(finding.recommendation) ?? { finding, sessions: new Set(), examples: [] };
    finding.relatedSessions.forEach((id) => current.sessions.add(id));
    for (const item of finding.evidence ?? []) if (item.excerpt && current.examples.length < 2) current.examples.push(item.excerpt);
    byRecommendation.set(finding.recommendation, current);
  }
  const improvements = [...byRecommendation.values()].sort((a, b) => b.sessions.size - a.sessions.size);
  const lines = [
    "# AgentOptimizer Coaching Report", "",
    "## What was reviewed", "",
    `- ${sessions.length} session(s) and ${promptCount(sessions)} user prompt(s).`,
    "- Coaching focuses on observable user prompts. It does not infer hidden model context, tool activity, validation, cost, or task outcomes when the selected source does not record them.",
    "",
    "## Your strongest next improvements", ""
  ];
  if (!improvements.length) lines.push("No recurring prompt-writing issue was observed in this sample.");
  for (const item of improvements.slice(0, 3)) {
    lines.push(`### ${item.finding.title} (${item.sessions.size} session(s))`, "", item.finding.recommendation, "");
    if (item.examples.length) lines.push("Observed examples:", ...item.examples.map((example) => `- ${example}`), "");
  }
  lines.push("## Longitudinal signal", "");
  if (sessions.length < 3) lines.push("Collect at least 3 sessions before treating a pattern as a personal habit; this sample is useful for immediate feedback, not a stable trend.");
  else lines.push("Compare this saved audit with later coaching runs through `agent-optimizer trends`; interpret changes only when the report has enough comparable sessions.");
  lines.push("", "## Next prompt template", "", "`[objective] in [scope]. Preserve [constraints]. Done when [observable validation or outcome].`", "");
  return `${lines.join("\n")}\n`;
}
