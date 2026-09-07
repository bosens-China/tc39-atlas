import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { serializeDataset, writeAtlasDataset } from './dataset.js';
import { DATASET_SCHEMA_VERSION, type AtlasDataset } from './model.js';
import { publishedDatasetRevision } from './translation-publication.js';
import { translatePendingProposalsFromEnv } from './translation.js';
import {
  createTranslationPlan,
  executeTranslationWork,
  scanTranslationWork,
  TRANSLATION_PLAN_FILE,
  TRANSLATION_SNAPSHOT_FILE,
} from './translation-workflow.js';
import { fetchTc39Proposals } from './source.js';

vi.mock('./translation.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./translation.js')>()),
  translatePendingProposalsFromEnv: vi.fn(),
}));
vi.mock('./source.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./source.js')>()),
  fetchTc39Proposals: vi.fn(),
}));

const directories: string[] = [];

function dataset(day: string): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: `${day}T00:00:00.000Z`,
    checkedAt: `${day}T00:00:00.000Z`,
    reportDate: day,
    previousReportDate: null,
    proposals: [],
    changes: [],
  };
}

async function setup(previous: AtlasDataset | null = dataset('2026-09-01')) {
  const root = await mkdtemp(join(tmpdir(), 'tc39-publication-'));
  directories.push(root);
  const outputDirectory = join(root, 'data');
  const workDirectory = join(root, 'work');
  await mkdir(workDirectory);
  if (previous) await writeAtlasDataset(previous, outputDirectory);
  const snapshot = dataset('2026-09-02');
  const serialized = serializeDataset(snapshot);
  const plan = createTranslationPlan(
    previous ?? dataset('1970-01-01'),
    snapshot,
    serialized,
    await publishedDatasetRevision(outputDirectory),
  );
  await writeFile(
    join(workDirectory, TRANSLATION_PLAN_FILE),
    JSON.stringify(plan),
  );
  await writeFile(join(workDirectory, TRANSLATION_SNAPSHOT_FILE), serialized);
  vi.mocked(translatePendingProposalsFromEnv).mockImplementation(
    async (proposals) => ({
      proposals: [...proposals],
      result: { pending: 0, translated: 0, failed: 0, skipped: false },
    }),
  );
  return { outputDirectory, workDirectory, env: {}, plan };
}

async function publishedFiles(outputDirectory: string) {
  return Promise.all(
    ['dataset.json', 'manifest.json'].map((name) =>
      readFile(join(outputDirectory, name), 'utf8'),
    ),
  );
}

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe('translation publication baseline', () => {
  it('records the local publication revision when scanning', async () => {
    const options = await setup();
    const revision = await publishedDatasetRevision(options.outputDirectory);
    vi.mocked(fetchTc39Proposals).mockResolvedValue([]);
    const { plan } = await scanTranslationWork(options);
    expect(plan.baseRevision).toBe(revision);
    expect(await publishedDatasetRevision(options.outputDirectory)).toBe(
      revision,
    );
  });

  it.each(['2026-09-01', '2026-09-07'])(
    'rejects a changed publication from %s before translating',
    async (day) => {
      const options = await setup();
      await writeAtlasDataset(
        { ...dataset(day), checkedAt: `${day}T01:00:00.000Z` },
        options.outputDirectory,
      );
      const before = await publishedFiles(options.outputDirectory);
      await expect(executeTranslationWork(options)).rejects.toThrow(
        'sync:scan again',
      );
      expect(translatePendingProposalsFromEnv).not.toHaveBeenCalled();
      expect(await publishedFiles(options.outputDirectory)).toEqual(before);
    },
  );

  it('rejects a publication created after an initial scan', async () => {
    const options = await setup(null);
    await writeAtlasDataset(dataset('2026-09-07'), options.outputDirectory);
    const before = await publishedFiles(options.outputDirectory);
    await expect(executeTranslationWork(options)).rejects.toThrow(
      'sync:scan again',
    );
    expect(await publishedFiles(options.outputDirectory)).toEqual(before);
  });

  it('checks again when the publication changes during translation', async () => {
    const options = await setup();
    let latest: string[] = [];
    vi.mocked(translatePendingProposalsFromEnv).mockImplementationOnce(
      async (proposals) => {
        await writeAtlasDataset(dataset('2026-09-07'), options.outputDirectory);
        latest = await publishedFiles(options.outputDirectory);
        return {
          proposals: [...proposals],
          result: { pending: 0, translated: 0, failed: 0, skipped: false },
        };
      },
    );
    await expect(executeTranslationWork(options)).rejects.toThrow(
      'sync:scan again',
    );
    expect(await publishedFiles(options.outputDirectory)).toEqual(latest);
  });

  it('publishes an unchanged baseline and refuses to replay the consumed plan', async () => {
    const options = await setup();
    const result = await executeTranslationWork(options);
    expect(result.dataset.reportDate).toBe('2026-09-02');
    const before = await publishedFiles(options.outputDirectory);
    await expect(executeTranslationWork(options)).rejects.toThrow(
      'sync:scan again',
    );
    expect(await publishedFiles(options.outputDirectory)).toEqual(before);
  });

  it('rejects old plans without a publication baseline', async () => {
    const options = await setup();
    await writeFile(
      join(options.workDirectory, TRANSLATION_PLAN_FILE),
      JSON.stringify({
        ...options.plan,
        baseRevision: undefined,
        schemaVersion: 1,
      }),
    );
    await expect(executeTranslationWork(options)).rejects.toThrow();
    expect(translatePendingProposalsFromEnv).not.toHaveBeenCalled();
  });
});
