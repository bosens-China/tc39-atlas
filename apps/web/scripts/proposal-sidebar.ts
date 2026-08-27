import type { AtlasDataset, AtlasProposal } from '@tc39-atlas/core/model';

import {
  proposalRouteRelativePath,
  type ProposalRouteContext,
} from '../src/proposalRoute.js';
import {
  copy,
  hasMissingChineseTranslation,
  stageLabel,
  STAGES,
  type Language,
} from './doc-copy.js';

/** 用首次记录时间排序；历史数据缺少 added 事件时回退到同步时间。 */
export function proposalSidebar(
  dataset: AtlasDataset,
  language: Language,
): string {
  const addedAtById = new Map(
    dataset.changes
      .filter((change) => change.kind === 'added')
      .map((change) => [change.proposalId, change.detectedAt]),
  );
  const sortByTime = (left: AtlasProposal, right: AtlasProposal) => {
    const time = (proposal: AtlasProposal) =>
      addedAtById.get(proposal.id) ?? proposal.syncedAt;
    return (
      time(right).localeCompare(time(left)) ||
      left.title.localeCompare(right.title)
    );
  };
  // _meta.json 位于语言目录内，Rspress 会补 locale；这里只写语言内相对根路径。
  const link = (proposal: AtlasProposal, context: ProposalRouteContext) => ({
    type: 'custom-link',
    label: proposal.title,
    link: `/proposals/${proposalRouteRelativePath(proposal.id, context)}.html`,
    ...(language === 'zh' && hasMissingChineseTranslation(proposal)
      ? { tag: '未译' }
      : {}),
  });
  const items: unknown[] = [
    { type: 'file', name: 'index', label: copy[language].proposals },
    {
      type: 'section-header',
      label: language === 'zh' ? '按年份' : 'By edition',
    },
  ];
  const editions = [
    ...new Set(dataset.proposals.map((item) => item.edition)),
  ].sort((left, right) => (right ?? 0) - (left ?? 0));
  for (const edition of editions) {
    const proposals = dataset.proposals
      .filter((proposal) => proposal.edition === edition)
      .sort(sortByTime);
    items.push({
      type: 'custom-link',
      label:
        edition === null
          ? language === 'zh'
            ? '尚未进入标准'
            : 'Not yet included'
          : `ES${edition}`,
      collapsible: true,
      collapsed: true,
      items: proposals.map((proposal) =>
        link(proposal, { kind: 'year', value: edition }),
      ),
    });
  }
  items.push(
    { type: 'divider' },
    {
      type: 'section-header',
      label: language === 'zh' ? '按阶段' : 'By stage',
    },
  );
  for (const stage of STAGES) {
    const proposals = dataset.proposals
      .filter((proposal) => proposal.stage === stage)
      .sort(sortByTime);
    if (!proposals.length) continue;
    items.push({
      type: 'custom-link',
      label: stageLabel(stage, language),
      collapsible: true,
      collapsed: true,
      items: proposals.map((proposal) =>
        link(proposal, { kind: 'stage', value: stage }),
      ),
    });
  }
  return `${JSON.stringify(items, null, 2)}\n`;
}
