import { Confidence, Priority, valueOf } from "../domain.js";
import { evidence, finding, hasKnown } from "./helpers.js";

const objectiveTerms = /\b(implementar|criar|corrigir|analisar|investigar|refatorar|documentar|build|fix|create|analy[sz]e|investigate|implement)\b/i;
const constraintTerms = /\b(não|sem|deve|somente|apenas|limite|restri|must|shall|without|only|avoid)\b/i;
const acceptanceTerms = /\b(critérios? de aceite|considerad[oa] (?:pront[oa]|concluíd[oa])|acceptance criteria|done when|validar|testes?|tests?|build|lint|typecheck)\b/i;

function repeatedLines(prompt) {
  const lines = prompt.split(/\r?\n/).map((line) => line.trim().toLowerCase()).filter((line) => line.length > 18);
  const counts = new Map();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1);
}

export const promptQualityRule = {
  id: "prompt-quality",
  category: "prompt_quality",
  analyze({ sessions }) {
    const findings = [];
    for (const session of sessions) {
      if (!hasKnown(session, "prompts")) continue;
      const observed = valueOf(session.fields.prompts, []);
      const prompts = (Array.isArray(observed) ? observed : [observed]).map((prompt) => String(prompt).trim());
      for (const [promptIndex, prompt] of prompts.entries()) {
      const suffix = (name) => prompts.length > 1 ? `prompt-${promptIndex + 1}-${name}` : name;
      if (!prompt) {
        findings.push(finding(session, this.id, {
          suffix: suffix("missing-objective"), category: this.category, severity: Priority.HIGH,
          title: "Prompt sem objetivo observável", description: "A fonte registrou um prompt vazio.",
          evidence: [evidence(session, "prompts", "empty prompt")],
          recommendation: "Declare a mudança ou investigação esperada e o resultado verificável.", confidence: Confidence.HIGH
        }));
        continue;
      }
      if (!objectiveTerms.test(prompt)) findings.push(finding(session, this.id, {
        suffix: suffix("unclear-objective"), category: this.category, title: "Objetivo pouco explícito",
        description: "O prompt não contém uma ação ou objetivo identificável pelas heurísticas rastreáveis.",
        evidence: [evidence(session, "prompts", prompt)],
        recommendation: "Comece pelo objetivo usando uma ação concreta e indique o resultado esperado.", confidence: Confidence.MEDIUM
      }));
      if (prompt.length >= 80 && !constraintTerms.test(prompt)) findings.push(finding(session, this.id, {
        suffix: suffix("constraints"), category: this.category, severity: Priority.LOW, title: "Restrições não identificadas",
        description: "O prompt descreve trabalho substantivo, mas não torna limites ou invariantes observáveis.",
        evidence: [evidence(session, "prompts", prompt)],
        recommendation: "Declare apenas restrições relevantes: escopo, compatibilidade, ações proibidas ou limites de dependência.", confidence: Confidence.MEDIUM
      }));
      if (prompt.length < 45 && !constraintTerms.test(prompt) && !acceptanceTerms.test(prompt)) findings.push(finding(session, this.id, {
        suffix: suffix("generic"), category: this.category, severity: Priority.HIGH, title: "Prompt excessivamente genérico",
        description: "O prompt é curto e não contém restrições nem critérios verificáveis.", evidence: [evidence(session, "prompts", prompt)],
        recommendation: "Inclua escopo, restrições relevantes e um critério observável de conclusão.", confidence: Confidence.HIGH
      }));
      if (prompt.length > 12000) findings.push(finding(session, this.id, {
        suffix: suffix("oversized"), category: this.category, title: "Prompt muito grande",
        description: "O prompt excede 12 mil caracteres; tamanho isolado não define baixa qualidade, mas aumenta o risco de instruções enterradas.",
        evidence: [evidence(session, "prompts", `${prompt.length} characters`)],
        recommendation: "Separe requisitos estáveis em uma especificação e mantenha no prompt apenas objetivo, escopo e critérios relevantes.", confidence: Confidence.HIGH
      }));
      const instructionLines = prompt.split(/\r?\n/).filter((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line));
      if (instructionLines.length > 40) findings.push(finding(session, this.id, {
        suffix: suffix("instruction-overload"), category: this.category, title: "Excesso de instruções operacionais",
        description: `Foram observadas ${instructionLines.length} instruções em lista; o sinal considera estrutura, não apenas tamanho.`,
        evidence: [evidence(session, "prompts", `${instructionLines.length} list instructions`)],
        recommendation: "Mova políticas estáveis para uma Rule/Skill e agrupe a tarefa atual por fases e critérios.", confidence: Confidence.MEDIUM
      }));
      const repeated = repeatedLines(prompt);
      if (repeated.length) findings.push(finding(session, this.id, {
        suffix: suffix("repetition"), category: this.category, severity: Priority.LOW, title: "Instruções repetidas",
        description: "Linhas substantivas idênticas aparecem mais de uma vez.",
        evidence: repeated.slice(0, 3).map(([line, count]) => evidence(session, "prompts", `${count}x: ${line}`)),
        recommendation: "Consolide instruções duplicadas para reduzir ruído de contexto.", confidence: Confidence.HIGH
      }));
      if (!acceptanceTerms.test(prompt) && prompt.length > 80) findings.push(finding(session, this.id, {
        suffix: suffix("acceptance"), category: this.category, title: "Critério de aceite não identificado",
        description: "Há objetivo/contexto no prompt, mas nenhum sinal de validação ou resultado verificável.",
        evidence: [evidence(session, "prompts", prompt)],
        recommendation: "Adicione critérios de aceite proporcionais ao tipo da tarefa.", confidence: Confidence.MEDIUM
      }));
      const investigate = /\b(investig|analise|diagnos)/i.test(prompt);
      const implement = /\b(implemente|altere|corrija|crie|implement|change|fix|create)\b/i.test(prompt);
      const phaseBoundary = /\b(agora|depois|em seguida|antes de|fase|now|then|after|before)\b/i.test(prompt);
      const contradiction = (/(?:não\s+(?:altere|implemente)(?:\s+(?:o\s+)?código)?|do not\s+(?:change|implement)(?:\s+code)?|without\s+code\s+changes)/i.test(prompt) && implement)
        || (/(?:não|do not|skip)\s+(?:execute|run|rode)?\s*(?:test|teste)/i.test(prompt) && /(?:execute|run|rode)\s+(?:os?\s+)?(?:test|teste)/i.test(prompt));
      if (contradiction && !phaseBoundary) findings.push(finding(session, this.id, {
        suffix: suffix("contradiction"), category: this.category, severity: Priority.HIGH, title: "Instruções potencialmente contraditórias",
        description: "O prompt contém diretivas positivas e negativas para a mesma classe de ação sem separação de fase.",
        evidence: [evidence(session, "prompts", prompt)],
        recommendation: "Resolva a precedência explicitamente ou separe diagnóstico e alteração em etapas.", confidence: Confidence.MEDIUM
      }));
      if (investigate && implement && !phaseBoundary) findings.push(finding(session, this.id, {
        suffix: suffix("mixed-phases"), category: this.category, title: "Investigação e implementação sem fronteira clara",
        description: "O mesmo prompt pede descoberta e alteração sem indicar um ponto de decisão entre as fases.",
        evidence: [evidence(session, "prompts", prompt)],
        recommendation: "Defina a ordem: investigar, registrar evidências/decisão e só então implementar.", confidence: Confidence.MEDIUM
      }));
      }
    }
    return findings;
  }
};
