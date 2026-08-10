import pMap from 'p-map';

import type {
  AtlasProposal,
  ProposalOverview,
  TranslationMetadata,
} from './model.js';
import {
  createProposalTranslator,
  translationConfig,
  translationFingerprint,
} from './translation-provider.js';
import {
  TRANSLATION_CONTRACT_VERSION,
  translationContentHash,
} from './translation-cache-key.js';

export {
  translationConfig,
  translationFingerprint,
} from './translation-provider.js';
export {
  TRANSLATION_CONTRACT_VERSION,
  TRANSLATION_TARGET_LANGUAGE,
  translationCacheKey,
  translationContentHash,
  type TranslationCacheKeyOptions,
  type TranslationContent,
} from './translation-cache-key.js';
const DEFAULT_CONCURRENCY = 100;

interface TranslationOptions {
  concurrency?: number;
  fingerprint?: string;
  maxItems?: number;
}

export interface TranslationConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature: number;
  maxOutputTokens?: number;
  concurrency: number;
  maxItems?: number;
}

export interface TranslationOutput {
  titleZh: string;
  readmeZh: string;
  overview: ProposalOverview;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function needsTranslation(proposal: AtlasProposal): boolean {
  const readmeIsValid = proposal.readme.trim()
    ? Boolean(proposal.readmeZh?.trim())
    : proposal.readmeZh === '';
  return !(
    proposal.titleZh?.trim() &&
    readmeIsValid &&
    proposal.overview?.en.trim() &&
    proposal.overview.zh.trim() &&
    proposal.translation?.sourceHash === translationContentHash(proposal) &&
    proposal.translation.policyVersion === TRANSLATION_CONTRACT_VERSION
  );
}

function translationMetadata(
  proposal: AtlasProposal,
  output: TranslationOutput,
  fingerprint: string,
): TranslationMetadata {
  return {
    sourceHash: translationContentHash(proposal),
    policyVersion: TRANSLATION_CONTRACT_VERSION,
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
  const fingerprint = options.fingerprint ?? translationFingerprint();
  if (
    concurrency < 1 ||
    (options.maxItems !== undefined && options.maxItems < 1)
  ) {
    throw new Error('Invalid translation run options');
  }

  const proposals = source.map((proposal) => ({
    ...proposal,
    overview: proposal.overview ? { ...proposal.overview } : null,
  }));
  const pending = proposals
    .map((proposal, index) => ({ proposal, index }))
    .filter(({ proposal }) => needsTranslation(proposal));
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
        const output = await translate(proposal);
        proposals[index] = {
          ...proposal,
          titleZh: output.titleZh,
          readmeZh: output.readmeZh,
          overview: output.overview,
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
        pending: source.filter((proposal) => needsTranslation(proposal)).length,
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
