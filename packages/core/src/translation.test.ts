import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AtlasProposal } from './model.js';
import type { TranslationOutput } from './translation.js';
import {
  TRANSLATION_CONTRACT_VERSION,
  translatePendingProposals,
  translatePendingProposalsFromEnv,
  translationContentHash,
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
    overview: null,
    translation: null,
    ...overrides,
  };
}

function output(value: AtlasProposal): TranslationOutput {
  return {
    titleZh: `${value.title} 中文`,
    readmeZh: value.readme ? `# ${value.id} 中文` : '',
    overview: {
      en: `${value.id} proposal overview.`,
      zh: `${value.id} 提案速览。`,
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
    overview: { en: 'Proposal overview.', zh: '提案速览。' },
    translation: {
      sourceHash: translationContentHash(value),
      policyVersion: TRANSLATION_CONTRACT_VERSION,
      translatorFingerprint: TEST_FINGERPRINT,
      model: 'old-model',
      translatedAt: '2026-08-01T00:00:00.000Z',
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('proposal translation queue', () => {
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
      overview: { en: 'proposal-b proposal overview.' },
      translation: {
        policyVersion: TRANSLATION_CONTRACT_VERSION,
        model: 'test-model',
      },
    });
    expect(run.proposals[2]?.readmeZh).toBeNull();
  });

  it('keeps an article cache hit when the translator fingerprint changes', async () => {
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

    expect(translate).not.toHaveBeenCalled();
    expect(run.proposals[0]?.translation?.translatorFingerprint).toBe(
      TEST_FINGERPRINT,
    );
  });

  it('keeps cached output when only proposal maturity changes', async () => {
    const translate = vi.fn(async (value: AtlasProposal) => output(value));
    const changed = { ...translatedProposal(), stage: 2.7 as const };

    const run = await translatePendingProposals([changed], translate);

    expect(translate).not.toHaveBeenCalled();
    expect(run.result.translated).toBe(0);
    expect(run.proposals[0]?.translation?.sourceHash).toBe(
      translationContentHash(changed),
    );
  });

  it('invalidates cached output when README content changes', async () => {
    const translate = vi.fn(async (value: AtlasProposal) => output(value));
    const changed = {
      ...translatedProposal(),
      readme: '# Proposal A changed',
    };

    const run = await translatePendingProposals([changed], translate);

    expect(translate).toHaveBeenCalledOnce();
    expect(run.result.translated).toBe(1);
    expect(run.proposals[0]?.translation?.sourceHash).toBe(
      translationContentHash(changed),
    );
  });

  it('keeps successful article results when another article fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const translate = vi.fn(async (value: AtlasProposal) => {
      if (value.id === 'proposal-b') {
        throw Object.assign(new Error('rate limited'), { status: 429 });
      }
      return output(value);
    });
    const run = await translatePendingProposals(
      [proposal(), proposal({ id: 'proposal-b' })],
      translate,
    );

    expect(translate).toHaveBeenCalledTimes(2);
    expect(run.result).toMatchObject({ translated: 1, failed: 1 });
    expect(run.proposals[0]?.translation).not.toBeNull();
    expect(run.proposals[1]?.translation).toBeNull();

    const retry = vi.fn(async (value: AtlasProposal) => output(value));
    const nextRun = await translatePendingProposals(run.proposals, retry);
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'proposal-b' }),
    );
    expect(nextRun.result).toMatchObject({ pending: 1, translated: 1 });
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
        const parsedBody = JSON.parse(body) as {
          model?: string;
          temperature?: number;
        };
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
                          overview:
                            parsedBody.model === 'maturity-model'
                              ? {
                                  en: 'The proposal is currently at Stage 3.',
                                  zh: '该提案目前处于第 3 阶段。',
                                }
                              : {
                                  en: 'A short English overview.',
                                  zh: '简短的中文速览。',
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
        overview: { en: 'A short English overview.' },
      });
      expect(bodies[0]).toMatchObject({
        model: 'deepseek-v4-flash',
        temperature: 1,
        response_format: { type: 'json_object' },
      });
      expect(bodies[0]).not.toHaveProperty('max_tokens');
      expect(bodies[0]).not.toHaveProperty('store');
      const requestBody = bodies[0] as {
        messages?: Array<{ role?: string; content?: string }>;
      };
      const userInput = requestBody.messages?.find(
        (message) => message.role === 'user',
      )?.content;
      expect(userInput).toContain('"title":"Proposal A"');
      expect(userInput).toContain('"readme":"# Proposal A"');
      expect(userInput).not.toContain('"stage"');
      expect(userInput).not.toContain('"status"');
      expect(userInput).not.toContain('"edition"');
      expect(userInput).not.toContain('"id"');

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

      const maturityRun = await translatePendingProposalsFromEnv([proposal()], {
        ...env,
        TRANSLATION_MODEL: 'maturity-model',
      });
      expect(maturityRun.result.failed).toBe(1);
      expect(JSON.stringify(errorLog.mock.calls)).toContain(
        'must not describe maturity metadata',
      );
      expect(paths).toEqual([
        '/chat/completions',
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
