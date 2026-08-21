import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import * as z from 'zod/v4';

import {
  prepareAtlasDataset,
  serializeDataset,
  writeAtlasDataset,
  type PrepareDatasetOptions,
} from './dataset.js';
import {
  parseAtlasDataset,
  type AtlasDataset,
  type AtlasProposal,
  type DatasetManifest,
} from './model.js';
import {
  applyProposalTranslation,
  proposalNeedsTranslation,
  translatePendingProposalsFromEnv,
  translationCacheKey,
  translationContentHash,
  type TranslationRunResult,
} from './translation.js';
import {
  validateTranslationOutput,
  translationOutputSchema,
} from './translation-provider.js';
import { TRANSLATION_CONTRACT_VERSION } from './translation-cache-key.js';

export const TRANSLATION_PLAN_FILE = 'translation-plan.json';
export const TRANSLATION_SNAPSHOT_FILE = 'dataset-snapshot.json';
export const AGENT_TRANSLATIONS_FILE = 'translation-results.json';
const TRANSLATION_PLAN_SCHEMA_VERSION = 1;

const translationReasonSchema = z.enum([
  'new_proposal',
  'title_changed',
  'readme_changed',
  'contract_changed',
  'translation_incomplete',
]);

const translationPlanItemSchema = z.object({
  proposalId: z.string().min(1),
  repositoryUrl: z.string().url(),
  title: z.string().min(1),
  readme: z.string(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  cacheKey: z.string().regex(/^[a-f0-9]{64}$/),
  reasons: z.array(translationReasonSchema).min(1),
});

const translationPlanBodySchema = z.object({
  schemaVersion: z.literal(TRANSLATION_PLAN_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  datasetRevision: z.string().regex(/^[a-f0-9]{64}$/),
  items: z.array(translationPlanItemSchema),
});

export const translationPlanSchema = translationPlanBodySchema.extend({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});

export const agentTranslationsSchema = z.object({
  schemaVersion: z.literal(TRANSLATION_PLAN_SCHEMA_VERSION),
  planRevision: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1),
  translations: z.array(
    translationOutputSchema.extend({
      proposalId: z.string().min(1),
      sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});

export type TranslationReason = z.infer<typeof translationReasonSchema>;
export type TranslationPlan = z.infer<typeof translationPlanSchema>;
export type AgentTranslations = z.infer<typeof agentTranslationsSchema>;

export interface TranslationWorkflowOptions extends PrepareDatasetOptions {
  workDirectory: string;
  env?: NodeJS.ProcessEnv;
}

export interface ScanTranslationResult {
  dataset: AtlasDataset;
  plan: TranslationPlan;
}

export interface ExecuteTranslationResult {
  dataset: AtlasDataset;
  manifest: DatasetManifest;
  plan: TranslationPlan;
  agentApplied: number;
  translation: TranslationRunResult;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function translationReasons(
  previous: AtlasProposal | undefined,
  current: AtlasProposal,
): TranslationReason[] {
  if (!proposalNeedsTranslation(current)) return [];
  if (!previous) return ['new_proposal'];

  const reasons: TranslationReason[] = [];
  if (previous.title !== current.title) reasons.push('title_changed');
  if (previous.readme !== current.readme) reasons.push('readme_changed');
  if (
    previous.translation &&
    previous.translation.policyVersion !== TRANSLATION_CONTRACT_VERSION
  ) {
    reasons.push('contract_changed');
  }
  return reasons.length > 0 ? reasons : ['translation_incomplete'];
}

export function createTranslationPlan(
  previous: AtlasDataset,
  dataset: AtlasDataset,
  serialized = serializeDataset(dataset),
): TranslationPlan {
  const previousById = new Map(
    previous.proposals.map((proposal) => [proposal.id, proposal]),
  );
  const body = translationPlanBodySchema.parse({
    schemaVersion: TRANSLATION_PLAN_SCHEMA_VERSION,
    generatedAt: dataset.generatedAt,
    datasetRevision: sha256(serialized),
    items: dataset.proposals.flatMap((proposal) => {
      const reasons = translationReasons(
        previousById.get(proposal.id),
        proposal,
      );
      return reasons.length === 0
        ? []
        : [
            {
              proposalId: proposal.id,
              repositoryUrl: proposal.repositoryUrl,
              title: proposal.title,
              readme: proposal.readme,
              sourceHash: translationContentHash(proposal),
              cacheKey: translationCacheKey(proposal),
              reasons,
            },
          ];
    }),
  });
  return { ...body, revision: sha256(JSON.stringify(body)) };
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function readOptionalAgentTranslations(
  path: string,
): Promise<AgentTranslations | null> {
  try {
    return agentTranslationsSchema.parse(await readJson(path));
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

function verifyTranslationPlan(
  plan: TranslationPlan,
  serialized: string,
  dataset: AtlasDataset,
): void {
  const { revision, ...body } = plan;
  if (revision !== sha256(JSON.stringify(body))) {
    throw new Error('Translation plan revision is invalid');
  }
  if (plan.datasetRevision !== sha256(serialized)) {
    throw new Error('Translation snapshot does not match its plan');
  }

  const pending = dataset.proposals.filter(proposalNeedsTranslation);
  if (pending.length !== plan.items.length) {
    throw new Error('Translation plan does not cover the snapshot queue');
  }
  const pendingById = new Map(
    pending.map((proposal) => [proposal.id, proposal]),
  );
  for (const item of plan.items) {
    const proposal = pendingById.get(item.proposalId);
    if (
      !proposal ||
      item.sourceHash !== translationContentHash(proposal) ||
      item.cacheKey !== translationCacheKey(proposal) ||
      item.title !== proposal.title ||
      item.readme !== proposal.readme
    ) {
      throw new Error(`Stale translation plan item: ${item.proposalId}`);
    }
    pendingById.delete(item.proposalId);
  }
  if (pendingById.size > 0) {
    throw new Error('Translation plan contains duplicate proposal IDs');
  }
}

function applyAgentTranslations(
  proposals: readonly AtlasProposal[],
  plan: TranslationPlan,
  agent: AgentTranslations | null,
): { proposals: AtlasProposal[]; applied: number } {
  if (!agent) return { proposals: [...proposals], applied: 0 };
  if (agent.planRevision !== plan.revision) {
    throw new Error('Agent translations target a different plan');
  }
  const plannedById = new Map(
    plan.items.map((item) => [item.proposalId, item]),
  );
  const translatedById = new Map(
    agent.translations.map((translation) => [
      translation.proposalId,
      translation,
    ]),
  );
  if (translatedById.size !== agent.translations.length) {
    throw new Error('Agent translations contain duplicate proposal IDs');
  }

  let applied = 0;
  const next = proposals.map((proposal) => {
    const result = translatedById.get(proposal.id);
    if (!result) return proposal;
    const planned = plannedById.get(proposal.id);
    if (!planned || result.sourceHash !== planned.sourceHash) {
      throw new Error(`Stale agent translation: ${proposal.id}`);
    }
    const validated = validateTranslationOutput(result, proposal);
    applied += 1;
    translatedById.delete(proposal.id);
    return applyProposalTranslation(proposal, {
      ...validated,
      model: agent.model,
    });
  });
  if (translatedById.size > 0) {
    throw new Error('Agent translations contain proposals outside the plan');
  }
  return { proposals: next, applied };
}

/** 阶段一：只扫描并记录，不调用模型或修改正式发布数据。 */
export async function scanTranslationWork(
  options: TranslationWorkflowOptions,
): Promise<ScanTranslationResult> {
  const prepared = await prepareAtlasDataset(options);
  const serialized = serializeDataset(prepared.dataset);
  const plan = createTranslationPlan(
    prepared.previous,
    prepared.dataset,
    serialized,
  );
  await writeAtomically(
    join(options.workDirectory, TRANSLATION_SNAPSHOT_FILE),
    serialized,
  );
  await writeAtomically(
    join(options.workDirectory, TRANSLATION_PLAN_FILE),
    `${JSON.stringify(plan, null, 2)}\n`,
  );
  await rm(join(options.workDirectory, AGENT_TRANSLATIONS_FILE), {
    force: true,
  });
  return { dataset: prepared.dataset, plan };
}

/** 阶段二：应用本地 Agent 结果，并用 CI 模型处理剩余计划。 */
export async function executeTranslationWork(
  options: TranslationWorkflowOptions,
): Promise<ExecuteTranslationResult> {
  const snapshotPath = join(options.workDirectory, TRANSLATION_SNAPSHOT_FILE);
  const serialized = await readFile(snapshotPath, 'utf8');
  const dataset = parseAtlasDataset(JSON.parse(serialized) as unknown);
  const plan = translationPlanSchema.parse(
    await readJson(join(options.workDirectory, TRANSLATION_PLAN_FILE)),
  );
  verifyTranslationPlan(plan, serialized, dataset);
  const agent = await readOptionalAgentTranslations(
    join(options.workDirectory, AGENT_TRANSLATIONS_FILE),
  );
  const applied = applyAgentTranslations(dataset.proposals, plan, agent);
  const translated = await translatePendingProposalsFromEnv(
    applied.proposals,
    options.env ?? process.env,
  );
  const published = { ...dataset, proposals: translated.proposals };
  const { manifest } = await writeAtlasDataset(
    published,
    options.outputDirectory,
  );
  return {
    dataset: published,
    manifest,
    plan,
    agentApplied: applied.applied,
    translation: {
      ...translated.result,
      pending: plan.items.length,
      translated: applied.applied + translated.result.translated,
    },
  };
}
