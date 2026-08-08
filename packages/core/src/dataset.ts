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
  translatePendingTitlesFromEnv,
  type TitleTranslationRunResult,
} from './title-translation.js';
import {
  TRANSLATION_POLICY_VERSION,
  translatePendingReadmesFromEnv,
  type TranslationRunResult,
} from './translation.js';

export const DATASET_FILE_NAME = 'dataset.json';
export const MANIFEST_FILE_NAME = 'manifest.json';

export interface GenerateDatasetOptions {
  outputDirectory: string;
  previousUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export interface GenerateDatasetResult {
  dataset: AtlasDataset;
  manifest: DatasetManifest;
  translation: {
    titles: TitleTranslationRunResult;
    readmes: TranslationRunResult;
  };
}

function emptyDataset(): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: new Date(0).toISOString(),
    proposals: [],
    changes: [],
  };
}

function reuseTranslation(
  current: SyncedProposal,
  previous: AtlasProposal | undefined,
): Pick<AtlasProposal, 'readmeZh' | 'translation'> {
  if (
    previous?.readmeHash === current.readmeHash &&
    previous.readmeZh !== null &&
    previous.translation?.sourceHash === current.readmeHash &&
    previous.translation.policyVersion === TRANSLATION_POLICY_VERSION
  ) {
    return {
      readmeZh: previous.readmeZh,
      translation: previous.translation,
    };
  }
  return { readmeZh: null, translation: null };
}

function reuseTitleTranslation(
  current: SyncedProposal,
  previous: AtlasProposal | undefined,
): Pick<AtlasProposal, 'titleZh' | 'titleTranslation'> {
  if (
    previous?.titleZh &&
    previous.titleTranslation?.sourceHash ===
      createHash('sha256').update(current.title).digest('hex')
  ) {
    return {
      titleZh: previous.titleZh,
      titleTranslation: previous.titleTranslation,
    };
  }
  return { titleZh: null, titleTranslation: null };
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
    ...reuseTitleTranslation(proposal, previousById.get(proposal.id)),
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
  const currentChanges = detectProposalChanges(previous.proposals, synced);
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    proposals,
    changes: mergeProposalChanges(
      previous.changes,
      currentChanges,
      generatedAt,
    ),
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
  const previous =
    remote ?? (await readLocalDataset(datasetPath)) ?? emptyDataset();
  const incoming = await fetchTc39Proposals();
  const merged = mergePublishedProposals(previous.proposals, incoming);
  const titled = await translatePendingTitlesFromEnv(merged, options.env);
  const translated = await translatePendingReadmesFromEnv(
    titled.proposals,
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
    translation: { titles: titled.result, readmes: translated.result },
  };
}
