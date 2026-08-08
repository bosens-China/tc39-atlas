import { describe, expect, it } from 'vitest';

import type { SyncedProposal } from './model.js';
import { detectProposalChanges } from './sync.js';

const syncedAt = new Date('2026-08-08T00:00:00.000Z');

function proposal(overrides: Partial<SyncedProposal> = {}): SyncedProposal {
  return {
    id: 'proposal-a',
    title: 'Proposal A',
    stage: 2,
    edition: null,
    status: 'active',
    repositoryUrl: 'https://github.com/tc39/proposal-a',
    readme: '# Proposal A',
    readmeHash: 'hash-a',
    syncedAt,
    ...overrides,
  };
}

describe('proposal synchronization', () => {
  it('records added, stage, and terminal status changes', () => {
    const current = [proposal()];
    const incoming = [
      proposal({ stage: 4, status: 'finished' }),
      proposal({ id: 'proposal-b', title: 'Proposal B' }),
    ];

    expect(
      detectProposalChanges(current, incoming).map((change) => change.kind),
    ).toEqual(['stage_changed', 'finished', 'added']);
  });
});
