import { pathToFileURL } from "node:url";

export function validateRule(rule) {
  if (!rule || typeof rule !== "object") throw new TypeError("Rule must be an object");
  if (typeof rule.id !== "string" || !rule.id.trim()) throw new TypeError("Rule requires a non-empty string id");
  if (typeof rule.analyze !== "function") throw new TypeError(`Rule ${rule.id} requires analyze(context)`);
  return rule;
}

export function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== "object") throw new TypeError("Plugin must export an object");
  if (typeof plugin.name !== "string" || !plugin.name.trim()) throw new TypeError("Plugin requires a non-empty name");
  if (plugin.version != null && typeof plugin.version !== "string") throw new TypeError("Plugin version must be a string");
  if (!Array.isArray(plugin.rules) || plugin.rules.length === 0) throw new TypeError("Plugin requires at least one rule");
  plugin.rules.forEach(validateRule);
  return plugin;
}

export async function loadRulePlugin(modulePath) {
  const module = await import(pathToFileURL(modulePath).href);
  return validatePlugin(module.default ?? module.plugin ?? module);
}
