import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AtlasProposal } from './model.js';
import type { TranslationOutput } from './translation.js';
import {
  translatePendingReadmes,
  translatePendingReadmesFromEnv,
} from './translation.js';

function proposal(overrides: Partial<AtlasProposal> = {}): AtlasProposal {
  return {
    id: 'proposal-a',
    title: 'Proposal A',
    titleZh: '提案 A',
    titleTranslation: {
      sourceHash: 'b'.repeat(64),
      policyVersion: '1',
      model: 'test',
      translatedAt: '2026-08-08T00:00:00.000Z',
    },
    stage: 2,
    edition: null,
    status: 'active',
    repositoryUrl: 'https://github.com/tc39/proposal-a',
    syncedAt: '2026-08-08T00:00:00.000Z',
    readme: '# Proposal A',
    readmeHash: 'a'.repeat(64),
    readmeZh: null,
    translation: null,
    ...overrides,
  };
}

function output(id: string): TranslationOutput {
  return { markdown: `# ${id} 中文`, model: 'test-model' };
}

afterEach(() => vi.restoreAllMocks());

describe('README translation queue', () => {
  it('skips work when no API key is configured', async () => {
    const original = [proposal()];
    const run = await translatePendingReadmesFromEnv(original, {});

    expect(run.result.skipped).toBe(true);
    expect(run.proposals).toEqual(original);
  });

  it('only translates missing or stale entries and limits one run', async () => {
    const current = proposal({
      readmeZh: '# 已翻译',
      translation: {
        sourceHash: 'a'.repeat(64),
        policyVersion: '2',
        model: 'old-model',
        translatedAt: '2026-08-01T00:00:00.000Z',
      },
    });
    const translate = vi.fn(async (_readme: string, id: string) => output(id));
    const run = await translatePendingReadmes(
      [current, proposal({ id: 'proposal-b' }), proposal({ id: 'proposal-c' })],
      translate,
      { maxItems: 1 },
    );

    expect(run.result).toMatchObject({ pending: 1, translated: 1, failed: 0 });
    expect(translate).toHaveBeenCalledOnce();
    expect(run.proposals[0]?.readmeZh).toBe('# 已翻译');
    expect(run.proposals[1]).toMatchObject({
      readmeZh: '# proposal-b 中文',
      translation: { policyVersion: '2', model: 'test-model' },
    });
    expect(run.proposals[2]?.readmeZh).toBeNull();
  });

  it('retries transient errors but not permanent errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let transientAttempts = 0;
    const transient = await translatePendingReadmes(
      [proposal()],
      async (_readme, id) => {
        transientAttempts += 1;
        if (transientAttempts < 3) {
          throw Object.assign(new Error('rate limited'), { status: 429 });
        }
        return output(id);
      },
      { retries: 3, retryMinTimeout: 1 },
    );
    let permanentAttempts = 0;
    const permanent = await translatePendingReadmes(
      [proposal()],
      async () => {
        permanentAttempts += 1;
        throw Object.assign(new Error('unauthorized'), { status: 401 });
      },
      { retries: 3, retryMinTimeout: 1 },
    );

    expect(transientAttempts).toBe(3);
    expect(transient.result.translated).toBe(1);
    expect(permanentAttempts).toBe(1);
    expect(permanent.result.failed).toBe(1);
  });

  it('routes the documented Flash model through Responses without reasoning', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const bodies: unknown[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        bodies.push(JSON.parse(body) as unknown);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'response-1',
            object: 'response',
            created_at: 1,
            status: 'completed',
            model: 'deepseek-v4-flash',
            output: [
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
              output_tokens_details: { reasoning_tokens: 0 },
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

    try {
      const run = await translatePendingReadmesFromEnv([proposal()], {
        TRANSLATION_API_KEY: 'test-key',
        TRANSLATION_BASE_URL: `http://127.0.0.1:${address.port}`,
        TRANSLATION_MODEL: 'deepseek-v4-flash',
      });
      expect(run.result.translated).toBe(1);
      expect(run.proposals[0]?.readmeZh).toBe('# 中文译文');
      expect(bodies[0]).toMatchObject({
        model: 'deepseek-v4-flash',
        reasoning: { effort: 'none' },
        max_output_tokens: 384_000,
        store: false,
        instructions: expect.stringContaining('所有代码块必须逐字符保持不变'),
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
