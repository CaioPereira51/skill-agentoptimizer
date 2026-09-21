---
name: agent-optimizer
description: Audit AI-assisted development workflows from repository evidence or exported JSON, JSONL, and Markdown sessions, producing evidence-backed metrics, findings, recommendations, history, and trends. Use when the user asks to measure prompt quality, context efficiency, validation, rework, first-pass success, spec discipline, or recurring automation opportunities.
---

# AgentOptimizer

Use the repository's `agent-optimizer` CLI as the single source of analysis logic. Do not reproduce rule heuristics in the skill.

## Audit

Choose one observable source:

- Exported sessions: run `node bin/agent-optimizer.js audit --input <file>` for JSON, JSONL, or Markdown.
- Repository evidence: run `node bin/agent-optimizer.js audit --repository <path>`.

Use `--json` only when structured output is needed by another step. Audits persist under `.agentoptimizer/` unless `--no-persist` is explicitly appropriate.

Never infer that an unknown field is negative. In particular, unknown test execution is not equivalent to no tests. Preserve confidence and data limitations from the generated audit.

## History and trends

Run `node bin/agent-optimizer.js history` to list saved audits and `node bin/agent-optimizer.js trends` to compare the latest two. A change under three percentage points is stable by the documented methodology.

## Reporting

Present the generated report as evidence, not as blame. Distinguish direct evidence from inference and state when native tool histories or model/cost metadata are unavailable. Recommend automations; do not create them unless the user separately asks.
