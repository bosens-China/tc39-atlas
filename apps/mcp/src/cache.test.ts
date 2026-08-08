import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDatasetStore } from './cache.js';

const directories: string[] = [];

function publishedDataset(id: string) {
  return {
    schemaVersion: 2 as const,
    generatedAt: '2026-08-08T00:00:00.000Z',
    proposals: [
      {
        id,
        title: `Proposal ${id}`,
        titleZh: null,
        titleTranslation: null,
        stage: 2 as const,
        edition: null,
        status: 'active' as const,
        repositoryUrl: `https://github.com/tc39/${id}`,
        syncedAt: '2026-08-08T00:00:00.000Z',
        readme: `# ${id}`,
        readmeHash: 'a'.repeat(64),
        readmeZh: null,
        translation: null,
      },
    ],
    changes: [],
  };
}

function responses(id: string): [Response, Response] {
  const datasetText = `${JSON.stringify(publishedDataset(id), null, 2)}\n`;
  const digest = createHash('sha256').update(datasetText).digest('hex');
  const manifest = {
    schemaVersion: 2,
    revision: digest,
    generatedAt: '2026-08-08T00:00:00.000Z',
    dataset: {
      url: 'dataset.json',
      sha256: digest,
      bytes: Buffer.byteLength(datasetText),
    },
  };
  return [
    new Response(JSON.stringify(manifest), { status: 200 }),
    new Response(datasetText, { status: 200 }),
  ];
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'tc39-atlas-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('dataset cache', () => {
  it('blocks for the first valid download', async () => {
    const directory = await temporaryDirectory();
    const [manifest, dataset] = responses('proposal-a');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest)
      .mockResolvedValueOnce(dataset);

    const opened = await openDatasetStore({
      cacheDirectory: directory,
      manifestUrl: 'https://example.test/data/manifest.json',
      fetcher,
    });

    expect(opened.store.dataset.proposals[0]?.id).toBe('proposal-a');
    await expect(opened.refresh).resolves.toBe('updated');
  });

  it('serves the cache immediately and replaces it after background refresh', async () => {
    const directory = await temporaryDirectory();
    const firstResponses = responses('proposal-a');
    await openDatasetStore({
      cacheDirectory: directory,
      manifestUrl: 'https://example.test/data/manifest.json',
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(firstResponses[0])
        .mockResolvedValueOnce(firstResponses[1]),
    });
    const nextResponses = responses('proposal-b');
    const opened = await openDatasetStore({
      cacheDirectory: directory,
      manifestUrl: 'https://example.test/data/manifest.json',
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(nextResponses[0])
        .mockResolvedValueOnce(nextResponses[1]),
    });

    expect(opened.store.dataset.proposals[0]?.id).toBe('proposal-a');
    await expect(opened.refresh).resolves.toBe('updated');
    expect(opened.store.dataset.proposals[0]?.id).toBe('proposal-b');
  });

  it('keeps a valid cache when the silent check fails', async () => {
    const directory = await temporaryDirectory();
    const initialResponses = responses('proposal-a');
    await openDatasetStore({
      cacheDirectory: directory,
      manifestUrl: 'https://example.test/data/manifest.json',
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(initialResponses[0])
        .mockResolvedValueOnce(initialResponses[1]),
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const opened = await openDatasetStore({
      cacheDirectory: directory,
      manifestUrl: 'https://example.test/data/manifest.json',
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    });

    await expect(opened.refresh).resolves.toBe('current');
    expect(opened.store.dataset.proposals[0]?.id).toBe('proposal-a');
  });
});
