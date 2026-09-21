import { Confidence, Priority } from "../domain.js";
import { evidence, finding, hasKnown, textFor } from "./helpers.js";

const dimensions = {
  investigation: /\b(investig|analis|diagnos|research)\w*/i,
  architecture: /\b(arquitet|architecture|design)\w*/i,
  implementation: /\b(implement|criar|build|develop)\w*/i,
  refactor: /\b(refactor|reestrutur)\w*/i,
  tests: /\b(test|teste|valid)\w*/i,
  documentation: /\b(document|readme|docs?)\w*/i,
  review: /\b(review|revis)\w*/i
};

export const taskDecompositionRule = {
  id: "task-decomposition",
  category: "task_decomposition",
  analyze({ sessions }) {
    return sessions.flatMap((session) => {
      if (!hasKnown(session, "prompts") && !hasKnown(session, "task")) return [];
      const text = `${textFor(session, "task")}\n${textFor(session, "prompts")}`;
      const present = Object.entries(dimensions).filter(([, regex]) => regex.test(text)).map(([name]) => name);
      const ordered = /\b(fase|etapa|primeiro|depois|em seguida|before|after|phase|step)\b/i.test(text);
      if (present.length < 4 || ordered) return [];
      return [finding(session, this.id, {
        category: this.category, severity: Priority.HIGH, title: "Tarefa reúne objetivos independentes sem decomposição explícita",
        description: `Foram identificadas ${present.length} dimensões: ${present.join(", ")}.`,
        evidence: [evidence(session, "prompts", present.join(", "))],
        recommendation: `Divida em fases dependentes: ${present.join(" → ")}; valide a saída de cada fase antes da próxima.`, confidence: Confidence.MEDIUM
      })];
    });
  }
};
