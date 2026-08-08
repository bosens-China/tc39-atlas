import { drizzle } from 'drizzle-orm/pg-proxy';
import { describe, expect, it } from 'vitest';

import type { Database } from './database.js';
import { getProposals, searchProposals } from './queries.js';
import * as schema from './schema.js';

describe('proposal queries', () => {
  it('combines filters and escapes LIKE wildcards', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const proxy = drizzle(
      async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
      { schema },
    );

    await searchProposals(proxy as unknown as Database, {
      stages: [2.7],
      statuses: ['active'],
      keywords: ['iterator', '100%_ready'],
      keywordMode: 'all',
      limit: 25,
      offset: 5,
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain('from "proposals"');
    expect(queries[0]?.params).toEqual([
      '2.7',
      'active',
      '%iterator%',
      '%iterator%',
      '%iterator%',
      '%100\\%\\_ready%',
      '%100\\%\\_ready%',
      '%100\\%\\_ready%',
      25,
      5,
    ]);

    await searchProposals(proxy as unknown as Database, {
      keywords: ['iterator', 'helpers'],
      keywordMode: 'any',
    });

    expect(queries[0]?.sql).toContain(') and (');
    expect(queries[1]?.sql).toContain(') or (');
  });

  it('only exposes a translation matching the current README and policy', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const proxy = drizzle(
      async (sql, params) => {
        queries.push({ sql, params });
        return { rows: [] };
      },
      { schema },
    );

    await getProposals(proxy as unknown as Database, ['proposal-a'], true);

    expect(queries[0]?.sql).toContain('case');
    expect(queries[0]?.sql).toContain('readme_zh_source_hash');
    expect(queries[0]?.sql).toContain('translation_policy_version');
    expect(queries[0]?.params).toContain('1');
  });
});
