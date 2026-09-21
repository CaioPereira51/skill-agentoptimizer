# Architecture

## Boundaries

- `src/importers.js`: Markdown, JSON, and JSONL parsing.
- `src/repository.js`: repository evidence adapter. Platform-specific knowledge stays here.
- `src/normalize.js`: platform-independent normalized session and observability states.
- `src/rules/`: independent, extensible rules. Rules emit findings and never render reports.
- `src/metrics.js`: deterministic metric calculations with explicit denominators.
- `src/patterns.js` and `src/diagnostics.js`: recurring workflow and cause-family analysis.
- `src/recommendations.js`: evidence-linked recommendations.
- `src/report.js`: Markdown presentation only.
- `src/history.js` and `src/trends.js`: persistence and comparisons.
- `src/optimizer.js`: orchestration over the preceding contracts.
- `bin/agent-optimizer.js` and `skills/agent-optimizer/SKILL.md`: thin interfaces over the Core.

## Normalized session

Every field (`tool`, `session`, `task`, `prompts`, `context`, `commands`, `filesRead`, `filesChanged`, `testsExecuted`, `result`, `timestamp`, `interactions`, `model`, `cost`, `specArtifacts`, `validation`, and `operations`) is an observed value:

```json
{"status":"known","value":[]}
{"status":"unknown","reason":"not provided by source"}
{"status":"unavailable","reason":"source cannot provide this field"}
```

This is the confidence boundary: only `known: []` may support a finding that something observable did not occur.

## Extension points

An importer parses a real format and passes records to `normalizeMany`. A new rule implements `{ id, category, analyze(context) }` and is registered in `RuleEngine`. Native adapters should only be added for public, verifiable data sources; the Core must not branch on IDE names.

## Rework classification

- `accepted_first_pass`: an ordered interaction sequence contains acceptance evidence and no correction signal.
- `single_rework`: exactly one correction signal.
- `multiple_reworks`: two or more correction signals.
- `unknown`: interactions are unavailable/unknown, or the sequence has neither acceptance nor correction evidence.

Phrase matching is combined with ordered outcome evidence. It is a documented heuristic, not attribution of fault.

## Trend methodology

The latest two audits are compared per metric. Missing values produce `insufficient_data`. Absolute changes below 3 percentage points are `stable`. Larger changes are `improvement` or `regression`; lower is better only for Rework Rate.
