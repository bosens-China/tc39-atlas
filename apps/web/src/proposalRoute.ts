const SAFE_PROPOSAL_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

export type ProposalRouteContext =
  | { kind: 'year'; value: number | null }
  | { kind: 'stage'; value: number | null };

/** 提案 ID 同时作为稳定 URL 片段和生成文件名，拒绝不安全的上游值。 */
export function proposalRouteSegment(id: string): string {
  if (!SAFE_PROPOSAL_ID.test(id)) {
    throw new Error(`提案 ID 无法安全用于路由：${id}`);
  }
  return id;
}

/** 年份与阶段是两种浏览上下文，使用不同的文件系统路由。 */
export function proposalRouteRelativePath(
  id: string,
  context?: ProposalRouteContext,
): string {
  const proposal = proposalRouteSegment(id);
  if (!context) return proposal;
  const fallback = context.kind === 'year' ? 'pending' : 'unstaged';
  return `${context.kind}/${context.value ?? fallback}/${proposal}`;
}

/** 显式带上产物后缀，保证 GitHub Pages 可直接访问。 */
export function proposalRoutePath(
  id: string,
  lang: string,
  context?: ProposalRouteContext,
): string {
  const localePrefix = lang === 'zh' ? '' : '/en';
  return `${localePrefix}/proposals/${proposalRouteRelativePath(id, context)}.html`;
}
