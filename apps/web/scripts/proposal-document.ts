import type { AtlasProposal } from '@tc39-atlas/core/model';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { bundledLanguagesInfo } from 'shiki';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import {
  proposalRoutePath,
  type ProposalRouteContext,
} from '../src/proposalRoute.js';
import {
  copy,
  formatDate,
  localizedTitle,
  markdownText,
  stageLabel,
  statusLabel,
  type Language,
} from './doc-copy.js';

export const GENERATED_NOTICE =
  '<!-- 此文件由 pnpm generate:docs 自动生成，请勿手工修改。 -->';
const CODE_LANGUAGE_BY_ALIAS = new Map(
  bundledLanguagesInfo.flatMap((language) =>
    [language.id, ...(language.aliases ?? [])].map(
      (alias) => [alias.toLowerCase(), language.id] as const,
    ),
  ),
);
const NEXT_HEADING_DEPTH = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 6,
} as const;

function isRelativeUrl(url: string): boolean {
  return !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url);
}

function repositoryFileUrl(
  repositoryUrl: string,
  value: string,
  kind: 'blob' | 'raw',
): string {
  if (value.startsWith('//')) return `https:${value}`;
  if (!isRelativeUrl(value)) return value;
  const repository = repositoryUrl.replace(/\/$/, '');
  if (!repository.startsWith('https://github.com/')) return value;

  const suffixIndex = value.search(/[?#]/);
  const path = (suffixIndex === -1 ? value : value.slice(0, suffixIndex))
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
  const suffix = suffixIndex === -1 ? '' : value.slice(suffixIndex);
  return path ? `${repository}/${kind}/HEAD/${path}${suffix}` : value;
}

/** 使用 Markdown AST 规范化链接，避免生成页把仓库相对路径指向 Pages。 */
export function normalizeReadme(
  markdown: string,
  repositoryUrl: string,
): string {
  if (!markdown.trim()) return '';
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkStringify, { bullet: '-', listItemIndent: 'one' });
  const tree = processor.parse(markdown);
  const imageReferences = new Set<string>();

  // 页面保留唯一的官方英文一级标题，上游 README 作为正文整体下沉一级。
  visit(tree, 'heading', (node) => {
    node.depth = NEXT_HEADING_DEPTH[node.depth];
  });
  visit(tree, 'imageReference', (node) => {
    imageReferences.add(node.identifier);
  });
  visit(tree, 'link', (node) => {
    node.url = repositoryFileUrl(repositoryUrl, node.url, 'blob');
  });
  visit(tree, 'image', (node) => {
    node.url = repositoryFileUrl(repositoryUrl, node.url, 'raw');
  });
  visit(tree, 'definition', (node) => {
    node.url = repositoryFileUrl(
      repositoryUrl,
      node.url,
      imageReferences.has(node.identifier) ? 'raw' : 'blob',
    );
  });
  visit(tree, 'code', (node) => {
    if (!node.lang) return;
    const language = node.lang.replaceAll('`', '').trim().toLowerCase();
    node.lang = CODE_LANGUAGE_BY_ALIAS.get(language) ?? null;
  });

  return processor.stringify(tree);
}

function frontmatter(
  proposal: AtlasProposal,
  language: Language,
  context?: ProposalRouteContext,
): string {
  const description =
    language === 'zh'
      ? `《${localizedTitle(proposal, language)}》TC39 提案的中文译文、阶段和版本信息。`
      : `${proposal.title}: TC39 proposal text, stage, and edition metadata.`;
  const value = (input: unknown) => JSON.stringify(input);

  return [
    '---',
    `title: ${value(proposal.title)}`,
    `description: ${value(description)}`,
    'pageType: doc',
    'footer: false',
    ...(context ? ['search: false'] : []),
    `proposalId: ${value(proposal.id)}`,
    `proposalStage: ${value(proposal.stage)}`,
    `proposalStatus: ${value(proposal.status)}`,
    `proposalEdition: ${value(proposal.edition)}`,
    `tag: ${value(proposal.stage === null ? '?' : `S${proposal.stage}`)}`,
    '---',
  ].join('\n');
}

function proposalOverview(
  proposal: AtlasProposal,
  language: Language,
  context?: ProposalRouteContext,
): string {
  const value = copy[language];
  const alternateLanguage = language === 'zh' ? 'en' : 'zh';
  const edition = proposal.edition ? `ES${proposal.edition}` : '—';
  return [
    `:::info ${value.overview}`,
    '',
    `- **${value.stage}**: ${stageLabel(proposal.stage, language)}`,
    `- **${value.status}**: ${statusLabel(proposal.status, language)}`,
    `- **${value.edition}**: ${edition}`,
    `- **${value.syncedAt}**: ${formatDate(proposal.syncedAt, language)}`,
    `- [${value.alternate}](${proposalRoutePath(proposal.id, alternateLanguage, context)}) · [${value.repository}](${proposal.repositoryUrl})`,
    '',
    ':::',
  ].join('\n');
}

function proposalBody(
  proposal: AtlasProposal,
  language: Language,
  context?: ProposalRouteContext,
): string {
  const source = language === 'zh' ? proposal.readmeZh : proposal.readme;
  const chineseTitle = localizedTitle(proposal, 'zh');
  const subtitle =
    language === 'zh' && chineseTitle !== proposal.title
      ? `> **中文标题**：${markdownText(chineseTitle)}`
      : '';
  const missing =
    language === 'zh' && !proposal.readme.trim()
      ? `:::warning\n${copy.zh.missingSource}\n:::\n`
      : language === 'zh' && !source?.trim()
        ? `:::warning\n${copy.zh.missingTranslation}\n:::\n`
        : '';
  const readme = source?.trim()
    ? normalizeReadme(source, proposal.repositoryUrl)
    : language === 'en'
      ? '> The upstream repository does not provide a README.\n'
      : '';
  const overview = proposal.overview?.[language];
  const overviewBlock = overview?.trim()
    ? `:::tip ${copy[language].proposalOverview}\n${markdownText(overview)}\n:::`
    : '';
  const readmeSourceNotice = proposal.readme.trim()
    ? `:::note\n${copy[language].readmeSourceNotice}\n:::`
    : '';
  return [
    subtitle,
    proposalOverview(proposal, language, context),
    overviewBlock,
    readmeSourceNotice,
    missing,
    readme,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function proposalDocument(
  proposal: AtlasProposal,
  language: Language,
  context?: ProposalRouteContext,
): string {
  return [
    frontmatter(proposal, language, context),
    '',
    GENERATED_NOTICE,
    '',
    `# ${markdownText(proposal.title)}`,
    '',
    proposalBody(proposal, language, context).trimEnd(),
    '',
  ].join('\n');
}
