import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AtlasProposal } from './model.js';
import type { TranslationOutput } from './translation.js';
import {
  TRANSLATION_POLICY_VERSION,
  articleSourceHash,
  translatePendingProposals,
  translatePendingProposalsFromEnv,
  translationConfig,
} from './translation.js';

function proposal(overrides: Partial<AtlasProposal> = {}): AtlasProposal {
  return {
    id: 'proposal-a',
    title: 'Proposal A',
    titleZh: null,
    stage: 2,
    edition: null,
    status: 'active',
    repositoryUrl: 'https://github.com/tc39/proposal-a',
    syncedAt: '2026-08-08T00:00:00.000Z',
    readme: '# Proposal A',
    readmeHash: 'a'.repeat(64),
    readmeZh: null,
    quickReview: null,
    translation: null,
    ...overrides,
  };
}

function output(value: AtlasProposal): TranslationOutput {
  return {
    titleZh: `${value.title} 中文`,
    readmeZh: value.readme ? `# ${value.id} 中文` : '',
    quickReview: {
      en: `${value.id} quick review.`,
      zh: `${value.id} 快速审查。`,
    },
    model: 'test-model',
  };
}

function translatedProposal(): AtlasProposal {
  const value = proposal();
  return {
    ...value,
    titleZh: '提案 A',
    readmeZh: '# 已翻译',
    quickReview: { en: 'Quick review.', zh: '快速审查。' },
    translation: {
      sourceHash: articleSourceHash(value),
      policyVersion: TRANSLATION_POLICY_VERSION,
      model: 'old-model',
      translatedAt: '2026-08-01T00:00:00.000Z',
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('proposal translation queue', () => {
  it('uses DeepSeek defaults while retaining explicit OpenAI compatibility', () => {
    expect(translationConfig({ DEEPSEEK_API_KEY: 'test-key' })).toMatchObject({
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      concurrency: 10,
    });
    expect(translationConfig({ OPENAI_API_KEY: 'test-key' })).toMatchObject({
      model: 'gpt-5.6-luna',
    });
    expect(
      translationConfig({ OPENAI_API_KEY: 'test-key' }),
    ).not.toHaveProperty('baseURL');
  });

  it('reports pending work when no API key is configured', async () => {
    const original = [proposal()];
    const run = await translatePendingProposalsFromEnv(original, {});

    expect(run.result).toMatchObject({ pending: 1, skipped: true });
    expect(run.proposals).toEqual(original);
  });

  it('reuses complete article output and limits one run', async () => {
    const translate = vi.fn(async (value: AtlasProposal) => output(value));
    const run = await translatePendingProposals(
      [
        translatedProposal(),
        proposal({ id: 'proposal-b' }),
        proposal({ id: 'proposal-c' }),
      ],
      translate,
      { maxItems: 1 },
    );

    expect(run.result).toMatchObject({ pending: 1, translated: 1, failed: 0 });
    expect(translate).toHaveBeenCalledOnce();
    expect(run.proposals[0]?.readmeZh).toBe('# 已翻译');
    expect(run.proposals[1]).toMatchObject({
      titleZh: 'Proposal A 中文',
      readmeZh: '# proposal-b 中文',
      quickReview: { en: 'proposal-b quick review.' },
      translation: {
        policyVersion: TRANSLATION_POLICY_VERSION,
        model: 'test-model',
      },
    });
    expect(run.proposals[2]?.readmeZh).toBeNull();
  });

  it('retries transient errors but not permanent errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let transientAttempts = 0;
    const transient = await translatePendingProposals(
      [proposal()],
      async (value) => {
        transientAttempts += 1;
        if (transientAttempts < 3) {
          throw Object.assign(new Error('rate limited'), { status: 429 });
        }
        return output(value);
      },
      { retries: 3, retryMinTimeout: 1 },
    );
    let permanentAttempts = 0;
    const permanent = await translatePendingProposals(
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

  it('returns one structured article response and then makes no request', async () => {
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
                    text: `\`\`\`json\n${JSON.stringify({
                      titleZh: '提案 A',
                      readmeZh: '# 中文译文',
                      quickReview: {
                        en: 'A short English review.',
                        zh: '简短的中文审查。',
                      },
                    })}\n\`\`\``,
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
      const env = {
        TRANSLATION_API_KEY: 'test-key',
        TRANSLATION_BASE_URL: `http://127.0.0.1:${address.port}`,
        TRANSLATION_MODEL: 'deepseek-v4-flash',
      };
      const run = await translatePendingProposalsFromEnv([proposal()], env);
      expect(run.proposals[0]).toMatchObject({
        titleZh: '提案 A',
        readmeZh: '# 中文译文',
        quickReview: { en: 'A short English review.' },
      });
      expect(bodies[0]).toMatchObject({
        model: 'deepseek-v4-flash',
        reasoning: { effort: 'none' },
        max_output_tokens: 384_000,
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'proposal_translation',
            strict: true,
          },
        },
      });

      const repeated = await translatePendingProposalsFromEnv(
        run.proposals,
        env,
      );
      expect(repeated.result).toMatchObject({ pending: 0, translated: 0 });
      expect(bodies).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
