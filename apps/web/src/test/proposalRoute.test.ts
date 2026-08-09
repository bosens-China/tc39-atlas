import { describe, expect, it } from 'vitest';

import { proposalRoutePath, proposalRouteSegment } from '../proposalRoute';

describe('proposalRoute', () => {
  it('生成可在 Pages 直接访问的双语 HTML 路径', () => {
    expect(proposalRoutePath('proposal-decorators', 'zh')).toBe(
      '/proposals/proposal-decorators.html',
    );
    expect(proposalRoutePath('proposal-decorators', 'en')).toBe(
      '/en/proposals/proposal-decorators.html',
    );
    expect(
      proposalRoutePath('proposal-decorators', 'zh', {
        kind: 'year',
        value: 2026,
      }),
    ).toBe('/proposals/year/2026/proposal-decorators.html');
    expect(
      proposalRoutePath('proposal-decorators', 'en', {
        kind: 'stage',
        value: 2.7,
      }),
    ).toBe('/en/proposals/stage/2.7/proposal-decorators.html');
  });

  it('为缺失年份和阶段生成稳定路径', () => {
    expect(
      proposalRoutePath('proposal-example', 'zh', {
        kind: 'year',
        value: null,
      }),
    ).toBe('/proposals/year/pending/proposal-example.html');
    expect(
      proposalRoutePath('proposal-example', 'zh', {
        kind: 'stage',
        value: null,
      }),
    ).toBe('/proposals/stage/unstaged/proposal-example.html');
  });

  it('拒绝可逃逸生成目录的提案 ID', () => {
    expect(() => proposalRouteSegment('../dataset')).toThrow(
      '提案 ID 无法安全用于路由',
    );
  });
});
