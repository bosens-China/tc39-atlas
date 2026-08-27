import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAtlasDataset,
  type AtlasDataset,
  type AtlasProposal,
} from '@tc39-atlas/core/model';

import { proposalRouteSegment } from '../src/proposalRoute.js';
import { markdownText, statusLabel } from './doc-copy.js';

const ATLAS_ROOT = 'https://bosens-china.github.io/tc39-atlas';
const LLMS_URL = `${ATLAS_ROOT}/llms.txt`;
const EDITION_REFERENCE_PATTERN = /^es\d{4}\.md$/;
const EDITION_LINKS_START = '<!-- edition-references:start -->';
const EDITION_LINKS_END = '<!-- edition-references:end -->';

export interface EditionReference {
  edition: number;
  fileName: string;
  content: string;
}

function compareTitle(left: AtlasProposal, right: AtlasProposal): number {
  if (left.title < right.title) return -1;
  if (left.title > right.title) return 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function proposalLabel(proposal: AtlasProposal): string {
  const title = markdownText(proposal.title);
  const titleZh = proposal.titleZh?.trim();
  if (!titleZh || titleZh === proposal.title) return title;
  return `${title}（${markdownText(titleZh)}）`;
}

function proposalOverview(proposal: AtlasProposal): string {
  const overview = proposal.overview?.zh.trim() || proposal.overview?.en.trim();
  return overview
    ? markdownText(overview)
    : '暂无提案速览，请阅读线上提案文档。';
}

function proposalLine(proposal: AtlasProposal): string {
  const id = proposalRouteSegment(proposal.id);
  const stage =
    proposal.stage === null ? 'Stage 未知' : `Stage ${proposal.stage}`;
  const status = statusLabel(proposal.status, 'zh');
  return `- [${proposalLabel(proposal)}](${ATLAS_ROOT}/proposals/${id}.md) — ${stage} · ${status}\n  ${proposalOverview(proposal)}`;
}

function renderEditionReference(
  edition: number,
  proposals: readonly AtlasProposal[],
): string {
  return [
    `# ES${edition} 能力速览`,
    '',
    `> 本文件由 TC39 Atlas Dataset 自动生成，是随仓库更新的快照。最新提案集合、Stage、状态和版本请读取 [llms.txt](${LLMS_URL})；需要详细内容时打开条目中的 Atlas 提案 Markdown。`,
    '',
    `共 ${proposals.length} 项已进入 ES${edition} 的提案。`,
    '',
    ...proposals.flatMap((proposal) => [proposalLine(proposal), '']),
  ].join('\n');
}

/** 按官方 edition 分组，生成供 Skill 渐进读取的稳定年度快照。 */
export function createEditionReferences(
  dataset: AtlasDataset,
): EditionReference[] {
  const editions = [
    ...new Set(
      dataset.proposals.flatMap((proposal) =>
        proposal.edition === null ? [] : [proposal.edition],
      ),
    ),
  ].sort((left, right) => right - left);

  return editions.map((edition) => {
    const proposals = dataset.proposals
      .filter((proposal) => proposal.edition === edition)
      .sort(compareTitle);
    return {
      edition,
      fileName: `es${edition}.md`,
      content: renderEditionReference(edition, proposals),
    };
  });
}

function singleMarkerIndex(content: string, marker: string): number {
  const index = content.indexOf(marker);
  if (index === -1 || content.indexOf(marker, index + marker.length) !== -1) {
    throw new Error(`SKILL.md 必须且只能包含一个年份入口标记：${marker}`);
  }
  return index;
}

/** 只替换标记包围的年份列表，避免生成器改写其他人工维护内容。 */
export function updateEditionReferenceLinks(
  skillContent: string,
  references: readonly EditionReference[],
): string {
  const startIndex = singleMarkerIndex(skillContent, EDITION_LINKS_START);
  const endIndex = singleMarkerIndex(skillContent, EDITION_LINKS_END);
  if (endIndex < startIndex + EDITION_LINKS_START.length) {
    throw new Error('SKILL.md 年份入口标记顺序无效');
  }
  const links = references
    .map(
      (reference) =>
        `- [ES${reference.edition}](./references/${reference.fileName})`,
    )
    .join('\n');
  const generatedBlock = `${EDITION_LINKS_START}\n${links}\n${EDITION_LINKS_END}`;
  return `${skillContent.slice(0, startIndex)}${generatedBlock}${skillContent.slice(endIndex + EDITION_LINKS_END.length)}`;
}

async function writeEditionReferences(
  references: readonly EditionReference[],
  outputDirectory: string,
): Promise<string[]> {
  const expectedFiles = new Set(
    references.map((reference) => reference.fileName),
  );
  await mkdir(outputDirectory, { recursive: true });
  const existingEntries = await readdir(outputDirectory, {
    withFileTypes: true,
  });

  await Promise.all([
    ...references.map((reference) =>
      writeFile(
        join(outputDirectory, reference.fileName),
        reference.content,
        'utf8',
      ),
    ),
    ...existingEntries
      .filter(
        (entry) =>
          entry.isFile() &&
          EDITION_REFERENCE_PATTERN.test(entry.name) &&
          !expectedFiles.has(entry.name),
      )
      .map((entry) => unlink(join(outputDirectory, entry.name))),
  ]);

  return references.map((reference) => reference.fileName);
}

export async function generateEditionReferences(
  dataset: AtlasDataset,
  outputDirectory: string,
): Promise<string[]> {
  const references = createEditionReferences(dataset);
  return writeEditionReferences(references, outputDirectory);
}

export interface GenerateEditionReferencesOptions {
  datasetPath: string;
  outputDirectory: string;
  skillPath: string;
}

export async function generateEditionReferencesFromFile(
  options: GenerateEditionReferencesOptions,
): Promise<string[]> {
  const raw = JSON.parse(
    await readFile(options.datasetPath, 'utf8'),
  ) as unknown;
  const references = createEditionReferences(parseAtlasDataset(raw));
  const skillContent = await readFile(options.skillPath, 'utf8');
  const updatedSkill = updateEditionReferenceLinks(skillContent, references);
  const files = await writeEditionReferences(
    references,
    options.outputDirectory,
  );
  if (updatedSkill !== skillContent) {
    await writeFile(options.skillPath, updatedSkill, 'utf8');
  }
  return files;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === resolve(currentFile)) {
  const webRoot = resolve(dirname(currentFile), '..');
  const repositoryRoot = resolve(webRoot, '../..');
  const skillDirectory = resolve(
    repositoryRoot,
    '.agents/skills/modernize-ecmascript',
  );
  const files = await generateEditionReferencesFromFile({
    datasetPath: resolve(webRoot, 'docs/public/data/dataset.json'),
    outputDirectory: resolve(skillDirectory, 'references'),
    skillPath: resolve(skillDirectory, 'SKILL.md'),
  });
  console.log(
    JSON.stringify({ event: 'skill_edition_references_generated', files }),
  );
}
