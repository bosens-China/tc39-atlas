import { describe, expect, it } from 'vitest';

import type { AtlasProposal } from './model.js';
import {
  getProposalChanges,
  getProposals,
  searchProposals,
} from './queries.js';

const base: AtlasProposal = {
  id: 'proposal-a',
  title: 'Iterator Helpers',
  titleZh: '迭代器辅助方法',
  stage: 3,
  edition: null,
  status: 'active',
  repositoryUrl: 'https://github.com/tc39/proposal-iterator-helpers',
  syncedAt: '2026-08-08T00:00:00.000Z',
  readme: '# Iterator helpers',
  readmeHash: 'a'.repeat(64),
  readmeZh: '# 迭代器辅助方法',
  overview: { en: 'Iterator helper overview.', zh: '迭代器辅助方法速览。' },
  translation: {
    sourceHash: 'a'.repeat(64),
    policyVersion: '2',
    model: 'test',
    translatedAt: '2026-08-08T00:00:00.000Z',
  },
};

describe('proposal queries', () => {
  it('combines filters, keyword modes, sorting, and pagination', () => {
    const proposals: AtlasProposal[] = [
      base,
      {
        ...base,
        id: 'proposal-b',
        title: 'Metadata',
        titleZh: '元数据',
        stage: 2.7,
        readme: '# Decorator metadata',
      },
      {
        ...base,
        id: 'proposal-c',
        title: 'Finished',
        titleZh: null,
        stage: 4,
        status: 'finished',
        readmeZh: null,
        overview: null,
        translation: null,
      },
    ];

    expect(
      searchProposals(proposals, {
        stages: [2.7, 3],
        statuses: ['active'],
        keywords: ['metadata', 'decorator'],
        keywordMode: 'all',
      }),
    ).toMatchObject({ total: 1, proposals: [{ id: 'proposal-b' }] });
    expect(
      searchProposals(proposals, {
        keywords: ['辅助方法', 'metadata'],
        keywordMode: 'any',
        limit: 1,
        offset: 1,
      }),
    ).toMatchObject({ total: 2, proposals: [{ id: 'proposal-b' }] });
  });

  it('preserves requested detail order and filters changes by time', () => {
    const second = { ...base, id: 'proposal-b', title: 'Proposal B' };
    expect(
      getProposals([base, second], ['proposal-b', 'missing', 'proposal-a']),
    ).toEqual([second, base]);

    const changes = [
      {
        id: 'new',
        proposalId: base.id,
        kind: 'added' as const,
        before: null,
        after: base,
        detectedAt: '2026-08-08T00:00:00.000Z',
      },
      {
        id: 'old',
        proposalId: base.id,
        kind: 'added' as const,
        before: null,
        after: base,
        detectedAt: '2026-07-01T00:00:00.000Z',
      },
    ];
    expect(getProposalChanges(changes, new Date('2026-08-01'))).toHaveLength(1);
  });
});
