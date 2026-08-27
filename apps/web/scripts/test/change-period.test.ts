import type { ProposalChange } from '@tc39-atlas/core/model';
import { describe, expect, it } from 'vitest';

import { filterChanges } from '../change-period.js';

function change(id: string, detectedAt: string): ProposalChange {
  return {
    id,
    proposalId: id,
    kind: 'added',
    before: null,
    after: {
      id,
      title: id,
      stage: 1,
      edition: null,
      status: 'active',
      repositoryUrl: `https://github.com/tc39/${id}`,
    },
    detectedAt,
  };
}

describe('change periods', () => {
  const checkedAt = '2026-08-09T12:00:00.000Z';
  const changes = [
    change('today', '2026-08-09T00:00:00.000Z'),
    change('week', '2026-08-03T00:00:00.000Z'),
    change('month', '2026-08-01T00:00:00.000Z'),
    change('quarter', '2026-07-01T00:00:00.000Z'),
    change('year', '2026-01-01T00:00:00.000Z'),
    change('previous-year', '2025-12-31T23:59:59.000Z'),
    change('future', '2026-08-09T12:00:01.000Z'),
  ];

  it.each([
    ['today', ['today']],
    ['week', ['today', 'week']],
    ['month', ['today', 'week', 'month']],
    ['quarter', ['today', 'week', 'month', 'quarter']],
    ['year', ['today', 'week', 'month', 'quarter', 'year']],
  ] as const)('filters %s using UTC calendar boundaries', (period, ids) => {
    expect(
      filterChanges(changes, checkedAt, period).map((item) => item.id),
    ).toEqual(ids);
  });
});
