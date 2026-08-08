#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { openDatasetStore } from './cache.js';
import { createTc39McpServer } from './server.js';

try {
  const { store, refresh } = await openDatasetStore();
  void refresh;
  const handle = serveStdio(() => createTc39McpServer(store));
  console.error('TC39 Atlas MCP is listening on stdio');

  const shutdown = () => void handle.close();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch (error: unknown) {
  console.error(
    `TC39 Atlas MCP could not load its dataset: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
