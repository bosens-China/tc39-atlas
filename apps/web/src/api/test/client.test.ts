import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@rspress/core/runtime', () => ({
  normalizeImagePath: (path: string) => `/base${path}`,
}));

import { fetchDataset, selectChanges, selectProposals } from '../client';

const proposal = {
  id: 'proposal-test',
  title: 'Test Proposal',
  titleZh: '测试提案',
  titleTranslation: {
    sourceHash: 'b'.repeat(64),
    policyVersion: '1',
    model: 'test',
    translatedAt: '2026-08-08T08:00:00.000Z',
  },
  stage: 3 as const,
  edition: null,
  status: 'active' as const,
  repositoryUrl: 'https://github.com/tc39/proposal-test',
  syncedAt: '2026-08-08T08:00:00.000Z',
  readme: '# Test Proposal',
  readmeHash: 'a'.repeat(64),
  readmeZh: '# 测试提案',
  translation: {
    sourceHash: 'a'.repeat(64),
    policyVersion: '2',
    model: 'test',
    translatedAt: '2026-08-08T08:00:00.000Z',
  },
};

const dataset = {
  schemaVersion: 2 as const,
  generatedAt: '2026-08-08T08:00:00.000Z',
  proposals: [proposal],
  changes: [
    {
      id: 'change-1',
      proposalId: proposal.id,
      kind: 'added' as const,
      before: null,
      after: {
        id: proposal.id,
        title: proposal.title,
        stage: proposal.stage,
        edition: proposal.edition,
        status: proposal.status,
        repositoryUrl: proposal.repositoryUrl,
      },
      occurredAt: '2026-08-08T08:00:00.000Z',
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('静态数据客户端', () => {
  it('从 Pages 相对路径读取并在浏览器内筛选分页', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(dataset), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await fetchDataset(controller.signal);
    const result = selectProposals(loaded, {
      stages: [3],
      statuses: ['active'],
      keywords: ['test'],
      limit: 20,
      offset: 0,
    });

    expect(fetchMock).toHaveBeenCalledWith('/base/data/dataset.json', {
      signal: controller.signal,
    });
    expect(result).toMatchObject({
      total: 1,
      proposals: [
        {
          id: 'proposal-test',
          title_zh: '测试提案',
          repository_url: proposal.repositoryUrl,
          data_updated_at: proposal.syncedAt,
        },
      ],
    });
  });

  it('返回指定周期变化', () => {
    expect(
      selectChanges(dataset, 'day', 500, new Date('2026-08-08T12:00:00.000Z')),
    ).toMatchObject({
      period: 'day',
      changes: [{ id: 'change-1' }],
    });
  });

  it('对无效数据给出可展示错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ schemaVersion: 99 }), { status: 200 }),
        ),
    );
    await expect(fetchDataset()).rejects.toThrow('读取提案数据失败');
  });
});
