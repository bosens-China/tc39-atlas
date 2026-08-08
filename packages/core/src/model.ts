import * as z from 'zod/v4';

export const DATASET_SCHEMA_VERSION = 2;
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
  model: z.string().min(1),
  translatedAt: z.string().datetime(),
});

export const atlasProposalSchema = proposalSummarySchema.extend({
  titleTranslation: translationMetadataSchema.nullable(),
  readme: z.string(),
  readmeHash: z.string().regex(/^[a-f0-9]{64}$/),
  readmeZh: z.string().nullable(),
  translation: translationMetadataSchema.nullable(),
});

export const proposalChangeSchema = z.object({
  id: z.string().min(1),
  proposalId: z.string().min(1),
  kind: proposalChangeKindSchema,
  before: proposalSnapshotSchema.nullable(),
  after: proposalSnapshotSchema,
  occurredAt: z.string().datetime(),
});

export const atlasDatasetSchema = z.object({
  schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  proposals: z.array(atlasProposalSchema),
  changes: z.array(proposalChangeSchema),
});

export const datasetManifestSchema = z.object({
  schemaVersion: z.literal(DATASET_SCHEMA_VERSION),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime(),
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
export type AtlasProposal = z.infer<typeof atlasProposalSchema>;
export type ProposalDetail = AtlasProposal;
export type ProposalChange = z.infer<typeof proposalChangeSchema>;
export type AtlasDataset = z.infer<typeof atlasDatasetSchema>;
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

export function parseAtlasDataset(value: unknown): AtlasDataset {
  return atlasDatasetSchema.parse(value);
}

export function parseDatasetManifest(value: unknown): DatasetManifest {
  return datasetManifestSchema.parse(value);
}
