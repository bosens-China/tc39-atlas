---
title: Connect an AI agent
description: Install the TC39 Atlas Skill so an AI agent can adopt stable ECMAScript capabilities within a project's compatibility contract.
---

# Connect an AI agent

TC39 Atlas provides the `modernize-ecmascript` Skill. It combines TC39 proposal maturity with the target project's TypeScript, build tool, Node.js, browser, and deployment baselines to select ECMAScript capabilities that are safe for the project.

## Install the Skill

Run the following command to discover Skills from the TC39 Atlas repository:

```bash
npx skills add https://github.com/bosens-China/tc39-atlas
```

Select `modernize-ecmascript` and the AI agent where it should be installed. To skip Skill selection, specify its name directly:

```bash
npx skills add https://github.com/bosens-China/tc39-atlas --skill modernize-ecmascript
```

After installation, start a new AI agent session so the Skill is loaded.

## Use it in an AI agent

Describe the modernization task directly. For example:

```text
Use modernize-ecmascript to inspect this repository.
Find code that can use the newest stable ECMAScript capabilities without raising
the current Node.js, browser, or TypeScript compatibility baselines.
Report the plan before editing, and ask me first if the target environment is unclear.
```

The agent first identifies the affected app, package, and consumers in a single repository or monorepo. It can automatically use safe Stage 4 capabilities when the evidence is consistent. It asks before raising a compatibility baseline, upgrading tools, adding a polyfill, or adopting a Stage 3 capability.

## Machine-readable documentation

The Skill uses [`llms.txt`](https://bosens-china.github.io/tc39-atlas/llms.txt) to find proposals. The agent reads this single index first, then fetches one or more proposal Markdown pages as needed.
