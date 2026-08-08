import {
  and,
  asc,
  count,
  desc,
  gte,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';

import type { Database } from './database.js';
import type {
  ProposalDetail,
  ProposalFilter,
  ProposalChange,
  ProposalSummary,
} from './model.js';
import { proposalChanges, proposals } from './schema.js';
import { TRANSLATION_POLICY_VERSION } from './translation.js';

const summaryColumns = {
  id: proposals.id,
  title: proposals.title,
  stage: proposals.stage,
  edition: proposals.edition,
  status: proposals.status,
  repositoryUrl: proposals.repositoryUrl,
  syncedAt: proposals.syncedAt,
};

const detailColumns = {
  ...summaryColumns,
  readme: proposals.readme,
  readmeZh: sql<string | null>`case
    when ${proposals.readmeZhSourceHash} = ${proposals.readmeHash}
      and ${proposals.translationPolicyVersion} = ${TRANSLATION_POLICY_VERSION}
    then ${proposals.readmeZh}
    else null
  end`,
};

function buildConditions(filter: ProposalFilter): SQL | undefined {
  const conditions: SQL[] = [];

  if (filter.stages?.length) {
    conditions.push(inArray(proposals.stage, [...filter.stages]));
  }
  if (filter.editions?.length) {
    conditions.push(inArray(proposals.edition, [...filter.editions]));
  }
  if (filter.statuses?.length) {
    conditions.push(inArray(proposals.status, [...filter.statuses]));
  }

  const keywordConditions = filter.keywords
    ?.map((keyword) => keyword.trim())
    .filter(Boolean)
    .map((keyword) => {
      const pattern = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`;
      return or(
        ilike(proposals.id, pattern),
        ilike(proposals.title, pattern),
        ilike(proposals.readme, pattern),
      );
    })
    .filter((condition): condition is SQL => condition !== undefined);

  if (keywordConditions?.length) {
    const keywords =
      filter.keywordMode === 'any'
        ? or(...keywordConditions)
        : and(...keywordConditions);
    if (keywords) conditions.push(keywords);
  }

  return and(...conditions);
}

// 查询条件集中在 core，确保 Web 与 MCP 共享完全一致的数据语义。
export async function searchProposals(
  db: Database,
  filter: ProposalFilter = {},
): Promise<ProposalSummary[]> {
  return db
    .select(summaryColumns)
    .from(proposals)
    .where(buildConditions(filter))
    .orderBy(desc(proposals.stage), asc(proposals.title))
    .limit(Math.min(filter.limit ?? 500, 500))
    .offset(filter.offset ?? 0);
}

export async function countProposals(
  db: Database,
  filter: ProposalFilter = {},
): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(proposals)
    .where(buildConditions(filter));
  return result?.value ?? 0;
}

export async function getProposals(
  db: Database,
  ids: readonly string[],
  includeReadme = true,
): Promise<Array<ProposalSummary | ProposalDetail>> {
  if (ids.length === 0) return [];

  const rows = includeReadme
    ? await db
        .select(detailColumns)
        .from(proposals)
        .where(inArray(proposals.id, [...ids]))
    : await db
        .select(summaryColumns)
        .from(proposals)
        .where(inArray(proposals.id, [...ids]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

export async function getProposalChanges(
  db: Database,
  since: Date,
  limit = 500,
): Promise<ProposalChange[]> {
  return db
    .select()
    .from(proposalChanges)
    .where(gte(proposalChanges.occurredAt, since))
    .orderBy(desc(proposalChanges.occurredAt), desc(proposalChanges.id))
    .limit(Math.min(limit, 500));
}
