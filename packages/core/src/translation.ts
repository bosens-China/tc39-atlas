import { and, asc, eq, isNull, ne, or } from 'drizzle-orm';
import OpenAI from 'openai';
import pMap from 'p-map';
import pRetry, { AbortError } from 'p-retry';

import type { Database } from './database.js';
import { proposals } from './schema.js';

export const TRANSLATION_POLICY_VERSION = '1';
const DEFAULT_MODEL = 'gpt-5.6-luna';
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 100;
const DEFAULT_RETRIES = 3;
const CHAT_COMPLETION_MODELS = new Set(['deepseek-v4-pro']);

const TRANSLATION_INSTRUCTIONS = `你是 TC39 技术文档翻译器。把输入的英文 README 翻译为准确、自然的简体中文。
只输出完整的 Markdown 译文，不要解释，不要使用包裹整个结果的 Markdown 代码围栏。
保留标题层级、列表、表格、引用、HTML、链接目标、图片地址、代码块和行内代码；只翻译自然语言。
保留 ECMAScript、JavaScript、TC39、API、语法标记、标识符和提案专有名称。`;

interface TranslationCandidate {
  id: string;
  readme: string;
  readmeHash: string;
}

export interface TranslationOutput {
  markdown: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
  };
}

export type ReadmeTranslator = (
  readme: string,
  proposalId: string,
) => Promise<TranslationOutput>;

export interface TranslationRunResult {
  pending: number;
  translated: number;
  failed: number;
  stale: number;
  skipped: boolean;
}

interface TranslationOptions {
  batchSize?: number;
  concurrency?: number;
  retries?: number;
  retryMinTimeout?: number;
}

interface TranslationConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  batchSize: number;
  concurrency: number;
}

class InvalidTranslationResponseError extends Error {}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function translationConfig(
  env: NodeJS.ProcessEnv = process.env,
): TranslationConfig | null {
  const apiKey = env.TRANSLATION_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseURL = env.TRANSLATION_BASE_URL ?? env.OPENAI_BASE_URL;
  return {
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    model: env.TRANSLATION_MODEL || DEFAULT_MODEL,
    batchSize: positiveInteger(
      env.TRANSLATION_BATCH_SIZE,
      DEFAULT_BATCH_SIZE,
      'TRANSLATION_BATCH_SIZE',
    ),
    concurrency: positiveInteger(
      env.TRANSLATION_CONCURRENCY,
      DEFAULT_CONCURRENCY,
      'TRANSLATION_CONCURRENCY',
    ),
  };
}

// 只维护供应商明确公布的接口例外；不通过名称正则猜测模型能力。
function createOpenAITranslator(config: TranslationConfig): ReadmeTranslator {
  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    maxRetries: 0,
  });

  return async (readme, proposalId) => {
    if (CHAT_COMPLETION_MODELS.has(config.model)) {
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: 'system', content: TRANSLATION_INSTRUCTIONS },
          { role: 'user', content: readme },
        ],
      });
      const markdown = response.choices[0]?.message.content ?? '';
      if (!markdown.trim()) {
        throw new InvalidTranslationResponseError(
          'Translation output is empty',
        );
      }
      const usage = response.usage;
      const output: TranslationOutput = {
        markdown,
        model: response.model,
        ...(usage
          ? {
              usage: {
                inputTokens: usage.prompt_tokens,
                outputTokens: usage.completion_tokens,
                cachedTokens:
                  numberField(usage, 'prompt_cache_hit_tokens') ??
                  usage.prompt_tokens_details?.cached_tokens ??
                  0,
                cacheWriteTokens: 0,
                reasoningTokens:
                  usage.completion_tokens_details?.reasoning_tokens ?? 0,
              },
            }
          : {}),
      };
      logTranslation(proposalId, output);
      return output;
    }

    const response = await client.responses.create({
      model: config.model,
      instructions: TRANSLATION_INSTRUCTIONS,
      input: readme,
      store: false,
    });
    if (response.status && response.status !== 'completed') {
      throw new InvalidTranslationResponseError(
        `Translation response is ${response.status}`,
      );
    }
    if (!response.output_text.trim()) {
      throw new InvalidTranslationResponseError('Translation output is empty');
    }
    const usage = response.usage;
    const output: TranslationOutput = {
      markdown: response.output_text,
      model: String(response.model),
      ...(usage
        ? {
            usage: {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              cachedTokens: usage.input_tokens_details.cached_tokens ?? 0,
              cacheWriteTokens:
                usage.input_tokens_details.cache_write_tokens ?? 0,
              reasoningTokens:
                usage.output_tokens_details.reasoning_tokens ?? 0,
            },
          }
        : {}),
    };
    logTranslation(proposalId, output);
    return output;
  };
}

function logTranslation(proposalId: string, output: TranslationOutput): void {
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'proposal_translation_completed',
      proposal_id: proposalId,
      model: output.model,
      ...output.usage,
    }),
  );
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  const status = error.status;
  return typeof status === 'number' ? status : undefined;
}

function numberField(value: object, field: string): number | undefined {
  const candidate = (value as Record<string, unknown>)[field];
  return typeof candidate === 'number' ? candidate : undefined;
}

export function isRetryableTranslationError(error: unknown): boolean {
  if (error instanceof InvalidTranslationResponseError) return false;
  const status = errorStatus(error);
  return (
    status === undefined ||
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pendingTranslations(
  db: Database,
): Promise<TranslationCandidate[]> {
  return db
    .select({
      id: proposals.id,
      readme: proposals.readme,
      readmeHash: proposals.readmeHash,
    })
    .from(proposals)
    .where(
      and(
        ne(proposals.readme, ''),
        or(
          isNull(proposals.readmeZh),
          isNull(proposals.readmeZhSourceHash),
          ne(proposals.readmeZhSourceHash, proposals.readmeHash),
          isNull(proposals.translationPolicyVersion),
          ne(proposals.translationPolicyVersion, TRANSLATION_POLICY_VERSION),
        ),
      ),
    )
    .orderBy(asc(proposals.id));
}

// 数据库中的哈希失配就是持久队列；单轮快照避免失败项立即死循环。
export async function translatePendingReadmes(
  db: Database,
  translate: ReadmeTranslator,
  options: TranslationOptions = {},
): Promise<TranslationRunResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryMinTimeout = options.retryMinTimeout ?? 1_000;
  if (batchSize < 1 || concurrency < 1 || retries < 0) {
    throw new Error('Invalid translation run options');
  }

  const candidates = await pendingTranslations(db);
  const result: TranslationRunResult = {
    pending: candidates.length,
    translated: 0,
    failed: 0,
    stale: 0,
    skipped: false,
  };

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    await pMap(
      batch,
      async (candidate) => {
        try {
          const output = await pRetry(
            async () => {
              try {
                return await translate(candidate.readme, candidate.id);
              } catch (error: unknown) {
                if (!isRetryableTranslationError(error)) {
                  throw new AbortError(
                    error instanceof Error ? error : errorMessage(error),
                  );
                }
                throw error;
              }
            },
            {
              retries,
              minTimeout: retryMinTimeout,
              randomize: true,
              onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
                console.warn(
                  JSON.stringify({
                    level: 'warn',
                    event: 'proposal_translation_retry',
                    proposal_id: candidate.id,
                    attempt: attemptNumber,
                    retries_left: retriesLeft,
                    error: errorMessage(error),
                  }),
                );
              },
            },
          );
          const updated = await db
            .update(proposals)
            .set({
              readmeZh: output.markdown,
              readmeZhSourceHash: candidate.readmeHash,
              translationPolicyVersion: TRANSLATION_POLICY_VERSION,
              translationModel: output.model,
              translatedAt: new Date(),
            })
            .where(
              and(
                eq(proposals.id, candidate.id),
                eq(proposals.readmeHash, candidate.readmeHash),
              ),
            )
            .returning({ id: proposals.id });
          if (updated.length) result.translated += 1;
          else result.stale += 1;
        } catch (error: unknown) {
          result.failed += 1;
          console.error(
            JSON.stringify({
              level: 'error',
              event: 'proposal_translation_failed',
              proposal_id: candidate.id,
              error: errorMessage(error),
            }),
          );
        }
      },
      { concurrency },
    );
  }

  return result;
}

export async function translatePendingReadmesFromEnv(
  db: Database,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TranslationRunResult> {
  const config = translationConfig(env);
  if (!config) {
    return {
      pending: 0,
      translated: 0,
      failed: 0,
      stale: 0,
      skipped: true,
    };
  }
  return translatePendingReadmes(db, createOpenAITranslator(config), config);
}
