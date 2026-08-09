import {
  mkdir,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAtlasDataset,
  type AtlasDataset,
  type ProposalChange,
} from '@tc39-atlas/core/model';

import {
  proposalRoutePath,
  proposalRouteRelativePath,
  proposalRouteSegment,
  type ProposalRouteContext,
} from '../src/proposalRoute.js';
import {
  CHANGE_PERIODS,
  changePeriodLabel,
  filterChanges,
  type ChangePeriod,
} from './change-period.js';
import {
  copy,
  formatDate,
  LANGUAGES,
  localizedTitle,
  markdownText,
  stageLabel,
  STAGES,
  statusLabel,
  type Language,
} from './doc-copy.js';
import { GENERATED_NOTICE, proposalDocument } from './proposal-document.js';
import { proposalSidebar } from './proposal-sidebar.js';

export { normalizeReadme } from './proposal-document.js';

function documentFrontmatter(title: string, description: string): string {
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    '---',
  ].join('\n');
}

function proposalIndex(dataset: AtlasDataset, language: Language): string {
  const value = copy[language];
  const sections = STAGES.map((stage) => {
    const proposals = dataset.proposals
      .filter((proposal) => proposal.stage === stage)
      .sort((left, right) =>
        localizedTitle(left, language).localeCompare(
          localizedTitle(right, language),
        ),
      );
    if (!proposals.length) return '';
    const rows = proposals.map((proposal) => {
      const title = markdownText(localizedTitle(proposal, language));
      const edition = proposal.edition ? `ES${proposal.edition}` : '—';
      return `| [${title}](./${proposalRouteSegment(proposal.id)}) | ${statusLabel(proposal.status, language)} | ${edition} |`;
    });
    return [
      `## ${stageLabel(stage, language)} · ${proposals.length}`,
      '',
      `| ${value.title} | ${value.status} | ${value.edition} |`,
      '| --- | --- | --- |',
      ...rows,
    ].join('\n');
  }).filter(Boolean);

  return [
    documentFrontmatter(value.proposals, value.proposalsDescription),
    '',
    GENERATED_NOTICE,
    '',
    `# ${value.proposals}`,
    '',
    `:::tip\n${value.indexTip}\n:::`,
    '',
    sections.length
      ? sections.join('\n\n')
      : `:::warning\n${value.emptyProposals}\n:::`,
    '',
  ].join('\n');
}

function changeLabel(change: ProposalChange, language: Language): string {
  const labels: Record<ProposalChange['kind'], readonly [string, string]> = {
    added: ['新增', 'Added'],
    stage_changed: ['阶段变化', 'Stage changed'],
    finished: ['完成', 'Finished'],
    inactive: ['转为不活跃', 'Became inactive'],
    withdrawn: ['撤回', 'Withdrawn'],
  };
  const label = labels[change.kind][language === 'zh' ? 0 : 1];
  if (change.kind !== 'stage_changed' || !change.before) return label;
  return `${label}: ${stageLabel(change.before.stage, language)} → ${stageLabel(change.after.stage, language)}`;
}

function changesIndex(
  dataset: AtlasDataset,
  language: Language,
  period: ChangePeriod,
): string {
  const value = copy[language];
  const title = changePeriodLabel(period, language);
  const rows = filterChanges(dataset.changes, dataset.generatedAt, period)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .map((change) => {
      const title = markdownText(change.after.title);
      const path = proposalRoutePath(change.proposalId, language);
      return `| ${formatDate(change.occurredAt, language)} | ${changeLabel(change, language)} | [${title}](${path}) |`;
    });
  const content = rows.length
    ? [
        `| ${value.occurredAt} | ${value.event} | ${value.title} |`,
        '| --- | --- | --- |',
        ...rows,
      ].join('\n')
    : `:::info\n${value.emptyChanges}\n:::`;
  return [
    documentFrontmatter(title, value.changesDescription),
    '',
    GENERATED_NOTICE,
    '',
    `# ${title}`,
    '',
    `:::info\n${language === 'zh' ? `以数据集生成时间 ${formatDate(dataset.generatedAt, language)} 的 UTC 日历为准。` : `Calculated from the UTC calendar at dataset generation time, ${formatDate(dataset.generatedAt, language)}.`}\n:::`,
    '',
    content,
    '',
  ].join('\n');
}

async function cleanGeneratedMarkdown(
  directory: string,
  docsRoot: string,
  generatedDirectories: readonly string[] = [],
) {
  const resolvedRoot = `${resolve(docsRoot)}${sep}`;
  const resolvedDirectory = resolve(directory);
  if (!`${resolvedDirectory}${sep}`.startsWith(resolvedRoot)) {
    throw new Error(`拒绝清理文档目录之外的路径：${resolvedDirectory}`);
  }
  await mkdir(resolvedDirectory, { recursive: true });
  const entries = await readdir(resolvedDirectory, { withFileTypes: true });
  await Promise.all([
    ...entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => unlink(join(resolvedDirectory, entry.name))),
    ...generatedDirectories.map((name) =>
      rm(join(resolvedDirectory, name), { recursive: true, force: true }),
    ),
  ]);
}

export interface GenerateProposalDocsOptions {
  datasetPath: string;
  docsRoot: string;
}

/** 一次生成正文与导航，避免页面和侧边栏维护两份提案顺序。 */
export async function generateProposalDocs(
  dataset: AtlasDataset,
  docsRoot: string,
): Promise<number> {
  for (const language of LANGUAGES) {
    const proposalsDirectory = join(docsRoot, language, 'proposals');
    const changesDirectory = join(docsRoot, language, 'changes');
    await cleanGeneratedMarkdown(proposalsDirectory, docsRoot, [
      'year',
      'stage',
    ]);
    await cleanGeneratedMarkdown(changesDirectory, docsRoot);
    await mkdir(changesDirectory, { recursive: true });
    await Promise.all([
      writeFile(
        join(proposalsDirectory, 'index.md'),
        proposalIndex(dataset, language),
      ),
      writeFile(
        join(proposalsDirectory, '_meta.json'),
        proposalSidebar(dataset, language),
      ),
      writeFile(
        join(changesDirectory, 'index.md'),
        changesIndex(dataset, language, 'week'),
      ),
      ...CHANGE_PERIODS.map((period) =>
        writeFile(
          join(changesDirectory, `${period}.md`),
          changesIndex(dataset, language, period),
        ),
      ),
    ]);

    for (const proposal of dataset.proposals) {
      const contexts: readonly (ProposalRouteContext | undefined)[] = [
        undefined,
        { kind: 'year', value: proposal.edition },
        { kind: 'stage', value: proposal.stage },
      ];
      for (const context of contexts) {
        const outputPath = join(
          proposalsDirectory,
          `${proposalRouteRelativePath(proposal.id, context)}.md`,
        );
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(
          outputPath,
          proposalDocument(proposal, language, context),
        );
      }
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
  const proposals = await generateProposalDocsFromFile({
    datasetPath: resolve(webRoot, 'docs/public/data/dataset.json'),
    docsRoot: resolve(webRoot, 'docs'),
  });
  console.log(JSON.stringify({ event: 'proposal_docs_generated', proposals }));
}
