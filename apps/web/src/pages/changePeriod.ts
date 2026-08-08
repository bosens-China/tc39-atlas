export type ChangePeriod = 'day' | 'week' | 'month';

export function readChangePeriod(params: URLSearchParams): ChangePeriod {
  const period = params.get('period');
  return period === 'week' || period === 'month' ? period : 'day';
}

export function writeChangePeriod(period: ChangePeriod): URLSearchParams {
  const params = new URLSearchParams();
  if (period !== 'day') params.set('period', period);
  return params;
}
