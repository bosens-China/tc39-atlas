import type { LlmsTxtContext, LlmsTxtPage } from '@rspress/core';
import { describe, expect, it } from 'vitest';

import { renderLlmsTxt } from '../llms.js';

function page(
  routePath: string,
  link: string,
  frontmatter: Record<string, unknown> = {},
): LlmsTxtPage {
  return {
    routePath,
    link,
    title: 'Iterator Helpers',
    description: 'Proposal documentation',
    frontmatter,
    lang: 'en',
    version: '',
  };
}

describe('renderLlmsTxt', () => {
  it('保留 canonical 提案并输出阶段、状态和版本', () => {
    const proposal = {
      proposalId: 'iterator-helpers',
      proposalStage: 4,
      proposalStatus: 'finished',
      proposalEdition: 2025,
    };
    const context: LlmsTxtContext = {
      title: 'TC39 Atlas',
      description: 'TC39 proposals',
      lang: 'en',
      version: '',
      base: '/',
      siteOrigin: undefined,
      sections: [
        {
          title: 'Proposals',
          pages: [
            page(
              '/en/proposals/iterator-helpers.html',
              '/en/proposals/iterator-helpers.md',
              proposal,
            ),
            page(
              '/en/proposals/year/2025/iterator-helpers.html',
              '/en/proposals/year/2025/iterator-helpers.md',
              proposal,
            ),
            page(
              '/en/proposals/stage/4/iterator-helpers.html',
              '/en/proposals/stage/4/iterator-helpers.md',
              proposal,
            ),
          ],
        },
      ],
    };

    const result = renderLlmsTxt(context);

    expect(result).toContain(
      '[Iterator Helpers](/en/proposals/iterator-helpers.md) — Stage 4 · finished · ES2025',
    );
    expect(result).toContain(
      '> A searchable knowledge base for TC39 proposals',
    );
    expect(result).not.toContain('/proposals/year/');
    expect(result).not.toContain('/proposals/stage/');
  });

  it('保留普通文档描述并去重链接', () => {
    const ordinary = page('/about.html', '/about.md');
    const context: LlmsTxtContext = {
      title: undefined,
      description: undefined,
      lang: 'zh',
      version: '',
      base: '/',
      siteOrigin: undefined,
      sections: [
        { title: '关于', pages: [ordinary] },
        { title: '重复', pages: [ordinary] },
      ],
    };

    const result = renderLlmsTxt(context);

    expect(result).toContain('# TC39 Atlas');
    expect(result.match(/\/about\.md/g)).toHaveLength(1);
  });
});
