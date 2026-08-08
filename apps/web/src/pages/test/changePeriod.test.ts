import { describe, expect, it } from 'vitest';

import { readChangePeriod, writeChangePeriod } from '../changePeriod';

describe('变化周期 URL 参数', () => {
  it('应当校验周期并省略默认值', () => {
    expect(readChangePeriod(new URLSearchParams('period=month'))).toBe('month');
    expect(readChangePeriod(new URLSearchParams('period=invalid'))).toBe('day');
    expect(writeChangePeriod('day').toString()).toBe('');
    expect(writeChangePeriod('week').toString()).toBe('period=week');
  });
});
