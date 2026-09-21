# AgentOptimizer Technical Plan

Validated on 2026-09-21 against the projects' own repositories and documentation.

## Source validation

| Project | Validated capability | Boundary relevant to AgentOptimizer |
|---|---|---|
| [session-report](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/session-report/skills/session-report/SKILL.md) | Official Anthropic plugin skill that analyzes Claude Code transcripts and reports tokens, cache, subagents, skills, costly prompts, anomalies, and optimizations. | Claude Code-specific and usage-oriented; it is not a cross-platform workflow-quality engine. |
| [How I Prompt](https://github.com/eeshansrivastava89/howiprompt) | Local-first parsing and prompt analytics for Claude Code, Codex, Copilot Chat, Cursor, LM Studio, Pi, and OpenCode. MIT licensed. | Its metrics describe prompt style/persona and activity, not spec discipline, validation coverage, causal rework, or first-pass success. Its parsers are a useful reference for adapters. |
| [skillusage](https://github.com/lovstudio/skillusage) | Local skill/slash-command usage counts for Claude Code and Codex, distinguishing manual, automatic, and inferred signals. | Measures use frequency, not whether the chosen abstraction improved the workflow. |
| [ccusage](https://github.com/ccusage/ccusage) | Unified local token/cost/session reporting for Claude Code, Codex, OpenCode, Amp, Droid, Codebuff, Hermes, Pi, Goose, OpenClaw, Kilo, Kimi, Qwen, Copilot CLI, Gemini CLI, Antigravity, Grok, and ZCode. | Broad consumption telemetry, not qualitative workflow diagnosis. The earlier comparison understated its current coverage. |
| [OpenLIT](https://github.com/openlit/openlit) | OpenTelemetry-native traces of prompts, LLM calls, tool calls, subagents, tokens, cost, errors, evaluations, and code impact; explicit installers exist for Cursor, Claude Code, and Codex. | Strong live observability platform, but it does not provide AgentOptimizer's deterministic longitudinal workflow metrics. |
| [agent-observability](https://github.com/anonalabs/agent-observability) | Self-hosted normalized telemetry and Grafana dashboards for Claude Code, Gemini CLI, Cursor, Copilot coding agent, Codex, and OpenCode. | Infrastructure-heavy observability; no equivalent qualitative audit core. |
| [AgentMeter](https://github.com/aussiealex/agentmeter) | Local cost, token, tool-call, session outcome, coaching, and budget analysis for several coding agents. | The name is ambiguous across multiple unrelated repositories; claims must identify this repository. It focuses on spend/efficiency. |
| [Agent Trail](https://github.com/camtrik/agent-trail) | Local dashboard and replay for Claude Code, Codex, OpenCode, OpenClaw, and Qoder, including tokens, costs, tool calls, and subagent trees. | History/replay rather than workflow-quality scoring. The name is also ambiguous; `Ravi-Goli/agent-trail` is a different timeline-recorder project. |
| [skill-audit](https://github.com/okjpg/skill-audit) | Static checks for `SKILL.md` structure, triggering, examples, edge cases, output contracts, secrets, and evals. | Explicitly does not evaluate semantic workflow quality or execute the skill. |

## Current repository compared with the market

The repository already implements the differentiated middle and upper layers:

- a normalized session contract with `known`, `unknown`, and `unavailable` evidence states;
- deterministic qualitative rules for prompt quality, context, task decomposition, spec discipline, validation, rework, and agent efficiency;
- metrics, recurring-pattern detection, recommendations, Markdown reporting, audit history, and trend comparison;
- repository evidence collection and generic JSON, JSONL, and Markdown imports.

The principal gap is the lower collection layer. Before this plan, real tool histories had to be pre-converted into AgentOptimizer's generic shape. The engine therefore had more analytical breadth than directly usable evidence.

## Target architecture

```text
Native histories / external collectors / repository evidence
                         |
              source-specific adapters
                         |
        normalized evidence with explicit availability
                         |
 rules -> metrics -> diagnostics -> recommendations -> trends
```

The Core must remain platform-independent. Source-specific code belongs in `src/adapters/`; integrations must preserve provenance and must never convert missing observations into negative evidence.

## Delivery roadmap

### Phase 1 — Native evidence path (implemented in 0.1.x)

- Add a Codex `history.jsonl` adapter, grouped by session.
- Optionally enrich model information from Codex session JSONL metadata.
- Keep transcript-only fields, including ordered interactions and outcomes, unavailable rather than guessed.
- Expose the adapter through the CLI and public module exports.
- Cover grouping, ordering, malformed rows, limitations, and metadata enrichment with tests.

Acceptance: a user can audit a real Codex history directly; malformed rows are visible; unsupported metrics return insufficient data rather than false zeroes.

### Phase 2 — Collector interoperability (implemented in 0.5.0)

- Define a versioned `AgentOptimizer Interchange` schema for normalized conversations, tool events, validation evidence, costs, and provenance. Implemented as `agentoptimizer.interchange/v1`.
- Add import bridges for How I Prompt message exports, ccusage JSON, skillusage JSON, and OpenTelemetry/OTLP-derived session summaries where stable machine-readable contracts exist.
- Join sources by platform, session id, project, and time window while retaining field-level provenance.

Acceptance: one audit can combine prompt text, usage/cost, skill use, and tool/validation evidence without duplicating a session or weakening confidence.

### Phase 3 — Stronger workflow outcome model (implemented in 0.5.0)

- Replace phrase-only outcome evidence with typed interaction events: request, clarification, correction, validation, acceptance, rollback, and abandonment. Implemented with legacy-string compatibility.
- Separate rework occurrence from likely cause; report prompt, context, spec, implementation, and validation as evidence-weighted hypotheses. Implemented with `SUPPORTED` and `INSUFFICIENT_DATA` states.
- Add per-project baselines and minimum-sample guards for longitudinal metrics.

Acceptance: every rework diagnosis identifies its evidence and alternative explanations; no causal claim is emitted from correlation alone.

### Phase 4 — Extensible recommendation system (implemented in 0.5.0)

- Introduce a rule/plugin registration contract with schema validation.
- Generate candidate Skill, Rule, Hook, or Command artifacts only after recurrence and confidence thresholds are met.
- Add an evaluation harness with labeled synthetic and anonymized fixtures.

Acceptance: third-party rules cannot bypass evidence requirements, and recommendation precision is measured against fixtures.

### Phase 5 — Product surface (implemented in 0.5.0)

- Add a local HTML dashboard over persisted audits.
- Provide drill-down from metric to finding to source evidence.
- Add opt-in live ingestion through OpenTelemetry without making OpenLIT a hard dependency.

Acceptance: every chart value is traceable to normalized sessions and source locations; local operation remains the default.

### Phase 6 — Publication hardening (implemented locally, pending release)

- Keep public GitHub metadata aligned with the existing `CaioPereira51/skill-agentoptimizer` remote while preserving the npm package name `@caiopereira51/agentoptimizer`.
- Support Cursor Markdown transcripts and Cursor OTLP logs/metrics without treating either as complete traces or model context.
- Exclude workflows with explicit `automationState: known(true)` from automation opportunities and candidate artifacts.
- Merge evidence by actual timestamp distance, avoiding fixed-window boundary splits.
- Expand labeled evaluation coverage across Portuguese and English prompts, scoped tasks, corrections, clarification, and unknown evidence states.
- Warn that Node plugin modules execute with local process privileges.

Acceptance: public instructions run as written; source formats retain their evidence limits; and the full verification pipeline plus the labeled evaluation harness pass.

## Integration policy

- Reuse stable outputs and public contracts before copying parser code.
- Treat third-party local databases and private log formats as optional adapters with version detection.
- Record adapter name, source version when discoverable, source location, and parsing warnings.
- Never upload raw prompts by default.
- Keep tokens/cost observational; never rank model quality without outcome evidence.
