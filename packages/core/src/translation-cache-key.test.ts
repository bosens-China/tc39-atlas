import { describe, expect, it } from 'vitest';

import {
  translationCacheKey,
  translationContentHash,
  type TranslationContent,
} from './translation-cache-key.js';

const content: TranslationContent = {
  title: 'Proposal A',
  readme: '# Proposal A',
};

describe('translation cache key', () => {
  it.each([
    ['title', 'Proposal B'],
    ['readme', '# Changed'],
  ] as const)('changes when %s changes', (field, value) => {
    expect(translationContentHash({ ...content, [field]: value })).not.toBe(
      translationContentHash(content),
    );
  });

  it('ignores Dataset metadata that is not translated', () => {
    const proposal = {
      ...content,
      stage: 2,
      status: 'active',
      edition: null,
    };
    expect(
      translationContentHash({
        ...proposal,
        stage: 4,
        status: 'finished',
        edition: 2027,
      }),
    ).toBe(translationContentHash(proposal));
  });

  it('isolates target language and explicit contract versions', () => {
    const current = translationCacheKey(content);
    expect(translationCacheKey(content, { targetLanguage: 'en-US' })).not.toBe(
      current,
    );
    expect(translationCacheKey(content, { contractVersion: 'next' })).not.toBe(
      current,
    );
  });
});
