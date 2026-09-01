import { reportDateSchema } from './model.js';

export const INITIAL_REPORT_DATE = '1970-01-01';
export const REPORT_TIME_ZONE = 'Asia/Shanghai';

/** 把实际检查时间归入稳定的北京时间日更批次。 */
export function reportDateAt(date: Date): string {
  const parts = new Map(
    new Intl.DateTimeFormat('en', {
      timeZone: REPORT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const year = parts.get('year');
  const month = parts.get('month');
  const day = parts.get('day');
  if (!year || !month || !day) {
    throw new Error('Unable to derive report date');
  }
  return reportDateSchema.parse(`${year}-${month}-${day}`);
}
