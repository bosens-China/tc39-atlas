import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DATASET_SCHEMA_VERSION,
  atlasDatasetSchema,
  parseAtlasDataset,
  parseDatasetManifest,
  reportDateSchema,
  type AtlasDataset,
  type AtlasProposal,
  type DatasetManifest,
  type SyncedProposal,
  type TranslationCacheEntry,
} from './model.js';
import {
  DATASET_FILE_NAME,
  MANIFEST_FILE_NAME,
  createDatasetManifest,
} from './dataset-manifest.js';
import {
  INITIAL_GENERATED_AT,
  emptyDataset,
  writeAtomically,
} from './dataset-support.js';
import { reportDateAt } from './report-date.js';
import { fetchTc39Proposals } from './source.js';
import { detectProposalChanges, mergeProposalChanges } from './sync.js';
import {
  TRANSLATION_CONTRACT_VERSION,
  translationCacheKey,
  translationContentHash,
} from './translation.js';

export {
  DATASET_FILE_NAME,
  MANIFEST_FILE_NAME,
  createDatasetManifest,
} from './dataset-manifest.js';
export { REPORT_TIME_ZONE, reportDateAt } from './report-date.js';

export interface PrepareDatasetOptions {
  outputDirectory: string;
  previousUrl?: string;
  reportDate?: string;
}

export interface PrepareDatasetResult {
  dataset: AtlasDataset;
  previous: AtlasDataset;
}

export interface WriteAtlasDatasetResult {
  changed: boolean;
  dataset: AtlasDataset;
  manifest: DatasetManifest;
  serialized: string;
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
      syncedAtById.get(change.proposalId) === change.detectedAt,
  );
}

function reuseTranslation(
  current: SyncedProposal,
  previous: AtlasProposal | undefined,
): Pick<AtlasProposal, 'titleZh' | 'readmeZh' | 'overview' | 'translation'> {
  const readmeIsValid = current.readme.trim()
    ? Boolean(previous?.readmeZh?.trim())
    : previous?.readmeZh === '';
  if (
    previous?.titleZh?.trim() &&
    readmeIsValid &&
    previous.overview?.en.trim() &&
    previous.overview.zh.trim() &&
    previous.translation?.sourceHash === translationContentHash(current) &&
    previous.translation.policyVersion === TRANSLATION_CONTRACT_VERSION
  ) {
    return {
      titleZh: previous.titleZh,
      readmeZh: previous.readmeZh,
      overview: previous.overview,
      translation: previous.translation,
    };
  }
  return {
    titleZh: null,
    readmeZh: null,
    overview: null,
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
  reportDate = reportDateAt(generatedAt),
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
  const parsedReportDate = reportDateSchema.parse(reportDate);
  if (!isInitial && parsedReportDate < previous.reportDate) {
    throw new Error('Report date cannot move backwards');
  }
  const previousReportDate = isInitial
    ? null
    : parsedReportDate === previous.reportDate
      ? previous.previousReportDate
      : previous.reportDate;
  const currentChanges = isInitial
    ? []
    : detectProposalChanges(previous.proposals, synced, parsedReportDate);
  const previousChanges =
    isInitial || isUnanchoredSnapshot(previous) ? [] : previous.changes;
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    checkedAt: generatedAt.toISOString(),
    reportDate: parsedReportDate,
    previousReportDate,
    proposals,
    changes: mergeProposalChanges(previousChanges, currentChanges, generatedAt),
  };
}

export function serializeDataset(dataset: AtlasDataset): string {
  // 从当前引用重建缓存表，旧文章版本没有引用时会自然被清扫。
  const translations: Record<string, TranslationCacheEntry> = {};
  const proposals = dataset.proposals.map((proposal) => {
    const { titleZh, readmeZh, overview, translation, ...stored } = proposal;
    const contentHash = translationContentHash(proposal);
    const cacheKey = translationCacheKey(proposal);
    const readmeIsValid = proposal.readme.trim()
      ? Boolean(readmeZh?.trim())
      : readmeZh === '';
    const isComplete = Boolean(
      titleZh?.trim() &&
      readmeIsValid &&
      overview?.en.trim() &&
      overview.zh.trim() &&
      translation?.sourceHash === contentHash &&
      translation.policyVersion === TRANSLATION_CONTRACT_VERSION,
    );
    if (isComplete && titleZh && readmeZh !== null && overview && translation) {
      translations[cacheKey] = {
        titleZh,
        readmeZh,
        overview,
        translation: {
          policyVersion: TRANSLATION_CONTRACT_VERSION,
          ...(translation.translatorFingerprint
            ? { translatorFingerprint: translation.translatorFingerprint }
            : {}),
          model: translation.model,
          translatedAt: translation.translatedAt,
        },
      };
    }
    return { ...stored, translationRef: isComplete ? cacheKey : null };
  });
  const stored = atlasDatasetSchema.parse({
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: dataset.generatedAt,
    checkedAt: dataset.checkedAt,
    reportDate: dataset.reportDate,
    previousReportDate: dataset.previousReportDate,
    proposals,
    translations,
    changes: dataset.changes,
  });
  return `${JSON.stringify(stored, null, 2)}\n`;
}

/** 排除观测时间，只让用户可见内容、翻译契约和变化事件触发发布。 */
export function datasetSemanticRevision(dataset: AtlasDataset): string {
  const semantic = {
    schemaVersion: dataset.schemaVersion,
    proposals: dataset.proposals.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      titleZh: proposal.titleZh,
      stage: proposal.stage,
      edition: proposal.edition,
      status: proposal.status,
      repositoryUrl: proposal.repositoryUrl,
      readme: proposal.readme,
      readmeHash: proposal.readmeHash,
      readmeZh: proposal.readmeZh,
      overview: proposal.overview,
      translation: proposal.translation
        ? {
            sourceHash: proposal.translation.sourceHash,
            policyVersion: proposal.translation.policyVersion,
            ...(proposal.translation.translatorFingerprint
              ? {
                  translatorFingerprint:
                    proposal.translation.translatorFingerprint,
                }
              : {}),
            model: proposal.translation.model,
          }
        : null,
    })),
    changes: dataset.changes,
  };
  return createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
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

async function readPublishedDataset(
  outputDirectory: string,
): Promise<Omit<WriteAtlasDatasetResult, 'changed'> | null> {
  try {
    const [serialized, manifestText] = await Promise.all([
      readFile(join(outputDirectory, DATASET_FILE_NAME), 'utf8'),
      readFile(join(outputDirectory, MANIFEST_FILE_NAME), 'utf8'),
    ]);
    const dataset = parseAtlasDataset(JSON.parse(serialized) as unknown);
    const manifest = parseDatasetManifest(JSON.parse(manifestText) as unknown);
    const expected = createDatasetManifest(dataset, serialized);
    if (
      manifest.revision !== expected.revision ||
      manifest.generatedAt !== expected.generatedAt ||
      manifest.checkedAt !== expected.checkedAt ||
      manifest.reportDate !== expected.reportDate ||
      manifest.dataset.sha256 !== expected.dataset.sha256 ||
      manifest.dataset.bytes !== expected.dataset.bytes
    ) {
      // 清单是数据集的派生索引；失配时按缓存未命中处理并重新生成。
      return null;
    }
    return { dataset, manifest, serialized };
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

/** 选择最近成功检查的有效快照，避免线上旧数据覆盖仓库内容。 */
export function selectPreviousDataset(
  remote: AtlasDataset | null,
  local: AtlasDataset | null,
): AtlasDataset | null {
  if (!remote) return local;
  if (!local) return remote;
  return remote.checkedAt >= local.checkedAt ? remote : local;
}

/** 获取最新英文内容并合并缓存，但不调用模型或修改正式数据集。 */
export async function prepareAtlasDataset(
  options: PrepareDatasetOptions,
): Promise<PrepareDatasetResult> {
  const datasetPath = join(options.outputDirectory, DATASET_FILE_NAME);
  const remote = options.previousUrl
    ? await fetchPreviousDataset(options.previousUrl)
    : null;
  const local = await readLocalDataset(datasetPath);
  const previous = selectPreviousDataset(remote, local) ?? emptyDataset();
  const incoming = await fetchTc39Proposals();
  const proposals = mergePublishedProposals(previous.proposals, incoming);
  const generatedAt = new Date();
  return {
    previous,
    dataset: buildAtlasDataset(
      previous,
      proposals,
      generatedAt,
      options.reportDate ?? reportDateAt(generatedAt),
    ),
  };
}

/** 只有翻译阶段才把数据集及其完整性清单写入正式发布目录。 */
export async function writeAtlasDataset(
  dataset: AtlasDataset,
  outputDirectory: string,
): Promise<{ manifest: DatasetManifest; serialized: string }> {
  const serialized = serializeDataset(dataset);
  const manifest = createDatasetManifest(dataset, serialized);
  await writeAtomically(join(outputDirectory, DATASET_FILE_NAME), serialized);
  await writeAtomically(
    join(outputDirectory, MANIFEST_FILE_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { manifest, serialized };
}

/** 语义未变化时只推进检查时间，保留上一份提案快照和变化历史。 */
export async function writeAtlasDatasetIfChanged(
  dataset: AtlasDataset,
  outputDirectory: string,
): Promise<WriteAtlasDatasetResult> {
  const published = await readPublishedDataset(outputDirectory);
  const semanticChanged =
    !published ||
    datasetSemanticRevision(published.dataset) !==
      datasetSemanticRevision(dataset);
  const next = semanticChanged
    ? dataset
    : {
        ...published.dataset,
        checkedAt: dataset.checkedAt,
        reportDate: dataset.reportDate,
        previousReportDate: dataset.previousReportDate,
      };
  const serialized = serializeDataset(next);
  if (published?.serialized === serialized) {
    return { ...published, changed: false };
  }
  const written = await writeAtlasDataset(next, outputDirectory);
  return { ...written, changed: true, dataset: next };
}
