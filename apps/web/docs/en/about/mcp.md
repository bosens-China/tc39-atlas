---
title: Local MCP server
---

# Local MCP server

Node.js 22.14 or newer is required. Add the following stdio server to your MCP client:

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

The server caches the dataset locally and silently checks for published data updates after startup.
