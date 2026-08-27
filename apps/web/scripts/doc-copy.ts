import type {
  AtlasProposal,
  ProposalStage,
  ProposalStatus,
} from '@tc39-atlas/core/model';

export const LANGUAGES = ['zh', 'en'] as const;
export const STAGES: readonly (ProposalStage | null)[] = [
  4,
  3,
  2.7,
  2,
  1,
  0,
  null,
];
export type Language = (typeof LANGUAGES)[number];

export const copy = {
  zh: {
    proposals: '提案目录',
    proposalsDescription: '按阶段浏览 TC39 提案、中文译文与官方原文。',
    changes: '周期动态',
    changesDescription: '按 UTC 日历周期查看 TC39 提案变化。',
    indexTip: '使用左侧栏按阶段浏览，或使用右上角全文搜索查找标题与正文。',
    emptyProposals:
      '当前数据集还没有提案。完成同步后，这里会自动生成提案目录。',
    emptyChanges: '这个时间范围内没有记录到提案变化。',
    overview: '提案概览',
    proposalOverview: '提案速览',
    stage: '阶段',
    status: '状态',
    edition: 'ECMAScript 版本',
    syncedAt: '同步时间',
    repository: '官方仓库',
    alternate: 'English original',
    missingTranslation: '暂无中文译文，请切换到英文原文阅读。',
    missingSource: '上游仓库未提供 README。',
    readmeSourceNotice:
      '以下 README 来自上游仓库，其中的阶段或状态标注可能滞后；当前信息以提案概览为准。',
    title: '提案',
    event: '变化',
    detectedAt: '检测时间',
    unstaged: '未分阶段',
  },
  en: {
    proposals: 'Proposal index',
    proposalsDescription:
      'Browse TC39 proposals, translations, and source text by stage.',
    changes: 'Recent changes',
    changesDescription: 'TC39 proposal changes grouped by UTC calendar period.',
    indexTip:
      'Browse by stage in the sidebar, or use full-text search in the top-right corner.',
    emptyProposals:
      'The current dataset has no proposals. This index will be generated after synchronization.',
    emptyChanges: 'No proposal changes were recorded in this period.',
    overview: 'Proposal details',
    proposalOverview: 'Proposal overview',
    stage: 'Stage',
    status: 'Status',
    edition: 'ECMAScript edition',
    syncedAt: 'Synchronized',
    repository: 'Source repository',
    alternate: '中文译文',
    missingTranslation: '',
    missingSource: 'The upstream repository does not provide a README.',
    readmeSourceNotice:
      'The README below comes from the upstream repository and may contain outdated stage or status metadata. Use the proposal details above as the current source of truth.',
    title: 'Proposal',
    event: 'Change',
    detectedAt: 'Detected',
    unstaged: 'Unstaged',
  },
} as const;

/** 统一文档和侧边栏中的阶段、状态与日期表达。 */
export function stageLabel(
  stage: ProposalStage | null,
  language: Language,
): string {
  return stage === null ? copy[language].unstaged : `Stage ${stage}`;
}

export function statusLabel(
  status: ProposalStatus,
  language: Language,
): string {
  const labels: Record<ProposalStatus, readonly [string, string]> = {
    active: ['进行中', 'Active'],
    finished: ['已完成', 'Finished'],
    inactive: ['不活跃', 'Inactive'],
    withdrawn: ['已撤回', 'Withdrawn'],
  };
  return labels[status][language === 'zh' ? 0 : 1];
}

export function formatDate(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function formatDateTime(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
    hourCycle: 'h23',
  }).format(new Date(value));
}

export function markdownText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('|', '\\|')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export function localizedTitle(
  proposal: AtlasProposal,
  language: Language,
): string {
  return language === 'zh'
    ? (proposal.titleZh ?? proposal.title)
    : proposal.title;
}

/** 只在确实有英文内容待翻译时标记缺失，不误报上游空 README。 */
export function hasMissingChineseTranslation(proposal: AtlasProposal): boolean {
  return (
    !proposal.titleZh?.trim() ||
    (Boolean(proposal.readme.trim()) && !proposal.readmeZh?.trim()) ||
    !proposal.overview?.en.trim() ||
    !proposal.overview.zh.trim()
  );
}
