import {
  parseAtlasDataset,
  type AtlasDataset,
  type ProposalChange as CoreProposalChange,
  type ProposalFilter,
  type ProposalSnapshot as CoreProposalSnapshot,
  type ProposalStage,
  type ProposalStatus,
  type ProposalSummary as CoreProposalSummary,
} from '@tc39-atlas/core/model';
import { getProposalChanges, searchProposals } from '@tc39-atlas/core/queries';
import { normalizeImagePath } from '@rspress/core/runtime';

export type { ProposalStage, ProposalStatus };
export type ProposalChangeKind = CoreProposalChange['kind'];

export interface ProposalSummary {
  id: string;
  title: string;
  title_zh: string | null;
  stage: ProposalStage | null;
  edition: number | null;
  status: ProposalStatus;
  repository_url: string;
  data_updated_at: string;
}

export interface ProposalSnapshot {
  id: string;
  title: string;
  stage: ProposalStage | null;
  edition: number | null;
  status: ProposalStatus;
  repository_url: string;
}

export interface ProposalChange {
  id: string;
  proposal_id: string;
  kind: ProposalChangeKind;
  before: ProposalSnapshot | null;
  after: ProposalSnapshot;
  occurred_at: string;
}

export interface ProposalListResponse {
  proposals: ProposalSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProposalChangesResponse {
  period: 'day' | 'week' | 'month';
  since: string;
  changes: ProposalChange[];
}

export interface ProposalQueryParams {
  stages?: ProposalStage[];
  editions?: number[];
  statuses?: ProposalStatus[];
  keywords?: string[];
  keyword_mode?: 'all' | 'any';
  limit?: number;
  offset?: number;
}

function requestError(error: unknown, action: string): Error {
  return new Error(
    error instanceof Error
      ? `${action}失败：${error.message}`
      : `${action}失败`,
  );
}

export async function fetchDataset(
  signal?: AbortSignal,
): Promise<AtlasDataset> {
  try {
    const response = await fetch(normalizeImagePath('/data/dataset.json'), {
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseAtlasDataset(await response.json());
  } catch (error: unknown) {
    throw requestError(error, '读取提案数据');
  }
}

function jsonSnapshot(proposal: CoreProposalSnapshot): ProposalSnapshot {
  return {
    id: proposal.id,
    title: proposal.title,
    stage: proposal.stage,
    edition: proposal.edition,
    status: proposal.status,
    repository_url: proposal.repositoryUrl,
  };
}

function jsonSummary(proposal: CoreProposalSummary): ProposalSummary {
  return {
    ...jsonSnapshot(proposal),
    title_zh: proposal.titleZh,
    data_updated_at: proposal.syncedAt,
  };
}

function jsonChange(change: CoreProposalChange): ProposalChange {
  return {
    id: change.id,
    proposal_id: change.proposalId,
    kind: change.kind,
    before: change.before ? jsonSnapshot(change.before) : null,
    after: jsonSnapshot(change.after),
    occurred_at: change.occurredAt,
  };
}

export function selectProposals(
  dataset: AtlasDataset,
  params: ProposalQueryParams = {},
): ProposalListResponse {
  const filter: ProposalFilter = {
    ...(params.stages ? { stages: params.stages } : {}),
    ...(params.editions ? { editions: params.editions } : {}),
    ...(params.statuses ? { statuses: params.statuses } : {}),
    ...(params.keywords ? { keywords: params.keywords } : {}),
    keywordMode: params.keyword_mode ?? 'all',
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
  };
  const result = searchProposals(dataset.proposals, filter);
  return {
    proposals: result.proposals.map(jsonSummary),
    total: result.total,
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  };
}

export function selectChanges(
  dataset: AtlasDataset,
  period: 'day' | 'week' | 'month' = 'day',
  limit = 500,
  now = new Date(),
): ProposalChangesResponse {
  const days = { day: 1, week: 7, month: 30 }[period];
  const since = new Date(now.getTime() - days * 86_400_000);
  return {
    period,
    since: since.toISOString(),
    changes: getProposalChanges(dataset.changes, since, limit).map(jsonChange),
  };
}
