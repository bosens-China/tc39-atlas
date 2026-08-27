import * as z from 'zod/v4';

import {
  TRANSLATION_CONTRACT_VERSION,
  translationCacheKey,
  translationContentHash,
} from './translation-cache-key.js';

export const DATASET_SCHEMA_VERSION = 7;
export const proposalStages = [0, 1, 2, 2.7, 3, 4] as const;
export const proposalStatuses = [
  'active',
  'finished',
  'inactive',
  'withdrawn',
] as const;
export const proposalChangeKinds = [
  'added',
  'stage_changed',
  'finished',
  'inactive',
  'withdrawn',
] as const;

export const proposalStageSchema = z.union(
  proposalStages.map((stage) => z.literal(stage)),
);
export const proposalStatusSchema = z.enum(proposalStatuses);
export const proposalChangeKindSchema = z.enum(proposalChangeKinds);

export const proposalSnapshotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  stage: proposalStageSchema.nullable(),
  edition: z.number().int().min(2015).nullable(),
  status: proposalStatusSchema,
  repositoryUrl: z.string().url(),
});

export const proposalSummarySchema = proposalSnapshotSchema.extend({
  titleZh: z.string().min(1).nullable(),
  syncedAt: z.string().datetime(),
});

export const translationMetadataSchema = z.object({
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  policyVersion: z.string().min(1),
  translatorFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  model: z.string().min(1),
  translatedAt: z.string().datetime(),
});

export const overviewSchema = z.object({
  en: z.string().trim().min(1),
  zh: z.string().trim().min(1),
});

export const atlasProposalSchema = proposalSummarySchema.extend({
  readme: z.string(),
  readmeHash: z.string().regex(/^[a-f0-9]{64}$/),
  readmeZh: z.string().nullable(),
  overview: overviewSchema.nullable(),
  translation: translationMetadataSchema.nullable(),
});

const cachedTranslationMetadataSchema = translationMetadataSchema.omit({
  sourceHash: true,
});

export const translationCacheEntrySchema = z.object({
  titleZh: z.string().min(1),
  readmeZh: z.string(),
  overview: overviewSchema,
  translation: cachedTranslationMetadataSchema,
});

const storedAtlasProposalSchema = proposalSnapshotSchema.extend({
  syncedAt: z.string().datetime(),
  readme: z.string(),
  readmeHash: z.string().regex(/^[a-f0-9]{64}$/),
  translationRef: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});

export const proposalChangeSchema = z.object({
  id: z.string().min(1),
  proposalId: z.string().min(1),
  kind: proposalChangeKindSchema,
  before: proposalSnapshotSchema.nullable(),
  after: proposalSnapshotSchema,
  detectedAt: z.string().datetime(),
});

// 磁盘格式只保存文章引用，解析后再还原为业务层使用的完整提案。
export const atlasDatasetSchema = z.object({
  schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  checkedAt: z.string().datetime(),
  proposals: z.array(storedAtlasProposalSchema),
  translations: z.record(
    z.string().regex(/^[a-f0-9]{64}$/),
    translationCacheEntrySchema,
  ),
  changes: z.array(proposalChangeSchema),
});

export const datasetManifestSchema = z.object({
  schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime(),
  checkedAt: z.string().datetime(),
  dataset: z.object({
    url: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().nonnegative(),
  }),
});

export type ProposalStage = z.infer<typeof proposalStageSchema>;
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;
export type ProposalChangeKind = z.infer<typeof proposalChangeKindSchema>;
export type ProposalSnapshot = z.infer<typeof proposalSnapshotSchema>;
export type ProposalSummary = z.infer<typeof proposalSummarySchema>;
export type TranslationMetadata = z.infer<typeof translationMetadataSchema>;
export type TranslationCacheEntry = z.infer<typeof translationCacheEntrySchema>;
export type ProposalOverview = z.infer<typeof overviewSchema>;
export type AtlasProposal = z.infer<typeof atlasProposalSchema>;
export type ProposalDetail = AtlasProposal;
export type ProposalChange = z.infer<typeof proposalChangeSchema>;
export interface AtlasDataset {
  schemaVersion: typeof DATASET_SCHEMA_VERSION;
  generatedAt: string;
  checkedAt: string;
  proposals: AtlasProposal[];
  changes: ProposalChange[];
}
export type DatasetManifest = z.infer<typeof datasetManifestSchema>;
export type KeywordMode = 'all' | 'any';

export interface ProposalFilter {
  stages?: readonly ProposalStage[];
  editions?: readonly number[];
  statuses?: readonly ProposalStatus[];
  keywords?: readonly string[];
  keywordMode?: KeywordMode;
  limit?: number;
  offset?: number;
}

export interface SyncedProposal extends ProposalSnapshot {
  readme: string;
  readmeHash: string;
  syncedAt: string;
}

interface ReferencedDatasetData {
  generatedAt: string;
  checkedAt: string;
  proposals: Array<z.infer<typeof storedAtlasProposalSchema>>;
  translations: Record<string, TranslationCacheEntry>;
  changes: ProposalChange[];
}

function hydrateReferencedDataset(data: ReferencedDatasetData): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: data.generatedAt,
    checkedAt: data.checkedAt,
    proposals: data.proposals.map((proposal) => {
      const cached = proposal.translationRef
        ? data.translations[proposal.translationRef]
        : undefined;
      if (proposal.translationRef && !cached) {
        throw new Error(
          `Invalid translation reference for proposal ${proposal.id}`,
        );
      }
      if (
        proposal.translationRef &&
        proposal.translationRef !== translationCacheKey(proposal)
      ) {
        throw new Error(
          `Stale translation reference for proposal ${proposal.id}`,
        );
      }
      return atlasProposalSchema.parse({
        ...proposal,
        titleZh: cached?.titleZh ?? null,
        readmeZh: cached?.readmeZh ?? null,
        overview: cached?.overview ?? null,
        translation: cached
          ? {
              ...cached.translation,
              sourceHash: translationContentHash(proposal),
              policyVersion: TRANSLATION_CONTRACT_VERSION,
            }
          : null,
      });
    }),
    changes: data.changes,
  };
}

export function parseAtlasDataset(value: unknown): AtlasDataset {
  return hydrateReferencedDataset(atlasDatasetSchema.parse(value));
}

export function parseDatasetManifest(value: unknown): DatasetManifest {
  return datasetManifestSchema.parse(value);
}
