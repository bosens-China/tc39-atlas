import { describe, expect, it } from 'vitest';

import {
  buildAtlasDataset,
  createDatasetManifest,
  mergePublishedProposals,
  selectPreviousDataset,
  serializeDataset,
} from './dataset.js';
import { DATASET_SCHEMA_VERSION, parseAtlasDataset } from './model.js';
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
  proposals: [],
  changes: [],
};

describe('published dataset', () => {
  it('keeps a newer repository snapshot instead of an older remote cache', () => {
    const older = {
      ...empty,
      generatedAt: '2026-08-08T00:00:00.000Z',
    };
    const newer = {
      ...empty,
      generatedAt: '2026-08-09T00:00:00.000Z',
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
      changes: detectProposalChanges([], [translated]),
    };
    const anchored = buildAtlasDataset(
      legacyInitial,
      [translated],
      new Date('2026-08-09T00:00:00.000Z'),
    );
    expect(anchored.changes).toEqual([]);
  });
});
