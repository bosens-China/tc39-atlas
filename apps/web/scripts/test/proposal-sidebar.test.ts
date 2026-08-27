import {
  DATASET_SCHEMA_VERSION,
  type AtlasDataset,
  type AtlasProposal,
} from '@tc39-atlas/core/model';
import { describe, expect, it } from 'vitest';

import { proposalSidebar } from '../proposal-sidebar.js';

function proposal(id: string, title: string): AtlasProposal {
  return {
    id,
    title,
    titleZh: `${title} 中文`,
    stage: 3,
    edition: 2026,
    status: 'active',
    repositoryUrl: `https://github.com/tc39/${id}`,
    syncedAt: '2026-08-09T00:00:00.000Z',
    readme: `# ${title}`,
    readmeHash: 'a'.repeat(64),
    readmeZh: null,
    overview: null,
    translation: null,
  };
}

describe('proposal sidebar', () => {
  it('groups proposals by edition and stage with newest additions first', () => {
    const newer = proposal('proposal-newer', 'Newer');
    newer.readmeZh = '# 较新';
    newer.overview = { en: 'Newer overview.', zh: '较新速览。' };
    const older = proposal('proposal-older', 'Older');
    const dataset: AtlasDataset = {
      schemaVersion: DATASET_SCHEMA_VERSION,
      generatedAt: '2026-08-09T00:00:00.000Z',
      checkedAt: '2026-08-09T00:00:00.000Z',
      proposals: [older, newer],
      changes: [
        {
          id: 'newer-added',
          proposalId: newer.id,
          kind: 'added',
          before: null,
          after: newer,
          detectedAt: '2026-08-08T00:00:00.000Z',
        },
        {
          id: 'older-added',
          proposalId: older.id,
          kind: 'added',
          before: null,
          after: older,
          detectedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    };

    const sidebar = proposalSidebar(dataset, 'zh');
    expect(sidebar).toContain('"label": "按年份"');
    expect(sidebar).toContain('"label": "按阶段"');
    expect(sidebar).toContain('"label": "ES2026"');
    expect(sidebar).toContain('/proposals/year/2026/proposal-newer.html');
    expect(sidebar).toContain('/proposals/stage/3/proposal-newer.html');
    expect(sidebar).toContain('"label": "Newer"');
    expect(sidebar).not.toContain('"label": "Newer 中文"');
    expect(sidebar).toContain('"tag": "未译"');
    const englishSidebar = proposalSidebar(dataset, 'en');
    expect(englishSidebar).not.toContain('"tag": "未译"');
    expect(englishSidebar).toContain(
      '/proposals/year/2026/proposal-newer.html',
    );
    expect(englishSidebar).not.toContain('/en/proposals/');
    expect(sidebar.indexOf('proposal-newer.html')).toBeLessThan(
      sidebar.indexOf('proposal-older.html'),
    );
  });

  it('does not mark an upstream-empty README as untranslated', () => {
    const noSource = proposal('proposal-no-source', 'No source');
    noSource.readme = '';
    noSource.readmeZh = '';
    noSource.overview = {
      en: 'The upstream README is unavailable.',
      zh: '上游 README 暂不可用。',
    };
    const dataset: AtlasDataset = {
      schemaVersion: DATASET_SCHEMA_VERSION,
      generatedAt: '2026-08-09T00:00:00.000Z',
      checkedAt: '2026-08-09T00:00:00.000Z',
      proposals: [noSource],
      changes: [],
    };

    expect(proposalSidebar(dataset, 'zh')).not.toContain('"tag": "未译"');
  });
});
