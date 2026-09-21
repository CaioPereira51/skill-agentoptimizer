import { Confidence, Priority, ReworkStatus, isKnown, valueOf } from "../domain.js";
import { classifyRework } from "../rework.js";
import { evidence, finding, list, textFor } from "./helpers.js";

export const reworkRule = {
  id: "rework",
  category: "rework",
  analyze({ sessions }) {
    return sessions.flatMap((session) => {
      const classification = classifyRework(session);
      if (![ReworkStatus.SINGLE_REWORK, ReworkStatus.MULTIPLE_REWORKS].includes(classification.status)) return [];
      return [finding(session, this.id, {
        category: this.category,
        severity: classification.status === ReworkStatus.MULTIPLE_REWORKS ? Priority.HIGH : Priority.MEDIUM,
        title: classification.status === ReworkStatus.MULTIPLE_REWORKS ? "Múltiplos ciclos de retrabalho" : "Um ciclo de retrabalho",
        description: `${classification.corrections} sinal(is) de correção foram observados na sequência de interações.`,
        evidence: [evidence(session, "interactions", `${classification.corrections} correction signals`) ],
        recommendation: "Revise a causa associada (prompt, contexto, especificação, implementação ou validação) antes da próxima tentativa.", confidence: Confidence.MEDIUM
      })];
    });
  }
};

export const agentEfficiencyRule = {
  id: "agent-efficiency",
  category: "agent_efficiency",
  analyze({ sessions }) {
    const findings = [];
    for (const session of sessions) {
      const operationsKnown = isKnown(session.fields.operations);
      const costKnown = isKnown(session.fields.cost);
      const modelKnown = isKnown(session.fields.model);
      const operations = list(session, "operations").length;
      const changed = list(session, "filesChanged").length;
      const task = `${textFor(session, "task")} ${textFor(session, "prompts")}`;
      const simple = task.length > 0 && task.length < 180 && !/arquitet|migrat|refactor|security|distributed|complex/i.test(task);
      if (operationsKnown && simple && operations > 30 && changed <= 1) findings.push(finding(session, this.id, {
        suffix: "disproportionate", category: this.category, title: "Uso potencialmente desproporcional do agente",
        description: "Uma tarefa heuristicamente simples consumiu mais de 30 operações e alterou no máximo um arquivo.",
        evidence: [evidence(session, "operations", `${operations} operations`), evidence(session, "filesChanged", `${changed} changed files`)],
        recommendation: "Investigue operações repetidas, contexto insuficiente ou validações redundantes antes de escolher outro modelo.", confidence: Confidence.LOW
      }));
      if (!modelKnown && !costKnown) continue;
      // Deliberately no model ranking: known metadata enables reporting, not arbitrary quality claims.
      const result = String(valueOf(session.fields.result, ""));
      if (/failed|error|incomplete|falhou|erro/i.test(result) && !isKnown(session.fields.context)) findings.push(finding(session, this.id, {
        suffix: "insufficient-context", category: this.category, severity: Priority.HIGH, title: "Falha com contexto não observável",
        description: "O resultado indica falha, mas a fonte não permite verificar o contexto usado; não é possível atribuir a causa ao modelo.",
        evidence: [evidence(session, "result", result), evidence(session, "context", session.fields.context.reason ?? "unknown")],
        recommendation: "Capture contexto e operações na próxima execução antes de avaliar adequação do agente/modelo.", confidence: Confidence.LOW
      }));
    }
    return findings;
  }
};
