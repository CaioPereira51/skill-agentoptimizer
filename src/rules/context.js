import { Confidence, Priority } from "../domain.js";
import { evidence, finding, hasKnown, list, overlapRatio, textFor } from "./helpers.js";

export const contextRule = {
  id: "context-engineering",
  category: "context",
  analyze({ sessions }) {
    const findings = [];
    for (const session of sessions) {
      if (!hasKnown(session, "context") && !hasKnown(session, "filesRead")) continue;
      const context = list(session, "context");
      const read = list(session, "filesRead").map(String);
      const changed = list(session, "filesChanged").map(String);
      const duplicated = context.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter((item, index, all) => all.indexOf(item) !== index);
      if (duplicated.length) findings.push(finding(session, this.id, {
        suffix: "duplicate", category: this.category, severity: Priority.LOW, title: "Contexto duplicado",
        description: "Itens idênticos de contexto foram fornecidos mais de uma vez.",
        evidence: duplicated.slice(0, 3).map((item) => evidence(session, "context", item)),
        recommendation: "Deduplicate entradas antes de montar o contexto.", confidence: Confidence.HIGH
      }));
      const missingChanged = changed.filter((file) => read.length && !read.includes(file));
      if (missingChanged.length) findings.push(finding(session, this.id, {
        suffix: "changed-without-read", category: this.category, severity: Priority.HIGH,
        title: "Arquivos alterados sem leitura registrada",
        description: "A fonte registra alterações em arquivos que não aparecem entre os arquivos lidos.",
        evidence: missingChanged.map((file) => evidence(session, "filesChanged", file)),
        recommendation: "Inclua e inspecione os módulos alterados antes da modificação; confirme se o adapter registra leituras corretamente.", confidence: Confidence.MEDIUM
      }));
      const prompt = textFor(session, "prompts");
      if (context.length > 20 && prompt) {
        const weak = context.filter((item) => overlapRatio(String(item), prompt) != null && overlapRatio(String(item), prompt) < 0.05);
        if (weak.length > context.length * 0.7) findings.push(finding(session, this.id, {
          suffix: "broad", category: this.category, title: "Contexto possivelmente amplo demais",
          description: "Mais de 70% dos itens de contexto têm baixa sobreposição lexical com o prompt; a conclusão é inferencial.",
          evidence: [evidence(session, "context", `${weak.length}/${context.length} low-overlap items`)],
          recommendation: "Revise o conjunto inicial e mantenha arquivos ligados ao objetivo, expandindo-o conforme a investigação exigir.", confidence: Confidence.LOW
        }));
      }
    }
    return findings;
  }
};
