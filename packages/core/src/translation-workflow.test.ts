import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { serializeDataset, writeAtlasDataset } from './dataset.js';
import {
  DATASET_SCHEMA_VERSION,
  parseAtlasDataset,
  type AtlasDataset,
  type AtlasProposal,
} from './model.js';
import {
  TRANSLATION_CONTRACT_VERSION,
  translationContentHash,
} from './translation.js';
import {
  AGENT_TRANSLATIONS_FILE,
  TRANSLATION_PLAN_FILE,
  TRANSLATION_SNAPSHOT_FILE,
  createTranslationPlan,
  executeTranslationWork,
} from './translation-workflow.js';

const temporaryDirectories: string[] = [];

function proposal(overrides: Partial<AtlasProposal> = {}): AtlasProposal {
  return {
    id: 'proposal-a',
    title: 'Proposal A',
    titleZh: null,
    stage: 2,
    edition: null,
    status: 'active',
    repositoryUrl: 'https://github.com/tc39/proposal-a',
    readme: '# Proposal A',
    readmeHash: 'a'.repeat(64),
    readmeZh: null,
    overview: null,
    translation: null,
    syncedAt: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function dataset(
  proposals: AtlasProposal[],
  generatedAt = '2026-08-20T00:00:00.000Z',
): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt,
    checkedAt: generatedAt,
    proposals,
    changes: [],
  };
}

function translated(value: AtlasProposal): AtlasProposal {
  return {
    ...value,
    titleZh: '提案 A',
    readmeZh: '# 提案 A',
    overview: { en: 'Proposal overview.', zh: '提案速览。' },
    translation: {
      sourceHash: translationContentHash(value),
      policyVersion: TRANSLATION_CONTRACT_VERSION,
      model: 'test-model',
      translatedAt: '2026-08-19T00:00:00.000Z',
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe('two-phase translation workflow', () => {
  it('records why content needs translation and ignores maturity-only changes', () => {
    const previousProposal = translated(proposal());
    const stageOnly = { ...previousProposal, stage: 4 as const };
    const changedReadme = proposal({
      id: 'proposal-b',
      readme: '# Proposal A changed',
      readmeHash: 'b'.repeat(64),
    });
    const previousReadme = translated(proposal({ id: 'proposal-b' }));
    const newProposal = proposal({ id: 'proposal-c' });

    const plan = createTranslationPlan(
      dataset([previousProposal, previousReadme], '2026-08-19T00:00:00.000Z'),
      dataset([stageOnly, changedReadme, newProposal]),
    );

    expect(plan.items).toEqual([
      expect.objectContaining({
        proposalId: 'proposal-b',
        reasons: ['readme_changed'],
      }),
      expect.objectContaining({
        proposalId: 'proposal-c',
        reasons: ['new_proposal'],
      }),
    ]);
  });

  it('records incomplete output and translation contract changes', () => {
    const incomplete = proposal();
    const oldContract = translated(proposal({ id: 'proposal-b' }));
    oldContract.translation = {
      ...oldContract.translation,
      policyVersion: 'old',
    };
    const currentOldContract = proposal({ id: 'proposal-b' });

    const plan = createTranslationPlan(
      dataset([incomplete, oldContract], '2026-08-19T00:00:00.000Z'),
      dataset([incomplete, currentOldContract]),
    );

    expect(plan.items.map((item) => item.reasons)).toEqual([
      ['translation_incomplete'],
      ['contract_changed'],
    ]);
  });

  it('applies local Agent results and writes only the final dataset', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tc39-atlas-workflow-'));
    temporaryDirectories.push(root);
    const workDirectory = join(root, '.cache');
    const outputDirectory = join(root, 'data');
    await Promise.all([
      mkdir(workDirectory, { recursive: true }),
      mkdir(outputDirectory, { recursive: true }),
    ]);
    const snapshot = dataset([proposal()]);
    const serialized = serializeDataset(snapshot);
    const plan = createTranslationPlan(dataset([]), snapshot, serialized);
    const item = plan.items[0];
    if (!item) throw new Error('Expected one planned translation');

    await Promise.all([
      writeFile(
        join(workDirectory, TRANSLATION_SNAPSHOT_FILE),
        serialized,
        'utf8',
      ),
      writeFile(
        join(workDirectory, TRANSLATION_PLAN_FILE),
        `${JSON.stringify(plan)}\n`,
        'utf8',
      ),
      writeFile(
        join(workDirectory, AGENT_TRANSLATIONS_FILE),
        `${JSON.stringify({
          schemaVersion: 1,
          planRevision: plan.revision,
          model: 'local-agent',
          translations: [
            {
              proposalId: item.proposalId,
              sourceHash: item.sourceHash,
              titleZh: '提案 A',
              readmeZh: '# 提案 A',
              overview: {
                en: 'Proposal A solves a synchronization problem.',
                zh: '提案 A 解决了一个同步问题。',
              },
            },
          ],
        })}\n`,
        'utf8',
      ),
    ]);

    const result = await executeTranslationWork({
      outputDirectory,
      workDirectory,
      env: {},
    });
    const stored = parseAtlasDataset(
      JSON.parse(
        await readFile(join(outputDirectory, 'dataset.json'), 'utf8'),
      ) as unknown,
    );

    expect(result).toMatchObject({
      changed: true,
      agentApplied: 1,
      translation: {
        pending: 1,
        translated: 1,
        failed: 0,
        skipped: false,
      },
    });
    expect(stored.proposals[0]).toMatchObject({
      titleZh: '提案 A',
      translation: { model: 'local-agent' },
    });
  });

  it('refreshes checkedAt without replacing unchanged proposal content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tc39-atlas-noop-'));
    temporaryDirectories.push(root);
    const workDirectory = join(root, '.cache');
    const outputDirectory = join(root, 'data');
    await mkdir(workDirectory, { recursive: true });

    const previousProposal = translated(proposal());
    const previous = dataset([previousProposal], '2026-08-19T00:00:00.000Z');
    await writeAtlasDataset(previous, outputDirectory);
    const before = await Promise.all([
      readFile(join(outputDirectory, 'dataset.json'), 'utf8'),
      readFile(join(outputDirectory, 'manifest.json'), 'utf8'),
    ]);
    const snapshot = dataset(
      [
        {
          ...previousProposal,
          syncedAt: '2026-08-20T00:00:00.000Z',
          translation: {
            ...previousProposal.translation,
            translatedAt: '2026-08-20T00:00:00.000Z',
          },
        },
      ],
      '2026-08-20T00:00:00.000Z',
    );
    const serialized = serializeDataset(snapshot);
    const plan = createTranslationPlan(previous, snapshot, serialized);
    await Promise.all([
      writeFile(
        join(workDirectory, TRANSLATION_SNAPSHOT_FILE),
        serialized,
        'utf8',
      ),
      writeFile(
        join(workDirectory, TRANSLATION_PLAN_FILE),
        JSON.stringify(plan),
        'utf8',
      ),
    ]);

    const result = await executeTranslationWork({
      outputDirectory,
      workDirectory,
      env: {},
    });
    const after = await Promise.all([
      readFile(join(outputDirectory, 'dataset.json'), 'utf8'),
      readFile(join(outputDirectory, 'manifest.json'), 'utf8'),
    ]);

    expect(result.changed).toBe(true);
    expect(result.dataset).toEqual({
      ...previous,
      checkedAt: '2026-08-20T00:00:00.000Z',
    });
    expect(result.dataset.proposals[0]?.syncedAt).toBe(
      '2026-08-20T00:00:00.000Z',
    );
    expect(after).not.toEqual(before);
  });

  it('rejects Agent results for another plan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tc39-atlas-stale-'));
    temporaryDirectories.push(root);
    const snapshot = dataset([proposal()]);
    const serialized = serializeDataset(snapshot);
    const plan = createTranslationPlan(dataset([]), snapshot, serialized);
    await Promise.all([
      writeFile(join(root, TRANSLATION_SNAPSHOT_FILE), serialized, 'utf8'),
      writeFile(
        join(root, TRANSLATION_PLAN_FILE),
        JSON.stringify(plan),
        'utf8',
      ),
      writeFile(
        join(root, AGENT_TRANSLATIONS_FILE),
        JSON.stringify({
          schemaVersion: 1,
          planRevision: 'f'.repeat(64),
          model: 'local-agent',
          translations: [],
        }),
        'utf8',
      ),
    ]);

    await expect(
      executeTranslationWork({
        outputDirectory: join(root, 'data'),
        workDirectory: root,
        env: {},
      }),
    ).rejects.toThrow('different plan');
  });
});
