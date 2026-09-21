# Architecture

## Boundaries

- `src/importers.js`: Markdown, JSON, and JSONL parsing.
- `src/adapters/`: source-specific collectors for Codex, Claude Code, Cursor, How I Prompt, ccusage, skillusage, and OTLP JSON.
- `src/merge.js`: platform/session and project/time joining with field-level provenance.
- `src/repository.js`: repository evidence adapter. Platform-specific knowledge stays here.
- `src/normalize.js`: platform-independent normalized session and observability states.
- `src/rules/`: independent, extensible rules. Rules emit findings and never render reports.
- `src/metrics.js`: deterministic metric calculations with explicit denominators.
- `src/patterns.js` and `src/diagnostics.js`: recurring workflow and cause-family analysis.
- `src/recommendations.js`: evidence-linked recommendations.
- `src/report.js`: Markdown presentation only.
- `src/history.js`, `src/trends.js`, and `src/baselines.js`: persistence, guarded comparisons, and project baselines.
- `src/plugins.js`, `src/artifacts.js`, and `src/evaluation.js`: validated extensions, thresholded candidates, and labeled evaluation.
- `src/dashboard.js` and `src/otel-receiver.js`: local evidence UI and opt-in live ingestion.
- `src/optimizer.js`: orchestration over the preceding contracts.
- `bin/agent-optimizer.js` and `skills/agent-optimizer/SKILL.md`: thin interfaces over the Core.

## Normalized session

Every field is an observed value. Session-activity fields include `prompts`, `context`, `commands`, `filesRead`, `filesChanged`, `testsExecuted`, `result`, `interactions`, `specArtifacts`, `validation`, and `operations`. Repository-state fields include `repositoryInventory`, `repositoryChanges`, `repositorySpecArtifacts`, `repositoryHistory`, and `validationCapabilities`.

```json
{"status":"known","value":[]}
{"status":"unknown","reason":"not provided by source"}
{"status":"unavailable","reason":"source cannot provide this field"}
```

This is the confidence boundary: only `known: []` may support a finding that something observable did not occur.

Repository inventory never populates agent-activity fields: discovered is not read, a changed working tree is not a proven agent change, an available script is not an executed validation, and a specification file is not proof that the task used it.

## Extension points

An importer parses an interchange format and passes records to normalization. `agentoptimizer.interchange/v1` is the versioned collector boundary and retains field-level provenance. A native adapter owns platform-specific parsing, marks source limitations explicitly, and emits the same normalized sessions. A plugin exports `{ name, version?, rules }`; rules implement `{ id, analyze(context) }`. Registration validates the contract, and the engine validates every returned finding through `createFinding`, so plugins cannot omit traceable evidence. Native adapters should only be added for public, verifiable data sources; the Core must not branch on IDE names.

## Rework classification

- `accepted_first_pass`: an ordered interaction sequence contains acceptance evidence and no correction signal.
- `single_rework`: exactly one correction signal.
- `multiple_reworks`: two or more correction signals.
- `unknown`: interactions are unavailable/unknown, or the sequence has neither acceptance nor correction evidence.

Typed events are preferred. Legacy strings are converted into ordered events; correction-like language only counts after observable agent work. Phrase matching remains a documented heuristic, not attribution of fault.

## Diagnostics

Diagnostics contain observations and evidence-weighted hypotheses. Rework is never mapped directly to an implementation fault. A hypothesis is `SUPPORTED` only when a related finding provides evidence; otherwise it is `INSUFFICIENT_DATA`.

## Trend methodology

The latest two audits are compared per metric. Missing values or a known denominator below three produce `insufficient_data`. Absolute changes below 3 percentage points are `stable`. Larger changes are `improvement` or `regression`; lower is better only for Rework Rate. Per-project baselines use the mean of at least three calculated audit observations and retain their audit IDs.

## Traceability and local operation

Audit schema version 3 stores normalized `sessionEvidence`, raw source locators, per-metric session IDs, related findings, project metrics, and baselines. The dashboard renders only persisted local audits and HTML-escapes evidence. The OTLP receiver is optional, JSON-only, loopback by default, and accepts trace exports at `/v1/traces`.
