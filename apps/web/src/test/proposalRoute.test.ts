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
  });

  it('拒绝可逃逸生成目录的提案 ID', () => {
    expect(() => proposalRouteSegment('../dataset')).toThrow(
      '提案 ID 无法安全用于路由',
    );
  });
});
