import { describe, expect, it } from 'vitest';

import { translationConfig, translationFingerprint } from './translation.js';

describe('translation provider configuration', () => {
  it('uses DeepSeek defaults', () => {
    const config = translationConfig({ DEEPSEEK_API_KEY: 'test-key' });
    expect(config).toMatchObject({
      baseURL: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      temperature: 1,
      concurrency: 100,
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

  it('records runtime translation settings separately from the cache key', () => {
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
});
