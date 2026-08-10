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

Writing or modifying JavaScript or TypeScript requires no extra instruction. The Skill considers only code newly written, currently being modified, or already touched by the current task, and adopts stable capabilities when the project's compatibility evidence is sufficient. If the baseline cannot be determined, it silently skips modernization without blocking the original task.

For an explicit repository-wide review, use a prompt such as:

```text
Use modernize-ecmascript to review and modernize this repository.
First find Stage 4 candidates that can replace redundant patterns or handwritten
helpers. Then filter them against the actual TypeScript, build targets, Node.js,
browser, and deployment environments. Do not raise the current compatibility
baseline. Report the plan before editing. Ask me one consolidated question only
when missing constraints would actually change the candidate decisions.
```

The agent first identifies the affected apps, packages, and consumers in a single repository or monorepo, finds candidates, and then filters for compatible Stage 4 capabilities. In this example, it excludes candidates that require a higher compatibility baseline, tool upgrades, a polyfill, or a Stage 3 capability, and reports those exclusions in the plan.

For a focused capability check, ask “Can this project safely use `Object.groupBy`?” The Skill checks only that capability and does not expand into a repository-wide review.

## Machine-readable documentation

The Skill uses [`llms.txt`](https://bosens-china.github.io/tc39-atlas/llms.txt) to find proposals. The agent reads this single index first, then fetches one or more proposal Markdown pages as needed.
