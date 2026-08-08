import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchChanges,
  fetchHealth,
  fetchProposalDetail,
  fetchProposals,
} from './client';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Hono API 客户端', () => {
  it('应当把筛选条件交给 hc 生成查询地址', async () => {
    const controller = new AbortController();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({ proposals: [], total: 0, limit: 20, offset: 0 }),
      );

    await fetchProposals(
      {
        stages: [3, 4],
        editions: [2024],
        statuses: ['active', 'finished'],
        keywords: ['decorator', 'meta'],
        keyword_mode: 'any',
        limit: 20,
        offset: 0,
      },
      controller.signal,
    );

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      '/api/proposals?stages=3%2C4&editions=2024&statuses=active%2Cfinished&keywords=decorator%2Cmeta&keyword_mode=any&limit=20&offset=0',
    );
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('应当返回类型安全的提案列表', async () => {
    const mockData = {
      proposals: [
        {
          id: 'proposal-test',
          title: 'Test Proposal',
          stage: 3,
          edition: null,
          status: 'active',
          repository_url: 'https://github.com/tc39/proposal-test',
          data_updated_at: '2026-08-08T08:00:00.000Z',
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse(mockData));

    await expect(fetchProposals()).resolves.toEqual(mockData);
  });

  it('应当把详情 404 转换为可展示错误', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error: 'proposal_not_found' }, 404),
    );

    await expect(fetchProposalDetail('not-exist')).rejects.toThrow(
      '未找到指定提案',
    );
  });

  it('应当把 503 健康状态作为正常结果返回', async () => {
    const health = { status: 'unavailable', latest_sync: null };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse(health, 503),
    );

    await expect(fetchHealth()).resolves.toEqual(health);
  });

  it('应当获取指定周期的变更列表', async () => {
    const changes = {
      period: 'day',
      since: '2026-08-08T00:00:00Z',
      changes: [],
    };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(changes));

    await expect(fetchChanges('day')).resolves.toEqual(changes);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      '/api/changes?period=day&limit=500',
    );
  });
});
