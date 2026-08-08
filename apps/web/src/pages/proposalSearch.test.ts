import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROPOSAL_SEARCH,
  validateProposalSearch,
} from './proposalSearch';

describe('提案路由搜索参数', () => {
  it('应当提供稳定默认值', () => {
    expect(validateProposalSearch({})).toEqual(DEFAULT_PROPOSAL_SEARCH);
  });

  it('应当兼容旧的逗号分隔链接与新的数组参数', () => {
    expect(
      validateProposalSearch({
        stages: '2.7,3,99',
        editions: [2024, 'invalid'],
        statuses: ['active', 'unknown'],
        keywords: 'decorator,metadata',
        keyword_mode: 'any',
        limit: '48',
        offset: '48',
      }),
    ).toEqual({
      stages: [2.7, 3],
      editions: [2024],
      statuses: ['active'],
      keywords: ['decorator', 'metadata'],
      keyword_mode: 'any',
      limit: 48,
      offset: 48,
    });
  });

  it('应当丢弃非法枚举并限制分页大小', () => {
    expect(
      validateProposalSearch({
        stages: 'oops',
        statuses: 'deleted',
        limit: 999,
        offset: -1,
      }),
    ).toEqual({ keyword_mode: 'all', limit: 500, offset: 0 });
  });
});
