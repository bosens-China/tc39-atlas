---
title: Connect an AI agent
description: Install the TC39 Atlas Skill so an AI agent can adopt stable ECMAScript capabilities within a project's compatibility contract.
---

# Connect an AI agent

TC39 Atlas provides the `modernize-ecmascript` Skill. It combines TC39 proposal maturity with the parser, transformer, and output target actually used by the target code to select safe syntax. When the user requests a specific API, it also checks the runtime, polyfills, and implementation leads from the proposal.

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

Writing or modifying JavaScript or TypeScript requires no extra instruction. The Skill considers only code newly written, currently being modified, or already touched by the current task, and uses the actual source transformation chain to adopt safe Stage 4 syntax. If the transformer or output target cannot be determined, it silently skips modernization without blocking the original task. Standard built-in APIs that require runtime support or a polyfill are not adopted automatically in this daily mode.

To write code for a specific environment or ECMAScript version, provide the constraints directly:

```text
Use modernize-ecmascript to write this module with stable ES2025 syntax while
keeping the emitted output at ES2020. If the current parser or transformer cannot
satisfy the request, show me the evidence and feasible options first, then let me
decide whether to change the syntax, build configuration, or output baseline.
```

For an explicit repository-wide review, use a prompt such as:

```text
Use modernize-ecmascript to review and modernize this repository.
First find candidates that Stage 4 syntax can simplify. Then identify the parser,
transformer, and output target actually used by the relevant files and keep only
changes that can be transformed safely. Do not raise the current compatibility
baseline. Report the plan before editing. Ask me one consolidated question only
when missing transformation or target constraints would change the conclusions.
```

The agent first finds candidates and then follows the real build commands to identify each relevant file's source transformation chain. In this example, it excludes candidates that require tool upgrades, a higher output baseline, a polyfill, or a Stage 3 capability, and reports those exclusions in the plan.

For a focused capability check, ask “Can this project safely use `Object.groupBy`?” The Skill reads the relevant proposal page and official repository for polyfill or implementation leads, then validates them against the target project's runtime and dependencies. It only investigates and answers at this point, asking one consolidated question only when missing constraints affect the conclusion. The user explicitly confirms before applying the capability, adding a polyfill, or changing the compatibility contract.

## Machine-readable documentation

The Skill uses [`llms.txt`](https://bosens-china.github.io/tc39-atlas/llms.txt) to find proposals. The agent reads this index first, then fetches proposal pages relevant to a user-requested capability or a review candidate. Official repositories, polyfills, transformation plugins, and userland implementations on those pages are investigation leads, not proof that the target project is compatible.
