import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DATASET_SCHEMA_VERSION,
  type AtlasDataset,
  type AtlasProposal,
} from '@tc39-atlas/core/model';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createEditionReferences,
  generateEditionReferences,
  updateEditionReferenceLinks,
} from '../generate-skill-references.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function proposal(overrides: Partial<AtlasProposal> = {}): AtlasProposal {
  return {
    id: 'proposal-example',
    title: 'Example Proposal',
    titleZh: '示例提案',
    stage: 4,
    edition: 2027,
    status: 'finished',
    repositoryUrl: 'https://github.com/tc39/proposal-example',
    syncedAt: '2026-08-08T00:00:00.000Z',
    readme: '# Example',
    readmeHash: 'a'.repeat(64),
    readmeZh: '# 示例',
    overview: {
      en: 'This proposal adds an example capability.',
      zh: '该提案增加了一项示例能力。',
    },
    translation: null,
    ...overrides,
  };
}

function dataset(proposals: AtlasProposal[]): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: '2026-08-08T00:00:00.000Z',
    checkedAt: '2026-08-08T00:00:00.000Z',
    proposals,
    changes: [],
  };
}

describe('Skill edition reference generator', () => {
  it('按年份分组并写入 Stage、状态、摘要和线上 Markdown 链接', () => {
    const references = createEditionReferences(
      dataset([
        proposal({ id: 'proposal-z', title: 'Z proposal' }),
        proposal({
          id: 'proposal-a',
          title: 'A proposal',
          titleZh: 'A 提案',
          overview: {
            en: 'English fallback overview.',
            zh: '',
          },
        }),
        proposal({ id: 'proposal-old', edition: 2026 }),
        proposal({ id: 'proposal-pending', edition: null, stage: 3 }),
      ]),
    );

    expect(references.map((reference) => reference.fileName)).toEqual([
      'es2027.md',
      'es2026.md',
    ]);
    const current = references[0]?.content ?? '';
    expect(current).toContain('# ES2027 能力速览');
    expect(current).toContain('Stage 4 · 已完成');
    expect(current).toContain('English fallback overview.');
    expect(current).toContain(
      'https://bosens-china.github.io/tc39-atlas/proposals/proposal-a.md',
    );
    expect(current.indexOf('A proposal')).toBeLessThan(
      current.indexOf('Z proposal'),
    );
    expect(
      references.some((reference) => reference.content.includes('pending')),
    ).toBe(false);
  });

  it('明确标记缺失摘要和未知 Stage', () => {
    const [reference] = createEditionReferences(
      dataset([
        proposal({
          stage: null,
          overview: null,
          titleZh: null,
        }),
      ]),
    );

    expect(reference?.content).toContain('Stage 未知 · 已完成');
    expect(reference?.content).toContain('暂无提案速览，请阅读线上提案文档。');
  });

  it('删除过期年度文件并保留非生成文件', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tc39-skill-references-'));
    temporaryDirectories.push(directory);
    await Promise.all([
      writeFile(join(directory, 'es2025.md'), 'stale', 'utf8'),
      writeFile(join(directory, 'notes.md'), 'keep', 'utf8'),
    ]);

    const files = await generateEditionReferences(
      dataset([proposal()]),
      directory,
    );

    expect(files).toEqual(['es2027.md']);
    await expect(
      readFile(join(directory, 'es2027.md'), 'utf8'),
    ).resolves.toContain('# ES2027 能力速览');
    await expect(readFile(join(directory, 'notes.md'), 'utf8')).resolves.toBe(
      'keep',
    );
    await expect(
      readFile(join(directory, 'es2025.md'), 'utf8'),
    ).rejects.toThrow();
  });

  it('根据实际年份更新受控链接区块并保留其他正文', () => {
    const references = createEditionReferences(
      dataset([
        proposal({ id: 'proposal-next', edition: 2028 }),
        proposal({ id: 'proposal-current', edition: 2027 }),
      ]),
    );
    const before = [
      '# Skill',
      '',
      '人工正文。',
      '<!-- edition-references:start -->',
      '- [ES2026](./references/es2026.md)',
      '<!-- edition-references:end -->',
      '',
      '后续人工正文。',
    ].join('\n');

    const updated = updateEditionReferenceLinks(before, references);

    expect(updated).toContain('- [ES2028](./references/es2028.md)');
    expect(updated).toContain('- [ES2027](./references/es2027.md)');
    expect(updated).not.toContain('references/es2026.md');
    expect(updated.startsWith('# Skill\n\n人工正文。\n')).toBe(true);
    expect(updated.endsWith('\n\n后续人工正文。')).toBe(true);
  });

  it.each([
    ['缺少标记', '# Skill'],
    [
      '重复标记',
      '<!-- edition-references:start -->\n<!-- edition-references:start -->\n<!-- edition-references:end -->',
    ],
    [
      '标记顺序错误',
      '<!-- edition-references:end -->\n<!-- edition-references:start -->',
    ],
  ])('拒绝%s', (_name, skillContent) => {
    const references = createEditionReferences(dataset([proposal()]));

    expect(() => updateEditionReferenceLinks(skillContent, references)).toThrow(
      /SKILL\.md|标记/,
    );
  });
});
