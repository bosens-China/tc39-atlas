import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DATASET_SCHEMA_VERSION,
  type AtlasDataset,
} from '@tc39-atlas/core/model';
import { afterEach, describe, expect, it } from 'vitest';

import { generateProposalDocs, normalizeReadme } from '../generate-docs.js';
import { proposalDocument } from '../proposal-document.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function sampleDataset(): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: '2026-08-08T00:00:00.000Z',
    checkedAt: '2026-08-08T00:00:00.000Z',
    changes: [
      {
        id: 'change-example',
        proposalId: 'proposal-example',
        kind: 'stage_changed',
        before: {
          id: 'proposal-example',
          title: 'Example Proposal',
          stage: 2,
          edition: null,
          status: 'active',
          repositoryUrl: 'https://github.com/tc39/proposal-example',
        },
        after: {
          id: 'proposal-example',
          title: 'Example Proposal',
          stage: 2.7,
          edition: null,
          status: 'active',
          repositoryUrl: 'https://github.com/tc39/proposal-example',
        },
        detectedAt: '2026-08-08T00:00:00.000Z',
      },
    ],
    proposals: [
      {
        id: 'proposal-example',
        title: 'Example Proposal',
        titleZh: '示例提案',
        stage: 2.7,
        edition: null,
        status: 'active',
        repositoryUrl: 'https://github.com/tc39/proposal-example',
        syncedAt: '2026-08-08T00:00:00.000Z',
        readme: '# Example\n\n[Spec](./spec.html)\n\n![Diagram](images/a.png)',
        readmeHash: 'a'.repeat(64),
        readmeZh: null,
        overview: {
          en: 'This proposal demonstrates an example capability.',
          zh: '该提案演示了一项示例能力。',
        },
        translation: null,
      },
    ],
  };
}

describe('proposal documentation generator', () => {
  it('rewrites repository-relative links without touching external links', () => {
    const result = normalizeReadme(
      '[Spec](./spec.html) [Issue](//github.com/tc39/proposal-example/issues/1) [TC39](https://tc39.es) ![Diagram](images/a.png)',
      'https://github.com/tc39/proposal-example',
    );

    expect(result).toContain(
      'https://github.com/tc39/proposal-example/blob/HEAD/spec.html',
    );
    expect(result).toContain('https://tc39.es');
    expect(result).toContain(
      'https://github.com/tc39/proposal-example/issues/1',
    );
    expect(result).toContain(
      'https://github.com/tc39/proposal-example/raw/HEAD/images/a.png',
    );
  });

  it('normalizes Shiki aliases and drops unsupported code languages', () => {
    const result = normalizeReadme(
      '```Shell\necho ok\n```\n\n```grammarkdown\nProduction\n```',
      'https://github.com/tc39/proposal-example',
    );

    expect(result).toContain('```shellscript');
    expect(result).not.toContain('grammarkdown');
  });

  it('nests upstream README headings below the proposal title', () => {
    const result = normalizeReadme(
      '# Readme title\n\n## Details',
      'https://github.com/tc39/proposal-example',
    );

    expect(result).toContain('## Readme title');
    expect(result).toContain('### Details');
    expect(result).not.toContain('\n# Readme title');
  });

  it('explains that README metadata may be stale without inferring its stage', () => {
    const proposal = sampleDataset().proposals[0];
    if (!proposal) throw new Error('Expected proposal fixture');
    const changed = {
      ...proposal,
      stage: 4 as const,
      status: 'finished' as const,
      edition: 2027,
      readme: '# Example\n\nStage: 3\n\n## Motivation',
      readmeZh: '# 示例\n\n阶段：第 3 阶段\n\n## 动机',
      overview: {
        en: 'It adds an example capability.',
        zh: '它增加了一项示例能力。',
      },
    };

    const zh = proposalDocument(changed, 'zh');
    const en = proposalDocument(changed, 'en');

    expect(zh).toContain('- **阶段**: Stage 4');
    expect(zh).toContain('其中的阶段或状态标注可能滞后');
    expect(zh).toContain('阶段：第 3 阶段');
    expect(zh).toContain('它增加了一项示例能力。');
    expect(en).toContain('- **Stage**: Stage 4');
    expect(en).toContain('may contain outdated stage or status metadata');
    expect(en).toContain('Stage: 3');
    expect(en).toContain('It adds an example capability.');
  });

  it('creates bilingual pages and removes stale generated Markdown', async () => {
    const docsRoot = await mkdtemp(join(tmpdir(), 'tc39-atlas-docs-'));
    temporaryDirectories.push(docsRoot);
    const zhDirectory = join(docsRoot, 'zh', 'proposals');
    await mkdir(zhDirectory, { recursive: true });
    await writeFile(join(zhDirectory, 'stale.md'), 'stale');
    await writeFile(join(zhDirectory, 'note.txt'), 'keep');
    await mkdir(join(zhDirectory, 'year', 'stale'), { recursive: true });
    await writeFile(join(zhDirectory, 'year', 'stale', 'old.md'), 'stale');

    await expect(generateProposalDocs(sampleDataset(), docsRoot)).resolves.toBe(
      1,
    );

    const zh = await readFile(join(zhDirectory, 'proposal-example.md'), 'utf8');
    const en = await readFile(
      join(docsRoot, 'en', 'proposals', 'proposal-example.md'),
      'utf8',
    );
    const byYear = await readFile(
      join(zhDirectory, 'year', 'pending', 'proposal-example.md'),
      'utf8',
    );
    const byStage = await readFile(
      join(zhDirectory, 'stage', '2.7', 'proposal-example.md'),
      'utf8',
    );
    const index = await readFile(join(zhDirectory, 'index.md'), 'utf8');
    const sidebar = await readFile(join(zhDirectory, '_meta.json'), 'utf8');
    const changes = await readFile(
      join(docsRoot, 'zh', 'changes', 'index.md'),
      'utf8',
    );
    await expect(
      readFile(join(zhDirectory, 'stale.md'), 'utf8'),
    ).rejects.toThrow();
    await expect(readFile(join(zhDirectory, 'note.txt'), 'utf8')).resolves.toBe(
      'keep',
    );
    expect(zh).toContain('pageType: doc');
    expect(zh).toContain('title: "Example Proposal"');
    expect(zh).toContain('\n# Example Proposal\n\n');
    expect(zh).toContain('《示例提案》TC39 提案');
    expect(zh).toContain('> **中文标题**：示例提案');
    expect(zh).toContain('暂无中文译文');
    expect(zh).toContain(':::info 提案概览\n\n- **阶段**');
    expect(zh).toContain(':::tip 提案速览\n该提案演示了一项示例能力。');
    expect(zh).toContain(
      '[官方仓库](https://github.com/tc39/proposal-example)\n\n:::',
    );
    expect(en).toContain('title: "Example Proposal"');
    expect(en).toContain('\n# Example Proposal\n\n');
    expect(en).toContain(
      ':::tip Proposal overview\nThis proposal demonstrates an example capability.',
    );
    expect(en).toContain('## Example');
    expect(byYear).toContain('search: false');
    expect(byYear).toContain(
      '/en/proposals/year/pending/proposal-example.html',
    );
    expect(byStage).toContain('search: false');
    expect(zh).not.toContain('search: false');
    expect(index).toContain('./proposal-example');
    expect(sidebar).toContain(
      '"link": "/proposals/year/pending/proposal-example.html"',
    );
    expect(sidebar).toContain(
      '"link": "/proposals/stage/2.7/proposal-example.html"',
    );
    expect(sidebar).toContain('"label": "Example Proposal"');
    expect(sidebar).toContain('"tag": "未译"');
    expect(sidebar).not.toContain('"label": "示例提案"');
    expect(changes).toContain('/proposals/proposal-example.html');
    expect(changes).toContain('| 检测时间 | 变化 | 提案 |');
    expect(changes).toContain('数据检查于 2026年8月8日 00:00 UTC');
    await expect(
      readFile(join(docsRoot, 'zh', 'changes', 'year.md'), 'utf8'),
    ).resolves.toContain('/proposals/proposal-example.html');
  });
});
