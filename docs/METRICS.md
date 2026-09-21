# Metrics

All metrics are independent. `null` means `insufficient_data`, never zero.

| Metric | Formula | Required observations |
|---|---|---|
| Prompt Quality | sessions without prompt findings / sessions with prompts × 100 | prompts |
| Context Efficiency | mean(relevant context items / provided items × 100) | prompt and non-empty context |
| Task Decomposition | eligible sessions without decomposition findings / eligible sessions × 100 | task or prompt |
| Spec Discipline | sessions without spec findings / sessions with observed spec artifacts × 100 | spec artifacts |
| Validation Coverage | observed applicable validation categories / categories expected by task type × 100 | validation/tests plus task/change type |
| First-Pass Success | accepted-first-pass tasks / classified tasks × 100 | ordered interaction/outcome evidence |
| Rework Rate | reworked tasks / classified tasks × 100 | ordered interaction/outcome evidence |
| Agent Efficiency | successful eligible sessions without disproportionate-use findings / eligible sessions × 100 | operations and result |
| Automation Coverage | recurring patterns marked automated / detected patterns × 100 | comparable sessions and automation state |
| Workflow Consistency | sessions without high/critical findings / comparable sessions × 100 | prompt and findings |

Context relevance uses a reproducible lexical-overlap proxy (at least 5% of item tokens present in the prompt). It does not claim to measure which tokens a model internally used, and the report labels this limitation.
