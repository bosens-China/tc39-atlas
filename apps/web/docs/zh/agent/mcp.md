---
title: 使用 MCP
description: 在支持 stdio MCP 的 AI Agent 中接入 TC39 Atlas。
---

# 使用 MCP

TC39 Atlas MCP 提供只读的提案搜索、详情读取以及按阶段和版本浏览资源。目前 npm 包尚未公开发布，可以先从仓库本地运行。

## 从仓库运行

```bash
git clone https://github.com/bosens-China/tc39-atlas.git
cd tc39-atlas
pnpm install
pnpm --filter @tc39-atlas/mcp build
```

然后在支持 stdio MCP 的 Agent 中指向构建产物：

```json
{
  "mcpServers": {
    "tc39-atlas": {
      "command": "node",
      "args": ["<仓库绝对路径>/apps/mcp/dist/index.mjs"]
    }
  }
}
```

## npm 发布后

包公开发布后，可以改用无需克隆仓库的配置：

```json
{
  "mcpServers": {
    "tc39-atlas": {
      "command": "npx",
      "args": ["-y", "@tc39-atlas/mcp@latest"]
    }
  }
}
```

需要 Node.js 22.14 或更高版本。Windows 客户端无法解析 `npx` 时，将命令改为 `npx.cmd`。
