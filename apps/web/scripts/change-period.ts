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
  today: { zh: '本次日更', en: 'Latest daily update' },
  week: { zh: '近 7 日变化', en: 'Last 7 days' },
  month: { zh: '近 1 个月变化', en: 'Last month' },
  quarter: { zh: '近 3 个月变化', en: 'Last 3 months' },
  year: { zh: '近 1 年变化', en: 'Last year' },
};

export interface ChangePeriodRange {
  endInclusive: string;
  startExclusive: string;
}

export function changePeriodLabel(
  period: ChangePeriod,
  language: Language,
): string {
  return PERIOD_LABELS[period][language];
}

function reportDateParts(value: string): readonly [number, number, number] {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Invalid report date: ${value}`);
  return [year, month - 1, day];
}

function formatReportDate(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function subtractDays(value: string, days: number): string {
  const [year, month, day] = reportDateParts(value);
  return formatReportDate(Date.UTC(year, month, day - days));
}

/** 日历月减法在月末自动收敛到目标月份的最后一天。 */
function subtractMonths(value: string, months: number): string {
  const [year, month, day] = reportDateParts(value);
  const target = year * 12 + month - months;
  const targetYear = Math.floor(target / 12);
  const targetMonth = target - targetYear * 12;
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  return formatReportDate(
    Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)),
  );
}

export function changePeriodRange(
  reportDate: string,
  previousReportDate: string | null,
  period: ChangePeriod,
): ChangePeriodRange {
  const startExclusive =
    period === 'today'
      ? (previousReportDate ?? subtractDays(reportDate, 1))
      : period === 'week'
        ? subtractDays(reportDate, 7)
        : subtractMonths(
            reportDate,
            period === 'month' ? 1 : period === 'quarter' ? 3 : 12,
          );
  return { startExclusive, endInclusive: reportDate };
}

/** 按持久化日更批次筛选，普通构建不会改变滚动窗口。 */
export function filterChanges(
  changes: readonly ProposalChange[],
  range: ChangePeriodRange,
): ProposalChange[] {
  return changes.filter(
    (change) =>
      change.reportDate > range.startExclusive &&
      change.reportDate <= range.endInclusive,
  );
}
