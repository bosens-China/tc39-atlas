import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  DATASET_SCHEMA_VERSION,
  parseAtlasDataset,
  type AtlasDataset,
  type AtlasProposal,
  type DatasetManifest,
  type SyncedProposal,
} from './model.js';
import { fetchTc39Proposals } from './source.js';
import { detectProposalChanges, mergeProposalChanges } from './sync.js';
import {
  TRANSLATION_POLICY_VERSION,
  articleSourceHash,
  translatePendingProposalsFromEnv,
  type TranslationRunResult,
} from './translation.js';

export const DATASET_FILE_NAME = 'dataset.json';
export const MANIFEST_FILE_NAME = 'manifest.json';
const INITIAL_GENERATED_AT = new Date(0).toISOString();

export interface GenerateDatasetOptions {
  outputDirectory: string;
  previousUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export interface GenerateDatasetResult {
  dataset: AtlasDataset;
  manifest: DatasetManifest;
  translation: TranslationRunResult;
}

function emptyDataset(): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: INITIAL_GENERATED_AT,
    proposals: [],
    changes: [],
  };
}

/** 识别旧版首次同步产生的全量 added 事件，下次同步时自动回到基线。 */
function isUnanchoredSnapshot(dataset: AtlasDataset): boolean {
  if (
    dataset.proposals.length === 0 ||
    dataset.changes.length !== dataset.proposals.length
  ) {
    return false;
  }
  const syncedAtById = new Map(
    dataset.proposals.map((proposal) => [proposal.id, proposal.syncedAt]),
  );
  return dataset.changes.every(
    (change) =>
      change.kind === 'added' &&
      change.before === null &&
      syncedAtById.get(change.proposalId) === change.occurredAt,
  );
}

function reuseTranslation(
  current: SyncedProposal,
  previous: AtlasProposal | undefined,
): Pick<AtlasProposal, 'titleZh' | 'readmeZh' | 'quickReview' | 'translation'> {
  const readmeIsValid = current.readme.trim()
    ? Boolean(previous?.readmeZh?.trim())
    : previous?.readmeZh === '';
  if (
    previous?.titleZh?.trim() &&
    readmeIsValid &&
    previous.quickReview?.en.trim() &&
    previous.quickReview.zh.trim() &&
    previous.translation?.sourceHash === articleSourceHash(current) &&
    previous.translation.policyVersion === TRANSLATION_POLICY_VERSION
  ) {
    return {
      titleZh: previous.titleZh,
      readmeZh: previous.readmeZh,
      quickReview: previous.quickReview,
      translation: previous.translation,
    };
  }
  return {
    titleZh: null,
    readmeZh: null,
    quickReview: null,
    translation: null,
  };
}

export function mergePublishedProposals(
  previous: readonly AtlasProposal[],
  incoming: readonly SyncedProposal[],
): AtlasProposal[] {
  const previousById = new Map(
    previous.map((proposal) => [proposal.id, proposal]),
  );
  return incoming.map((proposal) => ({
    ...proposal,
    ...reuseTranslation(proposal, previousById.get(proposal.id)),
  }));
}

export function buildAtlasDataset(
  previous: AtlasDataset,
  proposals: AtlasProposal[],
  generatedAt = new Date(),
): AtlasDataset {
  const synced: SyncedProposal[] = proposals.map((proposal) => ({
    id: proposal.id,
    title: proposal.title,
    stage: proposal.stage,
    edition: proposal.edition,
    status: proposal.status,
    repositoryUrl: proposal.repositoryUrl,
    readme: proposal.readme,
    readmeHash: proposal.readmeHash,
    syncedAt: proposal.syncedAt,
  }));
  const isInitial = previous.generatedAt === INITIAL_GENERATED_AT;
  const currentChanges = isInitial
    ? []
    : detectProposalChanges(previous.proposals, synced);
  const previousChanges =
    isInitial || isUnanchoredSnapshot(previous) ? [] : previous.changes;
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    proposals,
    changes: mergeProposalChanges(previousChanges, currentChanges, generatedAt),
  };
}

export function serializeDataset(dataset: AtlasDataset): string {
  return `${JSON.stringify(dataset, null, 2)}\n`;
}

export function createDatasetManifest(
  dataset: AtlasDataset,
  serialized: string,
): DatasetManifest {
  const sha256 = createHash('sha256').update(serialized).digest('hex');
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    revision: sha256,
    generatedAt: dataset.generatedAt,
    dataset: {
      url: DATASET_FILE_NAME,
      sha256,
      bytes: Buffer.byteLength(serialized),
    },
  };
}

async function readLocalDataset(path: string): Promise<AtlasDataset | null> {
  try {
    return parseAtlasDataset(
      JSON.parse(await readFile(path, 'utf8')) as unknown,
    );
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

async function fetchPreviousDataset(url: string): Promise<AtlasDataset | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseAtlasDataset(await response.json());
  } catch (error: unknown) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'previous_dataset_unavailable',
        url,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return null;
  }
}

/** 选择最新的有效快照，避免线上旧数据覆盖仓库中刚完成的译文。 */
export function selectPreviousDataset(
  remote: AtlasDataset | null,
  local: AtlasDataset | null,
): AtlasDataset | null {
  if (!remote) return local;
  if (!local) return remote;
  return remote.generatedAt >= local.generatedAt ? remote : local;
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}

// 远端 Pages 快照优先用于复用译文；首次部署时回退到仓库内种子数据。
export async function generateAtlasDataset(
  options: GenerateDatasetOptions,
): Promise<GenerateDatasetResult> {
  const datasetPath = join(options.outputDirectory, DATASET_FILE_NAME);
  const remote = options.previousUrl
    ? await fetchPreviousDataset(options.previousUrl)
    : null;
  const local = await readLocalDataset(datasetPath);
  const previous = selectPreviousDataset(remote, local) ?? emptyDataset();
  const incoming = await fetchTc39Proposals();
  const merged = mergePublishedProposals(previous.proposals, incoming);
  const translated = await translatePendingProposalsFromEnv(
    merged,
    options.env,
  );
  const dataset = buildAtlasDataset(previous, translated.proposals);
  const serialized = serializeDataset(dataset);
  const manifest = createDatasetManifest(dataset, serialized);

  await writeAtomically(datasetPath, serialized);
  await writeAtomically(
    join(options.outputDirectory, MANIFEST_FILE_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return {
    dataset,
    manifest,
    translation: translated.result,
  };
}
