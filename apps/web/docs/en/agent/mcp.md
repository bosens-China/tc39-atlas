---
title: Use MCP
description: Connect TC39 Atlas to an AI agent through stdio MCP.
---

# Use MCP

TC39 Atlas MCP provides read-only proposal search, proposal details, and resources grouped by stage and edition. The npm package is not public yet, so run it from the repository for now.

## Run from the repository

```bash
git clone https://github.com/bosens-China/tc39-atlas.git
cd tc39-atlas
pnpm install
pnpm --filter @tc39-atlas/mcp build
```

Point your stdio MCP client at the build output:

```json
{
  "mcpServers": {
    "tc39-atlas": {
      "command": "node",
      "args": ["<absolute-repository-path>/apps/mcp/dist/index.mjs"]
    }
  }
}
```

## After npm publishing

Once the package is public, use this configuration without cloning the repository:

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

Node.js 22.14 or newer is required. On Windows, use `npx.cmd` when the client cannot resolve `npx`.
