import { AgentOptimizer, normalizeSession } from "../src/index.js";

const session = normalizeSession({ id: "contract", prompts: ["Analyze and test this"], interactions: ["accepted"], result: "success" });
const { audit } = new AgentOptimizer({ clock: () => new Date("2026-01-01T00:00:00Z") }).analyze([session]);
if (!Array.isArray(audit.metrics) || !Array.isArray(audit.findings) || audit.schemaVersion !== 3) throw new Error("Core contract check failed");
process.stdout.write("Runtime contract check passed (static TypeScript checking is not applicable to this JavaScript project).\n");
