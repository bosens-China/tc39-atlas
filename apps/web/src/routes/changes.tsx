import { createFileRoute } from '@tanstack/react-router';
import { ChangesPage } from '../pages/ChangesPage';

export type ChangePeriod = 'day' | 'week' | 'month';

export interface ChangesSearch {
  period: ChangePeriod;
}

export function validateChangesSearch(
  search: Record<string, unknown>,
): ChangesSearch {
  const period = search.period;
  return {
    period:
      period === 'week' || period === 'month' || period === 'day'
        ? period
        : 'day',
  };
}

export const Route = createFileRoute('/changes')({
  validateSearch: validateChangesSearch,
  component: ChangesPage,
});
