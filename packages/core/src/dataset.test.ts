import { describe, expect, it } from 'vitest';

import {
  buildAtlasDataset,
  createDatasetManifest,
  mergePublishedProposals,
  serializeDataset,
} from './dataset.js';
import { DATASET_SCHEMA_VERSION, parseAtlasDataset } from './model.js';
import type { AtlasDataset, AtlasProposal, SyncedProposal } from './model.js';

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
  titleTranslation: {
    sourceHash: 'b'.repeat(64),
    policyVersion: '1',
    model: 'test',
    translatedAt: synced.syncedAt,
  },
  readmeZh: '# 提案 A',
  translation: {
    sourceHash: synced.readmeHash,
    policyVersion: '2',
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
  it('reuses only translations matching README and policy hashes', () => {
    expect(mergePublishedProposals([translated], [synced])[0]).toMatchObject({
      titleZh: null,
      readmeZh: '# 提案 A',
      translation: { sourceHash: synced.readmeHash, policyVersion: '2' },
    });
    expect(
      mergePublishedProposals(
        [translated],
        [{ ...synced, readmeHash: 'b'.repeat(64) }],
      )[0],
    ).toMatchObject({ readmeZh: null, translation: null });
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
    expect(manifest.revision).toBe(manifest.dataset.sha256);
    expect(manifest.dataset.bytes).toBe(Buffer.byteLength(serialized));
  });
});
