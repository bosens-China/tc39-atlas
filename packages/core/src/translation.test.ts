import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AtlasProposal } from './model.js';
import type { TranslationOutput } from './translation.js';
import {
  TRANSLATION_POLICY_VERSION,
  articleSourceHash,
  assertTranslationSucceeded,
  translatePendingProposals,
  translatePendingProposalsFromEnv,
  translationConfig,
  translationFingerprint,
} from './translation.js';

const TEST_FINGERPRINT = translationFingerprint({
  DEEPSEEK_API_KEY: 'test-key',
});

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
      translatorFingerprint: TEST_FINGERPRINT,
      model: 'old-model',
      translatedAt: '2026-08-01T00:00:00.000Z',
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('proposal translation queue', () => {
  it('uses DeepSeek defaults', () => {
    const config = translationConfig({ DEEPSEEK_API_KEY: 'test-key' });
    expect(config).toMatchObject({
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      concurrency: 10,
    });
    expect(config).not.toHaveProperty('maxOutputTokens');
    expect(config).not.toHaveProperty('requestTimeoutMs');
  });

  it('accepts repository overrides and ignores empty values', () => {
    expect(
      translationConfig({
        DEEPSEEK_API_KEY: 'test-key',
        TRANSLATION_BASE_URL: 'https://openai-compatible.example/v1',
        TRANSLATION_MODEL: 'compatible-model',
        TRANSLATION_MAX_OUTPUT_TOKENS: '64',
      }),
    ).toMatchObject({
      baseURL: 'https://openai-compatible.example/v1',
      model: 'compatible-model',
      maxOutputTokens: 64,
    });
    expect(
      translationConfig({
        DEEPSEEK_API_KEY: 'test-key',
        TRANSLATION_BASE_URL: '',
        TRANSLATION_MODEL: '',
      }),
    ).toMatchObject({
      apiKey: 'test-key',
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
    });
  });

  it('fingerprints result-affecting translation settings', () => {
    const base = translationFingerprint({
      DEEPSEEK_API_KEY: 'test-key',
    });

    expect(
      translationFingerprint({
        DEEPSEEK_API_KEY: 'test-key',
        TRANSLATION_CONCURRENCY: '2',
      }),
    ).toBe(base);
    expect(
      translationFingerprint({
        DEEPSEEK_API_KEY: 'test-key',
        TRANSLATION_MODEL: 'another-model',
      }),
    ).not.toBe(base);
    expect(
      translationFingerprint({
        DEEPSEEK_API_KEY: 'test-key',
        TRANSLATION_MAX_OUTPUT_TOKENS: '64',
      }),
    ).not.toBe(base);
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
      { maxItems: 1, fingerprint: TEST_FINGERPRINT },
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

  it('retranslates complete output when the translator fingerprint changes', async () => {
    const translate = vi.fn(async (value: AtlasProposal) => output(value));
    const nextFingerprint = translationFingerprint({
      DEEPSEEK_API_KEY: 'test-key',
      TRANSLATION_MODEL: 'next-model',
    });

    const run = await translatePendingProposals(
      [translatedProposal()],
      translate,
      { fingerprint: nextFingerprint },
    );

    expect(translate).toHaveBeenCalledOnce();
    expect(run.proposals[0]?.translation?.translatorFingerprint).toBe(
      nextFingerprint,
    );
  });

  it('leaves provider retries to LangChain and isolates final failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const translate = vi.fn(async () => {
      throw Object.assign(new Error('rate limited'), { status: 429 });
    });
    const run = await translatePendingProposals([proposal()], translate);

    expect(translate).toHaveBeenCalledOnce();
    expect(run.result.failed).toBe(1);
    expect(() => assertTranslationSucceeded(run.result)).toThrow(
      'dataset was not updated',
    );
  });

  it('uses LangChain JSON Mode for default and compatible models', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorLog = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const bodies: unknown[] = [];
    const paths: string[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        const parsedBody = JSON.parse(body) as { model?: string };
        bodies.push(parsedBody);
        paths.push(request.url ?? '');
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'chat-1',
            object: 'chat.completion',
            created: 1,
            model: 'compatible-model',
            choices: [
              {
                index: 0,
                finish_reason:
                  parsedBody.model === 'length-model' ? 'length' : 'stop',
                message: {
                  role: 'assistant',
                  content:
                    parsedBody.model === 'invalid-model'
                      ? '{"titleZh":'
                      : JSON.stringify({
                          titleZh: '提案 A',
                          readmeZh: '# 中文译文',
                          quickReview: {
                            en: 'A short English review.',
                            zh: '简短的中文审查。',
                          },
                        }),
                },
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
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
        DEEPSEEK_API_KEY: 'test-key',
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
        response_format: { type: 'json_object' },
      });
      expect(bodies[0]).not.toHaveProperty('max_tokens');
      expect(bodies[0]).not.toHaveProperty('store');

      const compatibleRun = await translatePendingProposalsFromEnv(
        [proposal()],
        {
          ...env,
          TRANSLATION_MODEL: 'compatible-model',
          TRANSLATION_MAX_OUTPUT_TOKENS: '64',
        },
      );
      expect(compatibleRun.result.translated).toBe(1);
      expect(bodies[1]).toMatchObject({
        model: 'compatible-model',
        max_tokens: 64,
        response_format: { type: 'json_object' },
      });
      expect(JSON.stringify(bodies[0])).toContain('结构示例');

      const truncatedRun = await translatePendingProposalsFromEnv(
        [proposal()],
        { ...env, TRANSLATION_MODEL: 'length-model' },
      );
      expect(truncatedRun.result.failed).toBe(1);
      expect(JSON.stringify(errorLog.mock.calls)).toContain(
        'finish_reason is length',
      );

      const invalidRun = await translatePendingProposalsFromEnv([proposal()], {
        ...env,
        TRANSLATION_MODEL: 'invalid-model',
      });
      expect(invalidRun.result.failed).toBe(1);
      expect(JSON.stringify(errorLog.mock.calls)).toContain(
        'does not match the schema',
      );
      expect(paths).toEqual([
        '/chat/completions',
        '/chat/completions',
        '/chat/completions',
        '/chat/completions',
      ]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
