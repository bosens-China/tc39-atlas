import { createServer } from 'node:http';

import { drizzle } from 'drizzle-orm/pg-proxy';
import type { Database } from './database.js';
import * as schema from './schema.js';
import type { TranslationOutput } from './translation.js';
import {
  translatePendingReadmes,
  translatePendingReadmesFromEnv,
} from './translation.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface Candidate {
  id: string;
  readme: string;
  readmeHash: string;
}

function fakeDatabase(candidates: Candidate[], updateSucceeds = true) {
  const writes: Array<Record<string, unknown>> = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: async () => candidates }),
      }),
    }),
    update: () => ({
      set: (value: Record<string, unknown>) => {
        writes.push(value);
        return {
          where: () => ({
            returning: async () => (updateSucceeds ? [{ id: 'saved' }] : []),
          }),
        };
      },
    }),
  } as unknown as Database;
  return { db, writes };
}

function output(id: string): TranslationOutput {
  return { markdown: `# ${id} 中文`, model: 'test-model' };
}

afterEach(() => vi.restoreAllMocks());

describe('README translation queue', () => {
  it('skips all database work when no API key is configured', async () => {
    const select = vi.fn();
    const result = await translatePendingReadmesFromEnv(
      { select } as unknown as Database,
      {},
    );

    expect(result.skipped).toBe(true);
    expect(select).not.toHaveBeenCalled();
  });

  it('queues only missing or stale README and policy hashes', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const proxy = drizzle(
      async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
      { schema },
    );
    const translate = vi.fn(async () => output('unused'));

    const result = await translatePendingReadmes(
      proxy as unknown as Database,
      translate,
    );

    expect(result.pending).toBe(0);
    expect(translate).not.toHaveBeenCalled();
    expect(queries[0]?.sql).toContain('readme_zh_source_hash');
    expect(queries[0]?.sql).toContain('translation_policy_version');
    expect(queries[0]?.params).toEqual(expect.arrayContaining(['', '2']));
  });

  it('limits a translation run without changing batch semantics', async () => {
    const candidates = Array.from({ length: 3 }, (_, index) => ({
      id: `proposal-${index}`,
      readme: `# Proposal ${index}`,
      readmeHash: `hash-${index}`,
    }));
    const { db, writes } = fakeDatabase(candidates);
    const translate = vi.fn(async (_readme: string, id: string) => output(id));

    const result = await translatePendingReadmes(db, translate, {
      maxItems: 2,
    });

    expect(result.pending).toBe(2);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(writes).toHaveLength(2);
  });

  it('routes compatible models and disables Flash reasoning', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const bodies: unknown[] = [];
    const paths: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        bodies.push(JSON.parse(body) as unknown);
        paths.push(request.url);
        response.writeHead(200, { 'content-type': 'application/json' });
        if (request.url === '/chat/completions') {
          response.end(
            JSON.stringify({
              id: 'chat-1',
              object: 'chat.completion',
              created: 1,
              model: 'deepseek-v4-pro',
              choices: [
                {
                  index: 0,
                  finish_reason: 'stop',
                  message: {
                    role: 'assistant',
                    reasoning_content: 'private reasoning',
                    content: '# Pro 中文译文',
                  },
                },
              ],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
                prompt_cache_hit_tokens: 7,
                prompt_tokens_details: { cached_tokens: 2 },
                completion_tokens_details: { reasoning_tokens: 5 },
              },
            }),
          );
          return;
        }
        response.end(
          JSON.stringify({
            id: 'response-1',
            object: 'response',
            created_at: 1,
            status: 'completed',
            model: 'deepseek-v4-flash',
            output: [
              {
                id: 'reasoning-1',
                type: 'reasoning',
                status: 'completed',
                content: [
                  { type: 'reasoning_text', text: 'translation reasoning' },
                ],
                summary: [],
              },
              {
                id: 'message-1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: '# 中文译文',
                    annotations: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 10,
              input_tokens_details: { cached_tokens: 2 },
              output_tokens: 20,
              output_tokens_details: { reasoning_tokens: 5 },
              total_tokens: 30,
            },
          }),
        );
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not bind to TCP');
    }
    const database = fakeDatabase([
      { id: 'proposal', readme: '# Proposal', readmeHash: 'hash' },
    ]);

    try {
      const result = await translatePendingReadmesFromEnv(database.db, {
        TRANSLATION_API_KEY: 'test-key',
        TRANSLATION_BASE_URL: `http://127.0.0.1:${address.port}`,
        TRANSLATION_MODEL: 'deepseek-v4-flash',
      });

      expect(result.translated).toBe(1);
      expect(database.writes[0]).toMatchObject({
        readmeZh: '# 中文译文',
        translationModel: 'deepseek-v4-flash',
      });
      expect(bodies[0]).toMatchObject({
        model: 'deepseek-v4-flash',
        reasoning: { effort: 'none' },
        max_output_tokens: 384_000,
        store: false,
        instructions: expect.stringContaining('所有代码块必须逐字符保持不变'),
        input: expect.stringContaining('<source_markdown>\n# Proposal'),
      });
      const proDatabase = fakeDatabase([
        { id: 'proposal-pro', readme: '# Proposal', readmeHash: 'hash' },
      ]);
      const proResult = await translatePendingReadmesFromEnv(proDatabase.db, {
        TRANSLATION_API_KEY: 'test-key',
        TRANSLATION_BASE_URL: `http://127.0.0.1:${address.port}`,
        TRANSLATION_MODEL: 'deepseek-v4-pro',
      });

      expect(proResult.translated).toBe(1);
      expect(proDatabase.writes[0]).toMatchObject({
        readmeZh: '# Pro 中文译文',
        translationModel: 'deepseek-v4-pro',
      });
      expect(paths).toEqual(['/responses', '/chat/completions']);
      expect(bodies[1]).toMatchObject({
        model: 'deepseek-v4-pro',
        messages: [
          {
            role: 'system',
            content: expect.stringMatching(/^Formatting re-enabled/),
          },
          {
            role: 'user',
            content: expect.stringContaining('<source_markdown>\n# Proposal'),
          },
        ],
      });
      expect(bodies[1]).not.toHaveProperty('thinking');
      expect(bodies[1]).not.toHaveProperty('reasoning_effort');
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('"cachedTokens":7'),
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('runs each 100-item batch with concurrency 100', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const candidates = Array.from({ length: 101 }, (_, index) => ({
      id: `proposal-${index}`,
      readme: `# Proposal ${index}`,
      readmeHash: `hash-${index}`,
    }));
    const { db, writes } = fakeDatabase(candidates);
    let active = 0;
    let maximumActive = 0;
    let started = 0;
    let notifyStarted: (() => void) | undefined;
    let releaseBatch: (() => void) | undefined;
    const firstBatchStarted = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const batchGate = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });

    const run = translatePendingReadmes(
      db,
      async (_readme, id) => {
        active += 1;
        started += 1;
        maximumActive = Math.max(maximumActive, active);
        if (started === 100) notifyStarted?.();
        if (started <= 100) await batchGate;
        active -= 1;
        return output(id);
      },
      { retryMinTimeout: 1 },
    );

    await firstBatchStarted;
    expect(started).toBe(100);
    expect(maximumActive).toBe(100);
    releaseBatch?.();

    const result = await run;
    expect(result).toMatchObject({
      pending: 101,
      translated: 101,
      failed: 0,
      stale: 0,
    });
    expect(writes).toHaveLength(101);
    expect(writes[0]).toMatchObject({ readmeZh: '# proposal-0 中文' });
  });

  it('retries 429 responses three times inside one concurrency slot', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db } = fakeDatabase([
      { id: 'retry-me', readme: '# Retry', readmeHash: 'hash' },
    ]);
    let attempts = 0;

    const result = await translatePendingReadmes(
      db,
      async (_readme, id) => {
        attempts += 1;
        if (attempts < 4) {
          throw Object.assign(new Error('rate limited'), { status: 429 });
        }
        return output(id);
      },
      { retryMinTimeout: 1 },
    );

    expect(attempts).toBe(4);
    expect(result.translated).toBe(1);
  });

  it('does not retry permanent errors or save a stale translation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const candidate = { id: 'proposal', readme: '# A', readmeHash: 'hash' };
    const failedDatabase = fakeDatabase([candidate]);
    let attempts = 0;
    const failed = await translatePendingReadmes(
      failedDatabase.db,
      async () => {
        attempts += 1;
        throw Object.assign(new Error('unauthorized'), { status: 401 });
      },
      { retryMinTimeout: 1 },
    );

    const staleDatabase = fakeDatabase([candidate], false);
    const stale = await translatePendingReadmes(
      staleDatabase.db,
      async (_readme, id) => output(id),
      { retryMinTimeout: 1 },
    );

    expect(attempts).toBe(1);
    expect(failed.failed).toBe(1);
    expect(failedDatabase.writes).toHaveLength(0);
    expect(stale.stale).toBe(1);
  });
});
