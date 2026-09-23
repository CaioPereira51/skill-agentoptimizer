<div align="center">

# AgentOptimizer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Status](https://img.shields.io/badge/Status-Active-success.svg)]()

*Evidence-based audits for AI-assisted software development workflows.*

**Choose your language / Escolha seu idioma:**
[🇧🇷 Português (Brasil)](#-português-brasil) • [🇺🇸 English](#-english)

</div>

---

## 🇧🇷 Português (Brasil)

### Sobre o projeto

O **AgentOptimizer** analisa como desenvolvedores usam agentes de programação com IA. Ele audita prompts, contexto, decomposição de tarefas, especificações, validação, retrabalho, fluxos recorrentes e uso de agentes no Cursor, Codex, Claude Code e outras ferramentas.

Em vez de otimizar automaticamente um agente ou escolher modelos, o projeto produz achados e recomendações fundamentados nas evidências disponíveis nas sessões e no repositório.

### O que ele audita

- Qualidade de prompts, contexto, especificações e decomposição de tarefas.
- Evidências de validação, retrabalho e padrões recorrentes de fluxo.
- Histórico e tendências entre auditorias, incluindo recomendações acionáveis.
- Dados de Cursor, Codex, Claude Code, arquivos de sessão e fontes complementares como ccusage, How I Prompt, skillusage e traces OTLP.

### Como usar

Requer Node.js 20 ou superior. Para executar a partir deste repositório:

```bash
npm install
node bin/agent-optimizer.js audit --repository .
```

Para instalar a CLI no seu projeto e auditar o repositório atual:

```bash
npm install --save-dev @caiopereira51/agentoptimizer
npx agent-optimizer audit --repository .
```

Consulte todos os comandos e formatos de evidência aceitos com:

```bash
npx agent-optimizer --help
```

O Cursor pode ser auditado a partir de um export JSON, de um transcript Markdown ou de um export OTLP de logs e métricas:

```bash
npx agent-optimizer audit --cursor-transcript chat.md
npx agent-optimizer audit --cursor-otel cursor-otel.json
```

Para receber coaching sobre seus prompts ao longo do tempo, com consentimento explícito para ler o histórico local do Codex:

```bash
npx agent-optimizer coach --codex
```

O modo `coach` salva cada relatório em `.agentoptimizer/` para comparar execuções futuras. Ele descobre o histórico de prompts ou os logs locais de sessão do Codex; o relatório continua declarando quais campos a fonte não consegue provar.

### Referências

O projeto se inspira em ferramentas e pesquisas do ecossistema de agentes, incluindo [session-report](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/session-report/skills/session-report/SKILL.md), [How I Prompt](https://github.com/eeshansrivastava89/howiprompt), [skillusage](https://github.com/lovstudio/skillusage), [ccusage](https://github.com/ccusage/ccusage) e [OpenLIT](https://github.com/openlit/openlit).

> **Segurança:** `--plugin` executa JavaScript local arbitrário no processo do AgentOptimizer. Carregue apenas plugins nos quais você confia.

---

## 🇺🇸 English

### About

**AgentOptimizer analyzes how developers use AI coding agents.** It audits prompts, context, task decomposition, specifications, validation, rework, recurring workflows, and agent usage across Cursor, Codex, Claude Code, and other tools.

Rather than automatically optimizing an agent or selecting models, it produces findings and recommendations grounded in the available session and repository evidence.

### What it audits

- Prompt, context, specification, and task-decomposition quality.
- Validation evidence, rework, and recurring workflow patterns.
- Audit history and trends, with actionable recommendations.
- Data from Cursor, Codex, Claude Code, session files, and complementary sources such as ccusage, How I Prompt, skillusage, and OTLP traces.

### Usage

Requires Node.js 20 or later. To run from this repository:

```bash
npm install
node bin/agent-optimizer.js audit --repository .
```

To install the CLI in your project and audit the current repository:

```bash
npm install --save-dev @caiopereira51/agentoptimizer
npx agent-optimizer audit --repository .
```

See all commands and supported evidence formats:

```bash
npx agent-optimizer --help
```

Cursor can be audited from a JSON export, a Markdown transcript, or an OTLP logs-and-metrics export:

```bash
npx agent-optimizer audit --cursor-transcript chat.md
npx agent-optimizer audit --cursor-otel cursor-otel.json
```

For longitudinal coaching on your prompting, with explicit consent to read local Codex history:

```bash
npx agent-optimizer coach --codex
```

`coach` saves every report under `.agentoptimizer/` so later runs can be compared. It discovers Codex prompt history or local session logs and still states which fields the source cannot prove.

### References

The project draws on tools and research from the agent ecosystem, including [session-report](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/session-report/skills/session-report/SKILL.md), [How I Prompt](https://github.com/eeshansrivastava89/howiprompt), [skillusage](https://github.com/lovstudio/skillusage), [ccusage](https://github.com/ccusage/ccusage), and [OpenLIT](https://github.com/openlit/openlit).

> **Security:** `--plugin` executes arbitrary local JavaScript in the AgentOptimizer process. Load only plugins you trust.
