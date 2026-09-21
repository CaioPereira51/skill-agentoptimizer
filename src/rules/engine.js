import { createFinding } from "../domain.js";
import { validateRule } from "../plugins.js";

export class RuleEngine {
  constructor(rules = []) {
    this.rules = [];
    rules.forEach((rule) => this.register(rule));
  }
  register(rule) {
    validateRule(rule);
    if (this.rules.some((item) => item.id === rule.id)) throw new Error(`Duplicate rule: ${rule.id}`);
    this.rules.push(rule);
    return this;
  }
  analyze(context) {
    return this.rules.flatMap((rule) => {
      const result = rule.analyze(context) ?? [];
      return (Array.isArray(result) ? result : [result]).filter(Boolean).map((finding) => createFinding({ ...finding, ruleId: finding.ruleId ?? rule.id }));
    });
  }
}
