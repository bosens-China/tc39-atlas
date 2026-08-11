---
title: 接入 AI Agent
description: 安装 TC39 Atlas Skill，让 AI Agent 在项目兼容范围内使用最新稳定的 ECMAScript 能力。
---

# 接入 AI Agent

TC39 Atlas 提供 `modernize-ecmascript` Skill。它会结合 TC39 提案成熟度与目标代码真实经过的解析器、转换器和输出目标，选择可以安全使用的新语法；用户指定某项 API 时，还会继续检查运行时、polyfill 和提案实现线索。

## 安装 Skill

运行以下命令，从 TC39 Atlas 仓库发现 Skill：

```bash
npx skills add https://github.com/bosens-China/tc39-atlas
```

在选择列表中选择 `modernize-ecmascript` 和需要安装的 AI Agent。如果希望跳过 Skill 选择，可以直接指定名称：

```bash
npx skills add https://github.com/bosens-China/tc39-atlas --skill modernize-ecmascript
```

安装完成后，重新打开 AI Agent 会话，让 Agent 加载新 Skill。

## 在 AI Agent 中使用

编写或修改 JavaScript、TypeScript 时无需额外指令。Skill 只会在当前任务中新写、正在修改或已经触及的代码区域内，根据实际源码转换链尝试采用安全、稳定的 Stage 4 语法；如果无法确定转换器或输出目标，它会静默跳过现代化判断，不阻塞原任务。依赖运行时实现或 polyfill 的标准内置 API 不会在日常模式中自动采用。

如果希望按指定环境或 ES 版本编写代码，可以直接给出约束：

```text
请使用 modernize-ecmascript 按 ES2025 的稳定语法编写这个模块，
项目产物仍需输出为 ES2020。
如果当前解析器或转换器无法满足要求，先展示证据和可行选项，
由我确认是否调整语法、构建配置或输出基线。
```

如果希望显式审查整个仓库，可以这样描述：

```text
请使用 modernize-ecmascript 审查并改造当前仓库。
先定位可以使用 Stage 4 语法简化的候选，
再查明相关文件实际使用的解析器、转换器和输出目标，
筛选能被安全转换的变更，不要提高现有兼容基线。
修改前先汇报计划；只有缺失的转换或目标约束确实会改变结论时，
再集中询问我。
```

Agent 会先定位待验证候选，再沿实际构建命令识别相关文件的源码转换链。在这个示例中，需要升级工具、提高输出基线、引入 polyfill 或使用 Stage 3 能力的候选会被排除，并在修改计划中说明。

如果只想判断某项能力，可以直接询问“当前项目能安全使用 `Object.groupBy` 吗？”。Skill 会读取对应提案页和官方仓库，查找 polyfill 或实现线索，再回到目标项目验证运行时与依赖。此时只调查并回答，不修改代码；只有缺失约束确实影响结论时才会集中询问。需要应用能力、新增 polyfill 或改变兼容性契约时，再由用户明确确认。

## 机器可读文档

Skill 使用 [`llms.txt`](https://bosens-china.github.io/tc39-atlas/llms.txt) 查找提案。Agent 先读取这一份索引，再按用户指定的能力或代码审查候选获取相关提案页面。页面中的官方仓库、polyfill、转换插件和用户态实现是调查线索，不单独证明目标项目兼容。
