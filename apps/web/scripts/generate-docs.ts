import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAtlasDataset,
  type AtlasDataset,
  type AtlasProposal,
} from '@tc39-atlas/core/model';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { bundledLanguagesInfo } from 'shiki';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';

import { proposalRouteSegment } from '../src/proposalRoute.js';

const GENERATED_NOTICE =
  '<!-- 此文件由 pnpm generate:docs 自动生成，请勿手工修改。 -->';
const CODE_LANGUAGE_BY_ALIAS = new Map(
  bundledLanguagesInfo.flatMap((language) =>
    [language.id, ...(language.aliases ?? [])].map(
      (alias) => [alias.toLowerCase(), language.id] as const,
    ),
  ),
);

export interface GenerateProposalDocsOptions {
  datasetPath: string;
  docsRoot: string;
}

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

function frontmatter(proposal: AtlasProposal, language: 'zh' | 'en'): string {
  const localizedTitle =
    language === 'zh' ? (proposal.titleZh ?? proposal.title) : proposal.title;
  const localizedDescription =
    language === 'zh'
      ? `《${localizedTitle}》TC39 提案的中文译文、阶段和版本信息。`
      : `${proposal.title}: TC39 proposal text, stage, and edition metadata.`;
  const value = (input: unknown) => JSON.stringify(input);

  return [
    '---',
    `title: ${value(localizedTitle)}`,
    `description: ${value(localizedDescription)}`,
    'pageType: doc-wide',
    'sidebar: false',
    'footer: false',
    `proposalId: ${value(proposal.id)}`,
    `proposalTitle: ${value(proposal.title)}`,
    `proposalTitleZh: ${value(proposal.titleZh)}`,
    `proposalStage: ${value(proposal.stage)}`,
    `proposalEdition: ${value(proposal.edition)}`,
    `proposalStatus: ${value(proposal.status)}`,
    `proposalRepositoryUrl: ${value(proposal.repositoryUrl)}`,
    `proposalSyncedAt: ${value(proposal.syncedAt)}`,
    `proposalTranslationAvailable: ${value(Boolean(proposal.readmeZh?.trim()))}`,
    '---',
  ].join('\n');
}

function proposalBody(proposal: AtlasProposal, language: 'zh' | 'en'): string {
  const source = language === 'zh' ? proposal.readmeZh : proposal.readme;
  if (source?.trim()) {
    return normalizeReadme(source, proposal.repositoryUrl);
  }
  return language === 'zh'
    ? '> 暂无中文译文，请使用页面上方的 English 入口查看英文原文。\n'
    : '> The upstream repository does not provide a README.\n';
}

async function cleanGeneratedMarkdown(directory: string, docsRoot: string) {
  const resolvedRoot = `${resolve(docsRoot)}${sep}`;
  const resolvedDirectory = resolve(directory);
  if (!`${resolvedDirectory}${sep}`.startsWith(resolvedRoot)) {
    throw new Error(`拒绝清理文档目录之外的路径：${resolvedDirectory}`);
  }
  await mkdir(resolvedDirectory, { recursive: true });
  const entries = await readdir(resolvedDirectory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => unlink(join(resolvedDirectory, entry.name))),
  );
}

export async function generateProposalDocs(
  dataset: AtlasDataset,
  docsRoot: string,
): Promise<number> {
  const directories = {
    zh: join(docsRoot, 'zh', 'proposals'),
    en: join(docsRoot, 'en', 'proposals'),
  } as const;
  await Promise.all(
    Object.values(directories).map((directory) =>
      cleanGeneratedMarkdown(directory, docsRoot),
    ),
  );

  for (const proposal of dataset.proposals) {
    const segment = proposalRouteSegment(proposal.id);
    for (const language of ['zh', 'en'] as const) {
      const output = [
        frontmatter(proposal, language),
        '',
        GENERATED_NOTICE,
        '',
        proposalBody(proposal, language).trimEnd(),
        '',
      ].join('\n');
      await writeFile(join(directories[language], `${segment}.md`), output);
    }
  }
  return dataset.proposals.length;
}

export async function generateProposalDocsFromFile(
  options: GenerateProposalDocsOptions,
): Promise<number> {
  const raw = JSON.parse(
    await readFile(options.datasetPath, 'utf8'),
  ) as unknown;
  return generateProposalDocs(parseAtlasDataset(raw), options.docsRoot);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(currentFile)) {
  const webRoot = resolve(dirname(currentFile), '..');
  const datasetPath = resolve(webRoot, 'docs/public/data/dataset.json');
  const docsRoot = resolve(webRoot, 'docs');
  const proposals = await generateProposalDocsFromFile({
    datasetPath,
    docsRoot,
  });
  console.log(JSON.stringify({ event: 'proposal_docs_generated', proposals }));
}
