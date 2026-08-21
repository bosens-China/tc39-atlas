import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchReadme, parseDataset, verifyOfficialSchema } from './source.js';

afterEach(() => vi.unstubAllGlobals());

describe('TC39 dataset source', () => {
  it('maps stages and distinguishes withdrawn proposals', () => {
    const proposals = parseDataset([
      {
        tags: ['ECMA-262'],
        stage: 2.7,
        id: 'proposal-shared',
        name: 'First Proposal',
        url: 'https://github.com/tc39/proposal-shared',
        authors: [],
        champions: ['Example'],
      },
      {
        tags: ['ECMA-262', 'withdrawn'],
        stage: -1,
        id: 'proposal-shared',
        name: 'Withdrawn Proposal',
        authors: [],
        champions: ['Example'],
      },
      {
        tags: ['ECMA-402'],
        name: 'Unknown Stage',
        authors: ['Example'],
        champions: ['Example'],
      },
    ]);

    expect(proposals).toMatchObject([
      { id: 'first-proposal', stage: 2.7, status: 'active' },
      { id: 'withdrawn-proposal', stage: null, status: 'withdrawn' },
      { id: 'unknown-stage', stage: null, status: 'active' },
    ]);
  });

  it('logs an actionable event when the official schema changes', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() => verifyOfficialSchema({})).toThrow(
      'tc39_dataset_schema_changed',
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('tc39_dataset_schema_changed'),
    );

    error.mockRestore();
  });

  it('keeps missing README empty but surfaces other download failures', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(
      fetchReadme('https://github.com/tc39/proposal-missing'),
    ).resolves.toBe('');

    fetchMock.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(
      fetchReadme('https://github.com/tc39/proposal-private'),
    ).rejects.toThrow('403');
  });
});
