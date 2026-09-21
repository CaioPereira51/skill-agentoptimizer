export class RuleEngine {
  constructor(rules = []) { this.rules = [...rules]; }
  register(rule) {
    if (!rule?.id || typeof rule.analyze !== "function") throw new TypeError("Rule requires id and analyze()");
    if (this.rules.some((item) => item.id === rule.id)) throw new Error(`Duplicate rule: ${rule.id}`);
    this.rules.push(rule);
    return this;
  }
  analyze(context) {
    return this.rules.flatMap((rule) => {
      const result = rule.analyze(context) ?? [];
      return Array.isArray(result) ? result : [result];
    });
  }
}
