---
name: integrate-ai-i18n
description: Integrate ai-i18n into Vite browser projects that use Vue 3, React 18+, or vanilla JavaScript and TypeScript. Use when installing or configuring @ai-i18n/vite, adding translation calls or virtual:ai-i18n imports, selecting framework mode, enabling auto imports or ESLint, configuring optional locale loading or LLM audit logs, reviewing Provider logs, or diagnosing an incomplete integration.
---

# Integrate ai-i18n

Preserve the project's package manager, Vite plugins, framework conventions, and configuration style.

## Read product documentation

Read `https://bosens-china.github.io/ai-i18n/llms.txt`, select the pages that match the current
framework and requested capability, and read only those pages. Use `llms-full.txt` only when the
index or targeted pages are unavailable; do not load the full corpus by default.

User-facing installation steps, configuration fields, Runtime APIs, framework examples, generated
files, and troubleshooting live in that documentation. Do not reproduce or infer those details from
this Skill. If deployed documentation conflicts with the target project's installed types, source,
or executable behavior, follow the target project and report the discrepancy.

## Inspect the target build

Read the target app's `package.json`, `vite.config.*`, TypeScript config, entry files, and framework
plugin setup. Confirm that the app matches the current public support requirements before editing it.

In a monorepo, identify one target Vite build. Ask the user only when more than one app is plausible,
or when a new setup has no source and target language decision that can be inferred from existing
configuration. Preserve configured values.

Use one `@ai-i18n/vite` registration, one framework mode, and one i18n directory per Vite build.
Treat reachable local workspace source as part of the consuming build. Do not create a separate
integration for a source-only package or rewrite CommonJS as an incidental migration.
If an existing `overrides.json` contains file-scoped rules, preserve its exact normalized POSIX paths
relative to this Vite root; never rewrite them to machine-specific absolute paths during integration.

Do not enable optional behavior by default. Keep explicit imports and omit automatic translation,
automatic imports, language persistence, locale loading, cache cleanup, HTML extraction, ESLint, and
test integration unless the user requests them. Do not remove an optional feature that is already
configured. When an optional feature is requested, read [Agent defaults for optional features](references/optional-features.md)
and the matching public documentation page.

This Skill owns package installation, Vite configuration, Runtime source integration, and integration
verification. Do not write translation or human review values as part of an integration-only task.
When the user also requests Agent-assisted translation or review, complete the Build first, then use
the `use-ai-i18n-mcp` Skill and its approval rules.

## Apply the smallest complete setup

1. Install the version required by the target repository; during the current prerelease, use the
   public documentation's alpha install command.
2. Register the plugin in the existing Vite config without disturbing other plugins.
3. Prefer framework detection and explicit Runtime imports. Override either only when the target
   setup or user request requires it.
4. Add the smallest representative translation call by following the selected framework page.
5. Integrate generated declarations and Git ignores exactly as described by the TypeScript and
   generated-files pages selected from `llms.txt`.
6. Preserve existing component style. Do not convert Vue Options API to Composition API solely for
   ai-i18n, and do not add React subscriptions to non-component utilities.

## Verify and report

Run the target app's lint, type check, relevant tests, and full Vite Build in proportion to the
change. Check installation, resolved framework mode, one Runtime translation call, generated
declarations, and the resolved output directory. Verify optional features only when requested or
already configured.

Report the selected app, changes made, commands run, remaining unsupported scope, and any decisions
that still need user input.
