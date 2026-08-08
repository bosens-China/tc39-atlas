import { createServer } from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AtlasProposal } from './model.js';
import {
  seedManualTitleTranslations,
  TITLE_TRANSLATION_POLICY_VERSION,
  titleSourceHash,
  translatePendingTitlesFromEnv,
} from './title-translation.js';

function proposal(overrides: Partial<AtlasProposal> = {}): AtlasProposal {
  return {
    id: 'proposal-decorators',
    title: 'Decorators',
    titleZh: null,
    titleTranslation: null,
    stage: 2.7,
    edition: null,
    status: 'active',
    repositoryUrl: 'https://github.com/tc39/proposal-decorators',
    syncedAt: '2026-08-08T00:00:00.000Z',
    readme: '# Decorators',
    readmeHash: 'a'.repeat(64),
    readmeZh: null,
    translation: null,
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('proposal title translation', () => {
  it('uses the checked-in translation while the English title is unchanged', () => {
    const seeded = seedManualTitleTranslations([proposal()]);

    expect(seeded.seeded).toBe(1);
    expect(seeded.proposals[0]).toMatchObject({
      titleZh: '装饰器',
      titleTranslation: {
        sourceHash: titleSourceHash('Decorators'),
        policyVersion: TITLE_TRANSLATION_POLICY_VERSION,
        model: 'codex-manual',
      },
    });
  });

  it('uses Responses structured output for an untranslated title', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bodies: Array<Record<string, unknown>> = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        bodies.push(JSON.parse(body) as Record<string, unknown>);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'response-1',
            object: 'response',
            created_at: 1,
            status: 'completed',
            model: 'test-model',
            output: [
              {
                id: 'message-1',
                type: 'message',
                status: 'completed',
                role: 'assistant',
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      translations: [
                        { id: 'proposal-future', titleZh: '未来提案' },
                      ],
                    }),
                    annotations: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 10,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens: 10,
              output_tokens_details: { reasoning_tokens: 0 },
              total_tokens: 20,
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
      const run = await translatePendingTitlesFromEnv(
        [
          proposal({
            id: 'proposal-future',
            title: 'Future Proposal',
            repositoryUrl: 'https://github.com/tc39/proposal-future',
          }),
        ],
        {
          TRANSLATION_API_KEY: 'test-key',
          TRANSLATION_BASE_URL: `http://127.0.0.1:${address.port}`,
          TRANSLATION_MODEL: 'test-model',
        },
      );

      expect(run.result).toMatchObject({
        pending: 1,
        translated: 1,
        failed: 0,
        seeded: 0,
      });
      expect(run.proposals[0]?.titleZh).toBe('未来提案');
      expect(bodies[0]).toMatchObject({
        model: 'test-model',
        store: false,
        text: {
          format: {
            type: 'json_schema',
            name: 'proposal_title_translations',
            strict: true,
          },
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
