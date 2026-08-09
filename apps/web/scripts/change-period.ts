import type { ProposalChange } from '@tc39-atlas/core/model';

import type { Language } from './doc-copy.js';

export const CHANGE_PERIODS = [
  'today',
  'week',
  'month',
  'quarter',
  'year',
] as const;
export type ChangePeriod = (typeof CHANGE_PERIODS)[number];

const PERIOD_LABELS: Record<ChangePeriod, { zh: string; en: string }> = {
  today: { zh: '今日变化', en: 'Today' },
  week: { zh: '本周变化', en: 'This week' },
  month: { zh: '本月变化', en: 'This month' },
  quarter: { zh: '本季度变化', en: 'This quarter' },
  year: { zh: '本年变化', en: 'This year' },
};

export function changePeriodLabel(
  period: ChangePeriod,
  language: Language,
): string {
  return PERIOD_LABELS[period][language];
}

function periodStart(reference: Date, period: ChangePeriod): number {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const day = reference.getUTCDate();
  if (period === 'year') return Date.UTC(year, 0, 1);
  if (period === 'quarter') return Date.UTC(year, month - (month % 3), 1);
  if (period === 'month') return Date.UTC(year, month, 1);
  if (period === 'week') {
    const mondayOffset = (reference.getUTCDay() + 6) % 7;
    return Date.UTC(year, month, day - mondayOffset);
  }
  return Date.UTC(year, month, day);
}

/** 按数据集生成时间的 UTC 日历边界筛选，保证静态构建结果可复现。 */
export function filterChanges(
  changes: readonly ProposalChange[],
  generatedAt: string,
  period: ChangePeriod,
): ProposalChange[] {
  const reference = new Date(generatedAt);
  const start = periodStart(reference, period);
  const end = reference.getTime();
  return changes.filter((change) => {
    const time = Date.parse(change.occurredAt);
    return time >= start && time <= end;
  });
}
