import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

for (const required of ["bin/agent-optimizer.js", "src/index.js", "skills/agent-optimizer/SKILL.md"]) await access(resolve(required), constants.R_OK);
await import("../src/index.js");
process.stdout.write("Build verification passed (dependency-free ESM package; no compilation step).\n");
