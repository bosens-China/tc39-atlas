import { describe, expect, it } from 'vitest';

import { extractReadmeStage, readmeStageConflict } from './readme-stage.js';

describe('README stage metadata', () => {
  it.each([
    ['Stage: 3', 3],
    ['**Stage**: 2.7', 2.7],
    ['阶段：第 4 阶段', 4],
    ['Stage 2 (draft)', 2],
  ] as const)('extracts %s', (markdown, expected) => {
    expect(
      extractReadmeStage(`# Proposal\n\n${markdown}\n\n## Motivation`),
    ).toBe(expected);
  });

  it('ignores stage references after the README metadata area', () => {
    expect(
      extractReadmeStage('# Proposal\n\n## History\n\nStage: 2'),
    ).toBeNull();
  });

  it('reports only explicit conflicts with a known Dataset stage', () => {
    const readme = '# Proposal\n\nStage: 3';
    expect(readmeStageConflict(readme, 4)).toEqual({
      canonicalStage: 4,
      readmeStage: 3,
    });
    expect(readmeStageConflict(readme, 3)).toBeNull();
    expect(readmeStageConflict(readme, null)).toBeNull();
  });
});
