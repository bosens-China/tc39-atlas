import { createHash } from 'node:crypto';

import pMap from 'p-map';
import pRetry from 'p-retry';

import type {
  AtlasProposal,
  QuickReview,
  TranslationMetadata,
} from './model.js';
import {
  createProposalTranslator,
  InvalidTranslationResponseError,
  translationConfig,
  translationFingerprint,
  TRANSLATION_POLICY_VERSION,
} from './translation-provider.js';

export {
  translationConfig,
  translationFingerprint,
  TRANSLATION_POLICY_VERSION,
} from './translation-provider.js';
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_RETRIES = 2;

interface TranslationOptions {
  concurrency?: number;
  fingerprint?: string;
  maxItems?: number;
  retries?: number;
  retryMinTimeout?: number;
}

export interface TranslationConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  concurrency: number;
  requestTimeoutMs: number;
  maxItems?: number;
}

export interface TranslationOutput {
  titleZh: string;
  readmeZh: string;
  quickReview: QuickReview;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
  };
}

export type ProposalTranslator = (
  proposal: AtlasProposal,
) => Promise<TranslationOutput>;

export interface TranslationRunResult {
  pending: number;
  translated: number;
  failed: number;
  skipped: boolean;
}

export interface TranslationRun {
  proposals: AtlasProposal[];
  result: TranslationRunResult;
}

/** 阻止部分翻译失败的数据覆盖上一份完整发布结果。 */
export function assertTranslationSucceeded(result: TranslationRunResult): void {
  if (result.failed > 0) {
    throw new Error(
      `Translation failed for ${result.failed} proposal(s); dataset was not updated`,
    );
  }
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  return typeof error.status === 'number' ? error.status : undefined;
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

export function articleSourceHash(
  proposal: Pick<AtlasProposal, 'title' | 'readme'>,
): string {
  return createHash('sha256')
    .update(JSON.stringify([proposal.title, proposal.readme]))
    .digest('hex');
}

function needsTranslation(
  proposal: AtlasProposal,
  fingerprint: string,
): boolean {
  const readmeIsValid = proposal.readme.trim()
    ? Boolean(proposal.readmeZh?.trim())
    : proposal.readmeZh === '';
  return !(
    proposal.titleZh?.trim() &&
    readmeIsValid &&
    proposal.quickReview?.en.trim() &&
    proposal.quickReview.zh.trim() &&
    proposal.translation?.sourceHash === articleSourceHash(proposal) &&
    proposal.translation.policyVersion === TRANSLATION_POLICY_VERSION &&
    proposal.translation.translatorFingerprint === fingerprint
  );
}

function translationMetadata(
  proposal: AtlasProposal,
  output: TranslationOutput,
  fingerprint: string,
): TranslationMetadata {
  return {
    sourceHash: articleSourceHash(proposal),
    policyVersion: TRANSLATION_POLICY_VERSION,
    translatorFingerprint: fingerprint,
    model: output.model,
    translatedAt: new Date().toISOString(),
  };
}

// 每个提案独立请求，并发只控制文章数，避免一个大批次阻塞全部标题。
export async function translatePendingProposals(
  source: readonly AtlasProposal[],
  translate: ProposalTranslator,
  options: TranslationOptions = {},
): Promise<TranslationRun> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryMinTimeout = options.retryMinTimeout ?? 1_000;
  const fingerprint = options.fingerprint ?? translationFingerprint();
  if (
    concurrency < 1 ||
    retries < 0 ||
    (options.maxItems !== undefined && options.maxItems < 1)
  ) {
    throw new Error('Invalid translation run options');
  }

  const proposals = source.map((proposal) => ({
    ...proposal,
    quickReview: proposal.quickReview ? { ...proposal.quickReview } : null,
  }));
  const pending = proposals
    .map((proposal, index) => ({ proposal, index }))
    .filter(({ proposal }) => needsTranslation(proposal, fingerprint));
  const candidates = options.maxItems
    ? pending.slice(0, options.maxItems)
    : pending;
  const result: TranslationRunResult = {
    pending: candidates.length,
    translated: 0,
    failed: 0,
    skipped: false,
  };

  await pMap(
    candidates,
    async ({ proposal, index }) => {
      try {
        const output = await pRetry(() => translate(proposal), {
          retries,
          minTimeout: retryMinTimeout,
          randomize: true,
          shouldRetry: ({ error }) => isRetryableTranslationError(error),
          onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
            console.warn(
              JSON.stringify({
                level: 'warn',
                event: 'proposal_translation_retry',
                proposal_id: proposal.id,
                attempt: attemptNumber,
                retries_left: retriesLeft,
                error: errorMessage(error),
              }),
            );
          },
        });
        proposals[index] = {
          ...proposal,
          titleZh: output.titleZh,
          readmeZh: output.readmeZh,
          quickReview: output.quickReview,
          translation: translationMetadata(proposal, output, fingerprint),
        };
        result.translated += 1;
      } catch (error: unknown) {
        result.failed += 1;
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'proposal_translation_failed',
            proposal_id: proposal.id,
            error: errorMessage(error),
          }),
        );
      }
    },
    { concurrency },
  );
  return { proposals, result };
}

export async function translatePendingProposalsFromEnv(
  source: readonly AtlasProposal[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<TranslationRun> {
  const config = translationConfig(env);
  const fingerprint = translationFingerprint(env);
  if (!config) {
    return {
      proposals: [...source],
      result: {
        pending: source.filter((proposal) =>
          needsTranslation(proposal, fingerprint),
        ).length,
        translated: 0,
        failed: 0,
        skipped: true,
      },
    };
  }
  return translatePendingProposals(source, createProposalTranslator(config), {
    ...config,
    fingerprint,
  });
}
