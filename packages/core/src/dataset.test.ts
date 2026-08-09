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
  TRANSLATION_POLICY_VERSION,
  articleSourceHash,
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
  quickReview: { en: 'Proposal A review.', zh: '提案 A 审查。' },
  translation: {
    sourceHash: articleSourceHash(synced),
    policyVersion: TRANSLATION_POLICY_VERSION,
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

  it('reuses only complete article output matching source and policy', () => {
    expect(mergePublishedProposals([translated], [synced])[0]).toMatchObject({
      titleZh: '提案 A',
      readmeZh: '# 提案 A',
      quickReview: { en: 'Proposal A review.' },
      translation: {
        sourceHash: articleSourceHash(synced),
        policyVersion: TRANSLATION_POLICY_VERSION,
      },
    });
    expect(
      mergePublishedProposals(
        [
          {
            ...translated,
            translation: { ...translated.translation, policyVersion: '3' },
          },
        ],
        [synced],
      )[0],
    ).toMatchObject({
      titleZh: null,
      readmeZh: null,
      quickReview: null,
      translation: null,
    });
  });

  it('migrates a schema v2 snapshot into the new article shape', () => {
    const legacy = {
      schemaVersion: 2,
      generatedAt: empty.generatedAt,
      changes: [],
      proposals: [
        {
          ...translated,
          titleTranslation: translated.translation,
          quickReview: undefined,
        },
      ],
    };

    expect(parseAtlasDataset(legacy)).toMatchObject({
      schemaVersion: DATASET_SCHEMA_VERSION,
      proposals: [{ titleZh: '提案 A', quickReview: null }],
    });
  });

  it('serializes a schema-valid dataset and hashes its exact bytes', () => {
    const dataset = buildAtlasDataset(
      empty,
      [translated],
      new Date('2026-08-08T00:00:00.000Z'),
    );
    const serialized = serializeDataset(dataset);
    const manifest = createDatasetManifest(dataset, serialized);

    expect(parseAtlasDataset(JSON.parse(serialized))).toEqual(dataset);
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
