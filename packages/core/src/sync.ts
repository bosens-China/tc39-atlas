import type {
  AtlasProposal,
  ProposalChange,
  ProposalChangeKind,
  ProposalSnapshot,
  SyncedProposal,
} from './model.js';

const CHANGE_RETENTION_DAYS = 35;

function snapshot(proposal: SyncedProposal | AtlasProposal): ProposalSnapshot {
  const { id, title, stage, edition, status, repositoryUrl } = proposal;
  return { id, title, stage, edition, status, repositoryUrl };
}

function change(
  proposal: SyncedProposal,
  kind: ProposalChangeKind,
  before: ProposalSnapshot | null,
): ProposalChange {
  return {
    id: `${proposal.syncedAt}:${proposal.id}:${kind}`,
    proposalId: proposal.id,
    kind,
    before,
    after: snapshot(proposal),
    occurredAt: proposal.syncedAt,
  };
}

// 变化计算保持为纯函数，生成失败时不会影响上一份已发布数据。
export function detectProposalChanges(
  current: readonly AtlasProposal[],
  incoming: readonly SyncedProposal[],
): ProposalChange[] {
  const byId = new Map(current.map((proposal) => [proposal.id, proposal]));
  const changes: ProposalChange[] = [];

  for (const proposal of incoming) {
    const before = byId.get(proposal.id);
    if (!before) {
      changes.push(change(proposal, 'added', null));
      continue;
    }
    const beforeSnapshot = snapshot(before);
    if (before.stage !== proposal.stage) {
      changes.push(change(proposal, 'stage_changed', beforeSnapshot));
    }
    if (before.status !== proposal.status && proposal.status !== 'active') {
      changes.push(change(proposal, proposal.status, beforeSnapshot));
    }
  }

  return changes;
}

export function mergeProposalChanges(
  previous: readonly ProposalChange[],
  current: readonly ProposalChange[],
  now: Date,
): ProposalChange[] {
  const cutoff = now.getTime() - CHANGE_RETENTION_DAYS * 86_400_000;
  const byId = new Map<string, ProposalChange>();
  for (const item of [...previous, ...current]) {
    if (Date.parse(item.occurredAt) >= cutoff) byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) =>
    right.occurredAt.localeCompare(left.occurredAt),
  );
}
