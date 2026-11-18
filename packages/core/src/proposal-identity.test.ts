import { describe, expect, it } from 'vitest';

import {
  buildAtlasDataset,
  mergePublishedProposals,
  serializeDataset,
} from './dataset.js';
import {
  DATASET_SCHEMA_VERSION,
  parseAtlasDataset,
  type AtlasDataset,
  type AtlasProposal,
} from './model.js';
import { reconcileProposalIds } from './proposal-identity.js';
import { getProposals } from './queries.js';
import {
  TRANSLATION_CONTRACT_VERSION,
  translationContentHash,
} from './translation.js';
import { createTranslationPlan } from './translation-workflow.js';

const previous: AtlasProposal = {
  id: 'abort-controller',
  title: 'Abort Controller',
  stage: 1,
  edition: null,
  status: 'active',
  repositoryUrl: 'https://github.com/bakkot/structured-concurrency-for-js',
  syncedAt: '2026-11-15T00:00:00.000Z',
  readme: '# Proposal',
  readmeHash: 'a'.repeat(64),
  titleZh: '控制器',
  readmeZh: '# 提案',
  overview: { en: 'Overview', zh: '速览' },
  translation: null,
};
previous.translation = {
  sourceHash: translationContentHash(previous),
  policyVersion: TRANSLATION_CONTRACT_VERSION,
  model: 'test',
  translatedAt: previous.syncedAt,
};
const incoming = {
  ...previous,
  id: 'abortcontroller',
  syncedAt: '2026-11-18T00:00:00.000Z',
};
const baseline: AtlasDataset = {
  schemaVersion: DATASET_SCHEMA_VERSION,
  generatedAt: previous.syncedAt,
  checkedAt: previous.syncedAt,
  reportDate: '2026-11-15',
  previousReportDate: '2026-11-14',
  proposals: [previous],
  changes: [],
};

describe('stable Atlas proposal identity', () => {
  it('persists confirmed source identity through serialization and later title, repository and sharing changes', () => {
    const first = buildAtlasDataset(
      baseline,
      mergePublishedProposals([previous], [incoming]),
      new Date(incoming.syncedAt),
    );
    const restored = parseAtlasDataset(
      JSON.parse(serializeDataset(first)) as unknown,
    );
    expect(restored.proposals[0]?.sourceId).toBe(incoming.id);
    const moved = {
      ...incoming,
      title: 'New scope',
      repositoryUrl: 'https://github.com/tc39/moved',
    };
    const shared = {
      ...moved,
      id: 'another-proposal',
      title: 'Separate capability',
    };
    const next = mergePublishedProposals(restored.proposals, [moved, shared]);
    expect(next.map((proposal) => proposal.id)).toEqual([
      previous.id,
      shared.id,
    ]);
    expect(next[0]?.translation).toBeNull();
    const events = buildAtlasDataset(
      restored,
      next,
      new Date('2026-11-19T00:00:00Z'),
    ).changes;
    expect(events.map((event) => event.proposalId)).toEqual([shared.id]);
  });

  it('rejects an upstream ID reusing an already published Atlas ID', () => {
    const aliased = { ...previous, sourceId: incoming.id };
    const collision = {
      ...incoming,
      id: previous.id,
      title: 'Different',
      repositoryUrl: 'https://github.com/tc39/different',
    };
    expect(() =>
      reconcileProposalIds([aliased], [incoming, collision]),
    ).toThrow('Conflicting Atlas proposal IDs');
  });

  it('does not reuse a proposal already matched by its source ID', () => {
    const aliased = { ...previous, sourceId: incoming.id };
    const moved = {
      ...incoming,
      repositoryUrl: 'https://github.com/tc39/moved',
    };
    const other = { ...incoming, id: 'other-source' };
    expect(
      reconcileProposalIds([aliased], [moved, other]).map(
        (proposal) => proposal.id,
      ),
    ).toEqual([previous.id, other.id]);
  });

  it('keeps published IDs, query identity and translation cache when only the upstream ID changes', () => {
    const proposals = mergePublishedProposals([previous], [incoming]);
    const dataset = buildAtlasDataset(
      baseline,
      proposals,
      new Date(incoming.syncedAt),
    );
    expect(proposals[0]?.id).toBe(previous.id);
    expect(proposals[0]?.translation).toEqual(previous.translation);
    expect(getProposals(proposals, [previous.id])).toHaveLength(1);
    expect(dataset.changes).toEqual([]);
    expect(createTranslationPlan(baseline, dataset).items).toEqual([]);
    expect(incoming.id).toBe('abortcontroller');
  });

  it('recognizes the observed title spacing change without suppressing real content translation or stage events', () => {
    const proposals = mergePublishedProposals(
      [previous],
      [{ ...incoming, title: 'AbortController', stage: 2 }],
    );
    const dataset = buildAtlasDataset(
      baseline,
      proposals,
      new Date(incoming.syncedAt),
    );
    expect(proposals[0]?.id).toBe(previous.id);
    expect(proposals[0]?.translation).toBeNull();
    expect(
      dataset.changes.map((event) => [event.proposalId, event.kind]),
    ).toEqual([[previous.id, 'stage_changed']]);
    expect(createTranslationPlan(baseline, dataset).items[0]?.reasons).toEqual([
      'title_changed',
    ]);
    expect(reconcileProposalIds(proposals, [incoming])[0]?.id).toBe(
      previous.id,
    );
  });

  it('keeps a content change pending even when the upstream ID changes', () => {
    const proposals = mergePublishedProposals(
      [previous],
      [{ ...incoming, readme: 'Changed' }],
    );
    const dataset = buildAtlasDataset(
      baseline,
      proposals,
      new Date(incoming.syncedAt),
    );
    expect(createTranslationPlan(baseline, dataset).items[0]?.reasons).toEqual([
      'readme_changed',
    ]);
  });

  it('prefers existing IDs even when their repository moves', () => {
    const moved = {
      ...incoming,
      id: previous.id,
      repositoryUrl: 'https://github.com/tc39/new-repo',
    };
    expect(reconcileProposalIds([previous], [moved])).toEqual([moved]);
  });

  it('does not match a different proposal that reuses the same repository', () => {
    const replacement = { ...incoming, title: 'A different capability' };
    expect(reconcileProposalIds([previous], [replacement])).toEqual([
      replacement,
    ]);
  });

  it('does not discard meaningful punctuation from titles', () => {
    const before = { ...previous, title: 'Operator +' };
    const after = { ...incoming, title: 'Operator -' };
    expect(reconcileProposalIds([before], [after])).toEqual([after]);
  });

  it('never merges shared repositories, splits, or merges', () => {
    const other = { ...previous, id: 'other' };
    expect(reconcileProposalIds([previous, other], [incoming])).toEqual([
      incoming,
    ]);
    const split = { ...incoming, id: 'split' };
    expect(reconcileProposalIds([previous], [incoming, split])).toEqual([
      incoming,
      split,
    ]);
  });

  it('does not steal an ID that is still in the incoming snapshot', () => {
    const reused = {
      ...previous,
      repositoryUrl: 'https://github.com/tc39/elsewhere',
    };
    expect(reconcileProposalIds([previous], [reused, incoming])).toEqual([
      reused,
      incoming,
    ]);
  });

  it.each([
    'https://tc39.es/dataset/',
    'https://example.com/proposal',
    'https://github.com/owner',
    'https://github.com/owner/repo/tree/main',
  ])('does not treat %s as a unique repository identity', (repositoryUrl) => {
    const next = { ...incoming, repositoryUrl };
    expect(
      reconcileProposalIds([{ ...previous, repositoryUrl }], [next]),
    ).toEqual([next]);
  });

  it('normalizes GitHub repository casing and suffixes', () => {
    const next = {
      ...incoming,
      repositoryUrl: `${previous.repositoryUrl.toUpperCase()}.git/`,
    };
    expect(reconcileProposalIds([previous], [next])[0]?.id).toBe(previous.id);
  });
});
