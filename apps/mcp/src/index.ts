import { serve } from '@hono/node-server';
import {
  fetchTc39Proposals,
  saveProposals,
  translatePendingReadmesFromEnv,
} from '@tc39-atlas/core';

import { createDefaultApp } from './server.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 43127);
const { app, close, database } = createDefaultApp();

const runSync = async () => {
  try {
    const proposals = await fetchTc39Proposals();
    const result = await saveProposals(database.db, proposals);
    console.log(
      `Synced ${result.proposals} proposals, recorded ${result.changes} changes`,
    );
    try {
      const translation = await translatePendingReadmesFromEnv(database.db);
      console.log(
        translation.skipped
          ? 'Translation skipped: no API key configured'
          : `Translated ${translation.translated}/${translation.pending} proposals, ${translation.failed} failed, ${translation.stale} became stale`,
      );
    } catch (error: unknown) {
      console.error('README translation failed', error);
    }
  } catch (error: unknown) {
    console.error('TC39 sync failed', error);
  }
};

if (process.env.SYNC_ON_START !== 'false') void runSync();
const interval = setInterval(runSync, 24 * 60 * 60 * 1000);

const httpServer = serve({ fetch: app.fetch, hostname: host, port }, () => {
  console.log(`TC39 Atlas MCP listening on http://${host}:${port}/mcp`);
});

const shutdown = async () => {
  clearInterval(interval);
  httpServer.close();
  await close();
  await database.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
