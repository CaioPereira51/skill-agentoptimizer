# Publishing

The project supports two independent distribution channels:

1. GitHub repository discovery for `npx skills add`.
2. The public npm package `@caiopereira51/agentoptimizer` for the CLI and JavaScript API.

## Prerequisites

- Use the public GitHub repository `CaioPereira51/skill-agentoptimizer`.
- Confirm that the npm account owns the `@caiopereira51` scope.
- Use Node.js 20 or newer.
- For GitHub Actions publishing, create an `npm` environment and add the `NPM_TOKEN` secret, or configure npm trusted publishing and update the workflow accordingly.

## First GitHub publication

From the project root:

```bash
git init
git add .
git commit -m "feat: initial AgentOptimizer release"
git branch -M main
git remote add origin https://github.com/CaioPereira51/skill-agentoptimizer.git
git push -u origin main
```

After the push, verify discovery without installing:

```bash
npx skills add CaioPereira51/skill-agentoptimizer --list
```

The output must contain exactly `agent-optimizer`.

## First npm publication

Authenticate and verify the package before publishing:

```bash
npm login
npm whoami
npm pack --dry-run
npm publish --access public
```

For subsequent releases, update `version` in `package.json`, create a matching GitHub release, and let `.github/workflows/publish.yml` publish it. Never reuse a version already published to npm.

## Consumer verification

```bash
npx skills add CaioPereira51/skill-agentoptimizer --skill agent-optimizer --agent cursor --yes
npm install --save-dev @caiopereira51/agentoptimizer
npx agent-optimizer --help
```

The GitHub command installs the Agent Skill. The npm command installs the executable Core. The installed skill invokes the npm package on demand.
