import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DATASET_FILE_NAME,
  MANIFEST_FILE_NAME,
  buildAtlasDataset,
  createDatasetManifest,
  datasetSemanticRevision,
  mergePublishedProposals,
  selectPreviousDataset,
  serializeDataset,
  writeAtlasDatasetIfChanged,
} from './dataset.js';
import {
  DATASET_SCHEMA_VERSION,
  parseAtlasDataset,
  parseDatasetManifest,
} from './model.js';
import type { AtlasDataset, AtlasProposal, SyncedProposal } from './model.js';
import { detectProposalChanges } from './sync.js';
import {
  TRANSLATION_CONTRACT_VERSION,
  translationCacheKey,
  translationContentHash,
} from './translation.js';

const synced: SyncedProposal = {
  id: 'proposal-a',
  title: 'Proposal A',
  stage: 2,
  edition: null,
  status: 'active',
  repositoryUrl: 'https://github.com/tc39/proposal-a',
  readme: '# Proposal A',
  readmeHash: 'a'.repeat(64),
  syncedAt: '2026-08-08T00:00:00.000Z',
};
const translated: AtlasProposal = {
  ...synced,
  titleZh: '提案 A',
  readmeZh: '# 提案 A',
  overview: { en: 'Proposal A overview.', zh: '提案 A 速览。' },
  translation: {
    sourceHash: translationContentHash(synced),
    policyVersion: TRANSLATION_CONTRACT_VERSION,
    model: 'test',
    translatedAt: synced.syncedAt,
  },
};
const empty: AtlasDataset = {
  schemaVersion: DATASET_SCHEMA_VERSION,
  generatedAt: new Date(0).toISOString(),
  checkedAt: new Date(0).toISOString(),
  proposals: [],
  changes: [],
};

// 发布数据属于同一原子快照，任何手工修改都必须同步更新清单。
const publishedDataDirectory = resolve(
  import.meta.dirname,
  '../../../apps/web/docs/public/data',
);

describe('published dataset', () => {
  it('keeps the checked-in dataset and manifest consistent', async () => {
    const [serialized, manifestText] = await Promise.all([
      readFile(resolve(publishedDataDirectory, DATASET_FILE_NAME), 'utf8'),
      readFile(resolve(publishedDataDirectory, MANIFEST_FILE_NAME), 'utf8'),
    ]);
    const dataset = parseAtlasDataset(JSON.parse(serialized) as unknown);
    const manifest = parseDatasetManifest(JSON.parse(manifestText) as unknown);

    expect(manifest).toEqual(createDatasetManifest(dataset, serialized));
  });

  it('regenerates a stale manifest like a cache miss', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tc39-atlas-'));
    const serialized = serializeDataset(empty);
    const staleManifest = createDatasetManifest(empty, `${serialized}\n`);

    try {
      await Promise.all([
        writeFile(join(directory, DATASET_FILE_NAME), serialized, 'utf8'),
        writeFile(
          join(directory, MANIFEST_FILE_NAME),
          JSON.stringify(staleManifest),
          'utf8',
        ),
      ]);

      const result = await writeAtlasDatasetIfChanged(empty, directory);

      expect(result.changed).toBe(true);
      expect(result.manifest).toEqual(createDatasetManifest(empty, serialized));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps a newer repository snapshot instead of an older remote cache', () => {
    const older = {
      ...empty,
      generatedAt: '2026-08-08T00:00:00.000Z',
      checkedAt: '2026-08-08T00:00:00.000Z',
    };
    const newer = {
      ...empty,
      generatedAt: '2026-08-09T00:00:00.000Z',
      checkedAt: '2026-08-09T00:00:00.000Z',
    };

    expect(selectPreviousDataset(older, newer)).toBe(newer);
    expect(selectPreviousDataset(newer, older)).toBe(newer);
  });

  it('uses content fields and the contract version as cache conditions', () => {
    expect(mergePublishedProposals([translated], [synced])[0]).toMatchObject({
      titleZh: '提案 A',
      readmeZh: '# 提案 A',
      overview: { en: 'Proposal A overview.' },
      translation: {
        sourceHash: translationContentHash(synced),
        policyVersion: TRANSLATION_CONTRACT_VERSION,
      },
    });
    const oldPolicy = {
      ...translated,
      translation: { ...translated.translation, policyVersion: '3' },
    };
    expect(
      mergePublishedProposals([oldPolicy], [synced])[0]?.translation,
    ).toBeNull();
    expect(
      mergePublishedProposals(
        [translated],
        [{ ...synced, title: 'Proposal A changed' }],
      )[0],
    ).toMatchObject({
      titleZh: null,
      readmeZh: null,
      overview: null,
      translation: null,
    });

    const changedReadme = {
      ...synced,
      readme: '# Proposal A changed',
      readmeHash: 'b'.repeat(64),
    };
    expect(
      mergePublishedProposals([translated], [changedReadme])[0]?.translation,
    ).toBeNull();
  });

  it('reuses article translation when only Dataset maturity changes', () => {
    const changed = {
      ...synced,
      stage: 4 as const,
      status: 'finished' as const,
      edition: 2027,
    };

    expect(mergePublishedProposals([translated], [changed])[0]).toMatchObject({
      titleZh: translated.titleZh,
      readmeZh: translated.readmeZh,
      overview: translated.overview,
      translation: {
        sourceHash: translationContentHash(changed),
      },
    });
  });

  it('rejects older dataset schemas instead of migrating them at runtime', () => {
    expect(() =>
      parseAtlasDataset({
        schemaVersion: DATASET_SCHEMA_VERSION - 1,
        generatedAt: empty.generatedAt,
        checkedAt: empty.checkedAt,
        proposals: [],
        translations: {},
        changes: [],
      }),
    ).toThrow();
  });

  it('removes translation cache entries without a current proposal reference', () => {
    const stored = JSON.parse(
      serializeDataset({ ...empty, proposals: [translated] }),
    ) as {
      translations: Record<string, unknown>;
    };
    const unusedHash = 'f'.repeat(64);
    stored.translations[unusedHash] =
      stored.translations[translationCacheKey(translated)];

    const cleaned = JSON.parse(serializeDataset(parseAtlasDataset(stored))) as {
      translations: Record<string, unknown>;
    };

    expect(cleaned.translations).not.toHaveProperty(unusedHash);
    expect(cleaned.translations).toHaveProperty(
      translationCacheKey(translated),
    );
  });

  it('rejects missing and stale translation references', () => {
    const stored = JSON.parse(
      serializeDataset({ ...empty, proposals: [translated] }),
    ) as {
      proposals: Array<{ translationRef: string | null }>;
      translations: Record<string, unknown>;
    };
    const cacheKey = translationCacheKey(translated);
    const entry = stored.translations[cacheKey];
    if (!entry || !stored.proposals[0]) {
      throw new Error('Expected serialized translation fixture');
    }
    delete stored.translations[cacheKey];
    expect(() => parseAtlasDataset(stored)).toThrow(
      'Invalid translation reference',
    );

    const staleKey = 'f'.repeat(64);
    stored.proposals[0] = {
      ...stored.proposals[0],
      translationRef: staleKey,
    };
    stored.translations[staleKey] = entry;
    expect(() => parseAtlasDataset(stored)).toThrow(
      'Stale translation reference',
    );
  });

  it('serializes a schema-valid dataset and hashes its exact bytes', () => {
    const dataset = buildAtlasDataset(
      empty,
      [translated],
      new Date('2026-08-08T00:00:00.000Z'),
    );
    const serialized = serializeDataset(dataset);
    const manifest = createDatasetManifest(dataset, serialized);
    const stored = JSON.parse(serialized) as {
      proposals: Array<Record<string, unknown>>;
      translations: Record<string, unknown>;
    };

    expect(parseAtlasDataset(JSON.parse(serialized))).toEqual(dataset);
    expect(stored.proposals[0]).toMatchObject({
      translationRef: translationCacheKey(translated),
    });
    expect(Object.keys(stored.translations)).toEqual([
      translationCacheKey(translated),
    ]);
    expect(dataset.changes).toEqual([]);
    expect(manifest.revision).toBe(manifest.dataset.sha256);
    expect(manifest.dataset.bytes).toBe(Buffer.byteLength(serialized));

    const nextProposal: AtlasProposal = {
      ...translated,
      id: 'proposal-b',
      title: 'Proposal B',
      syncedAt: '2026-08-09T00:00:00.000Z',
    };
    const next = buildAtlasDataset(
      dataset,
      [translated, nextProposal],
      new Date('2026-08-09T00:00:00.000Z'),
    );
    expect(next.changes).toMatchObject([
      { proposalId: 'proposal-b', kind: 'added' },
    ]);

    const legacyInitial: AtlasDataset = {
      ...dataset,
      generatedAt: '2026-08-08T00:00:00.000Z',
      checkedAt: '2026-08-08T00:00:00.000Z',
      changes: detectProposalChanges([], [translated]),
    };
    const anchored = buildAtlasDataset(
      legacyInitial,
      [translated],
      new Date('2026-08-09T00:00:00.000Z'),
    );
    expect(anchored.changes).toEqual([]);
  });

  it('ignores observation timestamps in the semantic revision', () => {
    const first = {
      ...empty,
      generatedAt: '2026-08-08T00:00:00.000Z',
      checkedAt: '2026-08-08T00:00:00.000Z',
      proposals: [translated],
    };
    const observedLater = {
      ...first,
      generatedAt: '2026-08-09T00:00:00.000Z',
      checkedAt: '2026-08-09T00:00:00.000Z',
      proposals: [
        {
          ...translated,
          syncedAt: '2026-08-09T00:00:00.000Z',
          translation: {
            ...translated.translation,
            translatedAt: '2026-08-09T00:00:00.000Z',
          },
        },
      ],
    };

    expect(datasetSemanticRevision(observedLater)).toBe(
      datasetSemanticRevision(first),
    );
    expect(
      datasetSemanticRevision({
        ...observedLater,
        proposals: [
          { ...observedLater.proposals[0]!, title: 'Proposal A changed' },
        ],
      }),
    ).not.toBe(datasetSemanticRevision(first));
    expect(
      datasetSemanticRevision({
        ...observedLater,
        changes: detectProposalChanges([], [translated]),
      }),
    ).not.toBe(datasetSemanticRevision(first));
  });
});
