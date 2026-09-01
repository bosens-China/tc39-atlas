import type { ProposalChange } from '@tc39-atlas/core/model';
import { describe, expect, it } from 'vitest';

import { changePeriodRange, filterChanges } from '../change-period.js';

function change(id: string, reportDate: string): ProposalChange {
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
    detectedAt: `${reportDate}T00:00:00.000Z`,
    reportDate,
  };
}

describe('rolling change periods', () => {
  const reportDate = '2026-08-31';
  const previousReportDate = '2026-08-30';
  const changes = [
    change('today', '2026-08-31'),
    change('week', '2026-08-25'),
    change('week-boundary', '2026-08-24'),
    change('month', '2026-08-01'),
    change('month-boundary', '2026-07-31'),
    change('quarter', '2026-06-01'),
    change('quarter-boundary', '2026-05-31'),
    change('year', '2025-09-01'),
    change('year-boundary', '2025-08-31'),
    change('future', '2026-09-01'),
  ];

  it.each([
    ['today', ['today']],
    ['week', ['today', 'week']],
    ['month', ['today', 'week', 'week-boundary', 'month']],
    [
      'quarter',
      ['today', 'week', 'week-boundary', 'month', 'month-boundary', 'quarter'],
    ],
    [
      'year',
      [
        'today',
        'week',
        'week-boundary',
        'month',
        'month-boundary',
        'quarter',
        'quarter-boundary',
        'year',
      ],
    ],
  ] as const)('filters %s using persisted daily batches', (period, ids) => {
    const range = changePeriodRange(reportDate, previousReportDate, period);
    expect(filterChanges(changes, range).map((item) => item.id)).toEqual(ids);
  });

  it('uses the previous successful batch for the latest daily update', () => {
    expect(changePeriodRange('2026-09-01', '2026-08-29', 'today')).toEqual({
      startExclusive: '2026-08-29',
      endInclusive: '2026-09-01',
    });
  });

  it.each([
    ['2026-03-31', 'month', '2026-02-28'],
    ['2028-03-31', 'month', '2028-02-29'],
    ['2026-01-31', 'quarter', '2025-10-31'],
    ['2026-01-01', 'year', '2025-01-01'],
  ] as const)('clamps %s %s calendar subtraction', (end, period, start) => {
    expect(changePeriodRange(end, null, period).startExclusive).toBe(start);
  });
});
