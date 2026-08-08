const SAFE_PROPOSAL_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

/** 提案 ID 同时作为稳定 URL 片段和生成文件名，拒绝不安全的上游值。 */
export function proposalRouteSegment(id: string): string {
  if (!SAFE_PROPOSAL_ID.test(id)) {
    throw new Error(`提案 ID 无法安全用于路由：${id}`);
  }
  return id;
}

/** React 运行时生成的链接显式带上产物后缀，保证 GitHub Pages 可直接访问。 */
export function proposalRoutePath(id: string, lang: string): string {
  const localePrefix = lang === 'zh' ? '' : '/en';
  return `${localePrefix}/proposals/${proposalRouteSegment(id)}.html`;
}
