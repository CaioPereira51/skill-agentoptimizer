# Metrics

All metrics are independent. `null` means `insufficient_data`, never zero.

| Metric | Formula | Required observations |
|---|---|---|
| Prompt Quality | sessions without prompt findings / sessions with prompts × 100 | prompts |
| Context Lexical Alignment | mean(context items sharing ≥5% of their lexical tokens with the prompt / provided items × 100) | prompt and non-empty context |
| Task Decomposition | eligible sessions without decomposition findings / eligible sessions × 100 | task or prompt |
| Spec Discipline | sessions without spec findings / sessions with observed spec artifacts × 100 | spec artifacts |
| Validation Coverage | observed applicable validation categories / categories expected by task type × 100 | validation/tests plus task/change type |
| First-Pass Success | accepted-first-pass tasks / classified tasks × 100 | ordered interaction/outcome evidence |
| Rework Rate | reworked tasks / classified tasks × 100 | ordered interaction/outcome evidence |
| Agent Efficiency | successful eligible sessions without disproportionate-use findings / eligible sessions × 100 | operations and result |
| Automation Coverage | recurring patterns marked automated / detected patterns × 100 | comparable sessions and automation state |
| Workflow Consistency | sessions without high/critical findings / comparable sessions × 100 | prompt and findings |

Context Lexical Alignment is a reproducible proxy. It does not claim semantic relevance, context efficiency, or which tokens a model internally used. Historical `context_efficiency` values remain comparable through the trend migration alias.

Automation Coverage excludes recurring patterns whose `automationState` is `unknown` or `unavailable`. If no pattern has an observed state, the metric is `insufficient_data`, never zero.

Every metric records `evidenceSessions`, plus its numerator/denominator when applicable. Longitudinal comparison requires at least three samples whenever a denominator or explicit sample size is available. Project baselines likewise remain `insufficient_data` until three calculated audit observations exist.
