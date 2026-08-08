import type {
  ProposalQueryParams,
  ProposalStage,
  ProposalStatus,
} from '../api/client';

export interface ProposalSearch extends ProposalQueryParams {
  keyword_mode: 'all' | 'any';
  limit: number;
  offset: number;
}

export const DEFAULT_PROPOSAL_SEARCH: ProposalSearch = {
  keyword_mode: 'all',
  limit: 24,
  offset: 0,
};

const VALID_STAGES = new Set<number>([0, 1, 2, 2.7, 3, 4]);
const VALID_STATUSES = new Set<ProposalStatus>([
  'active',
  'finished',
  'inactive',
  'withdrawn',
]);

function toValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',');
  return value == null ? [] : [value];
}

function readNumber(value: unknown, fallback: number, min: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

/** 把地址栏中的未知值收敛为 API 可接受的筛选条件。 */
export function validateProposalSearch(
  search: Record<string, unknown>,
): ProposalSearch {
  const stages = toValues(search.stages)
    .map(Number)
    .filter((stage): stage is ProposalStage => VALID_STAGES.has(stage));
  const editions = toValues(search.editions)
    .map(Number)
    .filter(
      (edition) =>
        Number.isInteger(edition) && /^20\d{2}$/.test(String(edition)),
    );
  const statuses = toValues(search.statuses).filter(
    (status): status is ProposalStatus =>
      typeof status === 'string' &&
      VALID_STATUSES.has(status as ProposalStatus),
  );
  const keywords = toValues(search.keywords).filter(
    (keyword): keyword is string =>
      typeof keyword === 'string' && keyword.trim().length > 0,
  );

  return {
    ...(stages.length ? { stages } : {}),
    ...(editions.length ? { editions } : {}),
    ...(statuses.length ? { statuses } : {}),
    ...(keywords.length ? { keywords } : {}),
    keyword_mode: search.keyword_mode === 'any' ? 'any' : 'all',
    limit: Math.min(readNumber(search.limit, 24, 1), 500),
    offset: readNumber(search.offset, 0, 0),
  };
}

export function readProposalSearch(params: URLSearchParams): ProposalSearch {
  return validateProposalSearch(Object.fromEntries(params.entries()));
}

export function writeProposalSearch(
  search: ProposalQueryParams,
): URLSearchParams {
  const value = validateProposalSearch({ ...search });
  const params = new URLSearchParams();
  if (value.stages?.length) params.set('stages', value.stages.join(','));
  if (value.editions?.length) params.set('editions', value.editions.join(','));
  if (value.statuses?.length) params.set('statuses', value.statuses.join(','));
  if (value.keywords?.length) params.set('keywords', value.keywords.join(','));
  if (value.keyword_mode !== DEFAULT_PROPOSAL_SEARCH.keyword_mode) {
    params.set('keyword_mode', value.keyword_mode);
  }
  if (value.limit !== DEFAULT_PROPOSAL_SEARCH.limit) {
    params.set('limit', String(value.limit));
  }
  if (value.offset !== DEFAULT_PROPOSAL_SEARCH.offset) {
    params.set('offset', String(value.offset));
  }
  return params;
}
