import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AtlasDataset } from '@tc39-atlas/core/model';
import { afterEach, describe, expect, it } from 'vitest';

import { generateProposalDocs, normalizeReadme } from '../generate-docs.js';

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
    schemaVersion: 2,
    generatedAt: '2026-08-08T00:00:00.000Z',
    changes: [],
    proposals: [
      {
        id: 'proposal-example',
        title: 'Example Proposal',
        titleZh: '示例提案',
        titleTranslation: {
          sourceHash: 'b'.repeat(64),
          policyVersion: '1',
          model: 'test',
          translatedAt: '2026-08-08T00:00:00.000Z',
        },
        stage: 2.7,
        edition: null,
        status: 'active',
        repositoryUrl: 'https://github.com/tc39/proposal-example',
        syncedAt: '2026-08-08T00:00:00.000Z',
        readme: '# Example\n\n[Spec](./spec.html)\n\n![Diagram](images/a.png)',
        readmeHash: 'a'.repeat(64),
        readmeZh: null,
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

  it('creates bilingual pages and removes stale generated Markdown', async () => {
    const docsRoot = await mkdtemp(join(tmpdir(), 'tc39-atlas-docs-'));
    temporaryDirectories.push(docsRoot);
    const zhDirectory = join(docsRoot, 'zh', 'proposals');
    await mkdir(zhDirectory, { recursive: true });
    await writeFile(join(zhDirectory, 'stale.md'), 'stale');
    await writeFile(join(zhDirectory, 'index.tsx'), 'keep');

    await expect(generateProposalDocs(sampleDataset(), docsRoot)).resolves.toBe(
      1,
    );

    const zh = await readFile(join(zhDirectory, 'proposal-example.md'), 'utf8');
    const en = await readFile(
      join(docsRoot, 'en', 'proposals', 'proposal-example.md'),
      'utf8',
    );
    await expect(
      readFile(join(zhDirectory, 'stale.md'), 'utf8'),
    ).rejects.toThrow();
    await expect(
      readFile(join(zhDirectory, 'index.tsx'), 'utf8'),
    ).resolves.toBe('keep');
    expect(zh).toContain('proposalTranslationAvailable: false');
    expect(zh).toContain('title: "示例提案"');
    expect(zh).toContain('《示例提案》TC39 提案');
    expect(zh).toContain('暂无中文译文');
    expect(en).toContain('title: "Example Proposal"');
    expect(en).toContain('# Example');
  });
});
