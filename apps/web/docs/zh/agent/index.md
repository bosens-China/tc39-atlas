---
title: 接入 AI Agent
description: 安装 TC39 Atlas Skill，让 AI Agent 在项目兼容范围内使用最新稳定的 ECMAScript 能力。
---

# 接入 AI Agent

TC39 Atlas 提供 `modernize-ecmascript` Skill。它会结合 TC39 提案成熟度与目标项目的 TypeScript、构建工具、Node.js、浏览器和部署基线，选择当前项目可以安全使用的 ECMAScript 能力。

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

编写或修改 JavaScript、TypeScript 时无需额外指令。Skill 只会在当前任务中新写、正在修改或已经触及的代码区域内尝试采用安全、稳定的能力；如果无法从项目证据确定兼容基线，它会静默跳过现代化判断，不阻塞原任务。

如果希望显式审查整个仓库，可以这样描述：

```text
请使用 modernize-ecmascript 审查并改造当前仓库。
先从 Stage 4 能力中定位可以替代冗余写法或手写实现的候选，
再结合实际的 TypeScript、构建目标、Node.js、浏览器和部署环境
筛选安全变更，不要提高现有兼容基线。
修改前先汇报计划；只有缺失约束确实会改变候选结论时，
再集中询问我。
```

Agent 会先识别单仓库或 monorepo 中受影响的应用、包和消费者，定位待验证候选，再过滤出兼容的 Stage 4 能力。在这个示例中，需要提高兼容基线、升级工具、引入 polyfill 或使用 Stage 3 能力的候选会被排除，并在修改计划中说明。

如果只想判断某项能力，可以直接询问“当前项目能安全使用 `Object.groupBy` 吗？”。Skill 只会检查这一项能力，不会自动扩大为仓库级审查。

## 机器可读文档

Skill 使用 [`llms.txt`](https://bosens-china.github.io/tc39-atlas/llms.txt) 查找提案。Agent 先读取这一份索引，再根据任务需要获取一个或多个提案 Markdown 页面。
