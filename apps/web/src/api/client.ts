import type { ApiApp } from '@tc39-atlas/mcp/api';
import { hc, type InferResponseType } from 'hono/client';

const client = hc<ApiApp>('/');

export type ProposalListResponse = InferResponseType<
  typeof client.api.proposals.$get,
  200
>;
export type ProposalDetail = InferResponseType<
  (typeof client.api.proposals)[':id']['$get'],
  200
>;
export type ProposalChangesResponse = InferResponseType<
  typeof client.api.changes.$get,
  200
>;
export type HealthStatus = InferResponseType<
  typeof client.api.health.$get,
  200 | 503
>;
export type ProposalSummary = ProposalListResponse['proposals'][number];
export type ProposalChange = ProposalChangesResponse['changes'][number];
export type ProposalSnapshot = ProposalChange['after'];
export type ProposalStage = NonNullable<ProposalSummary['stage']>;
export type ProposalStatus = ProposalSummary['status'];
export type ProposalChangeKind = ProposalChange['kind'];

export interface ProposalQueryParams {
  stages?: ProposalStage[];
  editions?: number[];
  statuses?: ProposalStatus[];
  keywords?: string[];
  keyword_mode?: 'all' | 'any';
  limit?: number;
  offset?: number;
}

export async function fetchProposals(
  params: ProposalQueryParams = {},
  signal?: AbortSignal,
): Promise<ProposalListResponse> {
  const response = await client.api.proposals.$get(
    {
      query: {
        ...(params.stages?.length ? { stages: params.stages.join(',') } : {}),
        ...(params.editions?.length
          ? { editions: params.editions.join(',') }
          : {}),
        ...(params.statuses?.length
          ? { statuses: params.statuses.join(',') }
          : {}),
        ...(params.keywords?.length
          ? { keywords: params.keywords.join(',') }
          : {}),
        ...(params.keyword_mode ? { keyword_mode: params.keyword_mode } : {}),
        ...(params.limit === undefined ? {} : { limit: String(params.limit) }),
        ...(params.offset === undefined
          ? {}
          : { offset: String(params.offset) }),
      },
    },
    { init: { signal } },
  );
  if (!response.ok) {
    throw new Error(`获取提案列表失败 (HTTP ${response.status})`);
  }
  return response.json();
}

export async function fetchProposalDetail(
  id: string,
  signal?: AbortSignal,
): Promise<ProposalDetail> {
  const response = await client.api.proposals[':id'].$get(
    { param: { id } },
    { init: { signal } },
  );
  const status: number = response.status;
  if (!response.ok) {
    throw new Error(
      status === 404 ? '未找到指定提案' : `获取提案详情失败 (HTTP ${status})`,
    );
  }
  return response.json();
}

export async function fetchChanges(
  period: 'day' | 'week' | 'month' = 'day',
  limit = 500,
  signal?: AbortSignal,
): Promise<ProposalChangesResponse> {
  const response = await client.api.changes.$get(
    { query: { period, limit: String(limit) } },
    { init: { signal } },
  );
  const status: number = response.status;
  if (!response.ok) {
    throw new Error(`获取提案动态失败 (HTTP ${status})`);
  }
  return response.json();
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const response = await client.api.health.$get(undefined, {
    init: { signal },
  });
  const status: number = response.status;
  if (status !== 200 && status !== 503) {
    throw new Error(`请求健康检查接口失败 (HTTP ${status})`);
  }
  return response.json();
}
