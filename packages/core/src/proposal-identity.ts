import type { SyncedProposal } from './model.js';

type ProposalIdentity = Pick<
  SyncedProposal,
  'id' | 'sourceId' | 'title' | 'repositoryUrl'
>;

/** 只把明确的 GitHub 仓库作为辅助身份，公共数据入口不能代表单个提案。 */
function repositoryIdentity(value: string): string | null {
  const url = new URL(value);
  const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.username ||
    url.password ||
    parts.length !== 2
  )
    return null;
  return parts
    .join('/')
    .replace(/\.git$/i, '')
    .toLowerCase();
}

function uniqueRepositories<T extends ProposalIdentity>(
  proposals: readonly T[],
): Map<string, T | null> {
  const result = new Map<string, T | null>();
  for (const proposal of proposals) {
    const key = repositoryIdentity(proposal.repositoryUrl);
    if (key) result.set(key, result.has(key) ? null : proposal);
  }
  return result;
}

function titleIdentity(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/gu, '');
}

/**
 * Atlas ID 是已经发布的引用，不随上游 ID 的拼写变化而改变。
 * 优先按 ID 延续；只有前后快照均为一仓库一提案、且旧 ID 已消失、标题仅格式变化时才补充匹配。
 * 共享仓库、拆分、合并或无法证明身份的记录保持上游 ID，避免错误继承历史。
 */
export function reconcileProposalIds(
  previous: readonly ProposalIdentity[],
  incoming: readonly SyncedProposal[],
): SyncedProposal[] {
  const previousBySource = new Map(
    previous.map((proposal) => [proposal.sourceId ?? proposal.id, proposal]),
  );
  if (previousBySource.size !== previous.length)
    throw new Error('Ambiguous previous proposal source IDs');
  const incomingIds = new Set(incoming.map((proposal) => proposal.id));
  const previousRepositories = uniqueRepositories(previous);
  const incomingRepositories = uniqueRepositories(incoming);

  const reconciled = incoming.map((proposal) => {
    const sourceId = proposal.sourceId ?? proposal.id;
    const known = previousBySource.get(sourceId);
    // 已确认的源 ID 关系跨轮次保留，不受之后标题或仓库变化影响。
    if (known)
      return {
        ...proposal,
        id: known.id,
        ...(known.sourceId ? { sourceId } : {}),
      };
    const key = repositoryIdentity(proposal.repositoryUrl);
    if (!key || !incomingRepositories.get(key)) return proposal;
    const before = previousRepositories.get(key);
    if (
      !before ||
      incomingIds.has(before.id) ||
      incomingIds.has(before.sourceId ?? before.id) ||
      !titleIdentity(proposal.title) ||
      titleIdentity(before.title) !== titleIdentity(proposal.title)
    )
      return proposal;
    return { ...proposal, id: before.id, sourceId };
  });
  // 上游重新占用旧 Atlas ID 时拒绝发布，不能猜测或生成重复路由。
  if (
    new Set(reconciled.map((proposal) => proposal.id)).size !==
    reconciled.length
  ) {
    throw new Error(
      'Conflicting Atlas proposal IDs after identity reconciliation',
    );
  }
  return reconciled;
}
