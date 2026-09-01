import { describe, expect, it } from 'vitest';

import type { AtlasProposal, SyncedProposal } from './model.js';
import { detectProposalChanges, mergeProposalChanges } from './sync.js';

const syncedAt = '2026-08-08T00:00:00.000Z';

function synced(overrides: Partial<SyncedProposal> = {}): SyncedProposal {
  return {
    id: 'proposal-a',
    title: 'Proposal A',
    stage: 2,
    edition: null,
    status: 'active',
    repositoryUrl: 'https://github.com/tc39/proposal-a',
    readme: '# Proposal A',
    readmeHash: 'a'.repeat(64),
    syncedAt,
    ...overrides,
  };
}

function published(overrides: Partial<AtlasProposal> = {}): AtlasProposal {
  return {
    ...synced(),
    titleZh: null,
    readmeZh: null,
    overview: null,
    translation: null,
    ...overrides,
  };
}

describe('proposal synchronization', () => {
  it('records added, stage, and terminal status changes', () => {
    const changes = detectProposalChanges(
      [published()],
      [
        synced({ stage: 4, status: 'finished' }),
        synced({ id: 'proposal-b', title: 'Proposal B' }),
      ],
      '2026-08-08',
    );
    expect(changes.map((item) => item.kind)).toEqual([
      'stage_changed',
      'finished',
      'added',
    ]);
    expect(changes[0]?.id).toContain('proposal-a:stage_changed');
  });

  it('retains one year of changes and deduplicates events', () => {
    const current = detectProposalChanges([], [synced()], '2026-08-08');
    const retained = current.map((item) => ({
      ...item,
      id: 'retained',
      detectedAt: '2026-01-01T00:00:00.000Z',
    }));
    const expired = current.map((item) => ({
      ...item,
      id: 'expired',
      detectedAt: '2025-08-06T00:00:00.000Z',
    }));
    expect(
      mergeProposalChanges(
        [...current, ...retained, ...expired],
        current,
        new Date('2026-08-08T00:00:00.000Z'),
      ).map((item) => item.id),
    ).toEqual([current[0]?.id, 'retained']);
  });
});
