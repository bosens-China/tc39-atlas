import type {
  AtlasProposal,
  ProposalChange,
  ProposalDetail,
  ProposalFilter,
  ProposalSummary,
} from './model.js';

const MAX_RESULTS = 500;

function summary(proposal: AtlasProposal): ProposalSummary {
  const {
    id,
    title,
    titleZh,
    stage,
    edition,
    status,
    repositoryUrl,
    syncedAt,
  } = proposal;
  return {
    id,
    title,
    titleZh,
    stage,
    edition,
    status,
    repositoryUrl,
    syncedAt,
  };
}

function includesKeywords(
  proposal: AtlasProposal,
  keywords: readonly string[],
  mode: 'all' | 'any',
): boolean {
  const haystack = [
    proposal.id,
    proposal.title,
    proposal.titleZh ?? '',
    proposal.readme,
    proposal.readmeZh ?? '',
    proposal.overview?.en ?? '',
    proposal.overview?.zh ?? '',
  ]
    .join('\n')
    .toLocaleLowerCase();
  const matches = keywords
    .map((keyword) => keyword.trim().toLocaleLowerCase())
    .filter(Boolean)
    .map((keyword) => haystack.includes(keyword));
  return (
    matches.length === 0 ||
    (mode === 'any' ? matches.some(Boolean) : matches.every(Boolean))
  );
}

function matchesFilter(
  proposal: AtlasProposal,
  filter: ProposalFilter,
): boolean {
  if (
    filter.stages?.length &&
    (proposal.stage === null || !filter.stages.includes(proposal.stage))
  ) {
    return false;
  }
  if (
    filter.editions?.length &&
    (proposal.edition === null || !filter.editions.includes(proposal.edition))
  ) {
    return false;
  }
  if (filter.statuses?.length && !filter.statuses.includes(proposal.status)) {
    return false;
  }
  return includesKeywords(
    proposal,
    filter.keywords ?? [],
    filter.keywordMode ?? 'all',
  );
}

// 查询规则集中在 core，确保各个静态入口使用同一语义。
export function searchProposals(
  proposals: readonly AtlasProposal[],
  filter: ProposalFilter = {},
): { proposals: ProposalSummary[]; total: number } {
  const offset = Math.max(0, filter.offset ?? 0);
  const limit = Math.min(Math.max(1, filter.limit ?? MAX_RESULTS), MAX_RESULTS);
  const matches = proposals
    .filter((proposal) => matchesFilter(proposal, filter))
    .sort(
      (left, right) =>
        (right.stage ?? -1) - (left.stage ?? -1) ||
        left.title.localeCompare(right.title),
    );
  return {
    proposals: matches.slice(offset, offset + limit).map(summary),
    total: matches.length,
  };
}

export function getProposals(
  proposals: readonly AtlasProposal[],
  ids: readonly string[],
  includeReadme = true,
): Array<ProposalSummary | ProposalDetail> {
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  return ids.flatMap((id) => {
    const proposal = byId.get(id);
    if (!proposal) return [];
    return [includeReadme ? proposal : summary(proposal)];
  });
}

export function getProposalChanges(
  changes: readonly ProposalChange[],
  since: Date,
  limit = MAX_RESULTS,
): ProposalChange[] {
  const sinceTime = since.getTime();
  return changes
    .filter((change) => Date.parse(change.occurredAt) >= sinceTime)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, Math.min(Math.max(1, limit), MAX_RESULTS));
}
