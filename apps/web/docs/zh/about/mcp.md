---
title: 本地 MCP
---

# 本地 MCP

需要 Node.js 22.14 或更高版本。在支持 stdio MCP 的客户端中配置：

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

MCP 会在本地缓存数据，并在每次启动后静默检查网站数据是否更新。
