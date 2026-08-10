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

可以直接描述希望完成的现代化任务。例如：

```text
请使用 modernize-ecmascript 检查当前仓库。
在不提高 Node.js、浏览器和 TypeScript 兼容基线的前提下，
找出可以改用最新稳定 ECMAScript 能力的代码。
修改前先汇报计划；如果目标环境不明确，先询问我。
```

Agent 会先识别单仓库或 monorepo 中受影响的应用、包和消费者。证据一致时，它会自动使用安全的 Stage 4 能力。如果需要提高兼容基线、升级工具、引入 polyfill 或使用 Stage 3 能力，它会先说明影响并征求你的选择。

## 机器可读文档

Skill 使用 [`llms.txt`](https://bosens-china.github.io/tc39-atlas/llms.txt) 查找提案。Agent 先读取这一份索引，再根据任务需要获取一个或多个提案 Markdown 页面。
