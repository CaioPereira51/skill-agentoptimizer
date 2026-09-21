import { Confidence, Priority } from "../domain.js";
import { evidence, finding, hasKnown, list, textFor } from "./helpers.js";

const artifactTypes = {
  prd: /\bprd\b|product requirements?|requisitos? do produto/i,
  techSpec: /tech(?:nical)? spec|especificação técnica|arquitetura/i,
  tasks: /\btasks?\b|tarefas?|plano de implementação/i
};

function artifactText(artifacts, type) {
  return artifacts.filter((item) => artifactTypes[type].test(typeof item === "string" ? item : `${item.type ?? ""} ${item.name ?? ""}`)).map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n");
}

export const specDisciplineRule = {
  id: "spec-discipline",
  category: "spec_discipline",
  analyze({ sessions }) {
    const findings = [];
    for (const session of sessions) {
      if (!hasKnown(session, "specArtifacts")) continue;
      const artifacts = list(session, "specArtifacts");
      if (!artifacts.length && list(session, "filesChanged").length) findings.push(finding(session, this.id, {
        suffix: "missing", category: this.category, title: "Implementação sem artefatos de especificação observados",
        description: "A fonte conhece os artefatos de especificação, registrou nenhum, e há arquivos alterados.",
        evidence: [evidence(session, "specArtifacts", "known empty list"), evidence(session, "filesChanged", list(session, "filesChanged").join(", "))],
        recommendation: "Para mudanças não triviais, registre requisitos, decisões técnicas e tarefas proporcionais ao risco.", confidence: Confidence.HIGH
      }));
      const prd = artifactText(artifacts, "prd");
      if (prd && !/problema|objetivo|requisit|user stor|critério|acceptance/i.test(prd)) findings.push(finding(session, this.id, {
        suffix: "prd-content", category: this.category, severity: Priority.LOW, title: "PRD com elementos de produto pouco observáveis",
        description: "O artefato identificado como PRD não expõe problema, objetivo, requisitos, histórias ou critérios no dado importado.",
        evidence: [evidence(session, "specArtifacts", prd)], recommendation: "Inclua problema, objetivo, requisitos funcionais/regras e critérios de aceite; detalhes técnicos pertencem à Tech Spec.", confidence: Confidence.LOW
      }));
      const techSpec = artifactText(artifacts, "techSpec");
      if (techSpec && !/arquitet|technolog|contrat|modelo|integra|decis|risco/i.test(techSpec)) findings.push(finding(session, this.id, {
        suffix: "tech-spec-content", category: this.category, severity: Priority.LOW, title: "Tech Spec com decisões técnicas pouco observáveis",
        description: "O artefato identificado como Tech Spec não expõe arquitetura, contratos, modelos, integrações, decisões ou riscos no dado importado.",
        evidence: [evidence(session, "specArtifacts", techSpec)], recommendation: "Registre arquitetura, contratos/modelos, integrações, decisões e riscos relevantes.", confidence: Confidence.LOW
      }));
      const tasks = artifactText(artifacts, "tasks");
      if (tasks && !/passo|depend|ordem|fase|valid|step|phase/i.test(tasks)) findings.push(finding(session, this.id, {
        suffix: "tasks-content", category: this.category, severity: Priority.LOW, title: "Plano de tarefas sem ordem ou validações observáveis",
        description: "O artefato de tarefas não torna passos, dependências, fases ou validações observáveis no dado importado.",
        evidence: [evidence(session, "specArtifacts", tasks)], recommendation: "Organize passos na ordem das dependências e inclua a validação de cada fase.", confidence: Confidence.LOW
      }));
    }
    return findings;
  }
};

function isDocsOnly(session) {
  const changed = list(session, "filesChanged").map(String);
  return changed.length > 0 && changed.every((file) => /\.(md|txt|rst|adoc)$/i.test(file));
}

export const validationRule = {
  id: "validation",
  category: "validation",
  analyze({ sessions }) {
    const findings = [];
    for (const session of sessions) {
      if (!hasKnown(session, "testsExecuted") && !hasKnown(session, "validation")) continue;
      const validations = [...list(session, "testsExecuted"), ...list(session, "validation")].map((item) => String(item));
      const changed = list(session, "filesChanged");
      if (changed.length && validations.length === 0) findings.push(finding(session, this.id, {
        suffix: "none", category: this.category, severity: Priority.HIGH, title: "Alterações sem validação registrada",
        description: "A fonte registra arquivos alterados e conhece a lista de validações, que está vazia.",
        evidence: [evidence(session, "filesChanged", changed.join(", ")), evidence(session, "validation", "known empty list")],
        recommendation: isDocsOnly(session) ? "Execute revisão do diff e verificação de links/formatação aplicável." : "Execute validações proporcionais ao projeto (ao menos testes relevantes e revisão do diff).",
        confidence: Confidence.HIGH
      }));
      if (!isDocsOnly(session) && changed.length && validations.length && !validations.some((v) => /test|build|lint|typecheck|smoke|e2e|integration/i.test(v))) findings.push(finding(session, this.id, {
        suffix: "weak", category: this.category, title: "Validação técnica limitada",
        description: "Há validação registrada, mas nenhum sinal de build, lint, typecheck ou teste para uma alteração de código.",
        evidence: validations.map((v) => evidence(session, "validation", v)),
        recommendation: "Adicione a menor combinação de checks capaz de detectar regressões no tipo de mudança realizado.", confidence: Confidence.MEDIUM
      }));
    }
    return findings;
  }
};

export function validationExpectations(session) {
  if (isDocsOnly(session)) return ["diff_review"];
  const task = `${textFor(session, "task")} ${textFor(session, "prompts")}`;
  const expected = ["diff_review", "tests"];
  if (/typescript|\bts\b|type/i.test(task)) expected.push("typecheck");
  if (/security|auth|permission|secret/i.test(task)) expected.push("security_review");
  if (/ui|browser|frontend|journey/i.test(task)) expected.push("smoke_or_e2e");
  return expected;
}
