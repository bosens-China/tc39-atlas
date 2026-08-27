import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const skillRoot = fileURLToPath(
  new URL('../../../../.agents/skills/modernize-ecmascript/', import.meta.url),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJson(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(`${skillRoot}${relativePath}`, 'utf8'));
}

describe('modernize-ecmascript Skill 评测契约', () => {
  it('行为评测覆盖唯一编号、输入和可验证预期', async () => {
    const document = await readJson('evals/evals.json');

    expect(isRecord(document)).toBe(true);
    if (!isRecord(document)) return;

    expect(document.skill_name).toBe('modernize-ecmascript');
    expect(Array.isArray(document.evals)).toBe(true);
    if (!Array.isArray(document.evals)) return;

    const ids: number[] = [];
    for (const evaluation of document.evals) {
      expect(isRecord(evaluation)).toBe(true);
      if (!isRecord(evaluation)) continue;

      expect(typeof evaluation.id).toBe('number');
      expect(typeof evaluation.prompt).toBe('string');
      expect(typeof evaluation.expected_output).toBe('string');
      expect(Array.isArray(evaluation.files)).toBe(true);
      expect(Array.isArray(evaluation.expectations)).toBe(true);

      if (typeof evaluation.id === 'number') ids.push(evaluation.id);
      if (Array.isArray(evaluation.expectations)) {
        expect(evaluation.expectations.length).toBeGreaterThan(0);
        for (const expectation of evaluation.expectations) {
          expect(typeof expectation).toBe('string');
        }
      }
    }

    expect(document.evals.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(document.evals.length);
  });

  it('触发评测包含足够的正例、近似负例和唯一查询', async () => {
    const evaluations = await readJson('evals/trigger-evals.json');

    expect(Array.isArray(evaluations)).toBe(true);
    if (!Array.isArray(evaluations)) return;

    const queries: string[] = [];
    let positiveCount = 0;
    let negativeCount = 0;

    for (const evaluation of evaluations) {
      expect(isRecord(evaluation)).toBe(true);
      if (!isRecord(evaluation)) continue;

      expect(typeof evaluation.query).toBe('string');
      expect(typeof evaluation.should_trigger).toBe('boolean');

      if (typeof evaluation.query === 'string') {
        queries.push(evaluation.query);
      }
      if (evaluation.should_trigger === true) positiveCount += 1;
      if (evaluation.should_trigger === false) negativeCount += 1;
    }

    expect(evaluations).toHaveLength(20);
    expect(positiveCount).toBeGreaterThanOrEqual(8);
    expect(negativeCount).toBeGreaterThanOrEqual(8);
    expect(new Set(queries).size).toBe(evaluations.length);
  });
});
