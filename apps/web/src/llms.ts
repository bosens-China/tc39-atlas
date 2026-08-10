import type { LlmsTxtContext, LlmsTxtPage } from '@rspress/core';

const contextualProposalRoute = /^\/(?:[a-z-]+\/)?proposals\/(?:year|stage)\//;

function frontmatterValue(page: LlmsTxtPage, key: string): unknown {
  return (page.frontmatter as Record<string, unknown>)[key];
}

function proposalDetails(page: LlmsTxtPage): string | null {
  if (typeof frontmatterValue(page, 'proposalId') !== 'string') return null;

  const stage = frontmatterValue(page, 'proposalStage');
  const status = frontmatterValue(page, 'proposalStatus');
  const edition = frontmatterValue(page, 'proposalEdition');
  return [
    typeof stage === 'number' ? `Stage ${stage}` : null,
    typeof status === 'string' ? status : null,
    typeof edition === 'number' ? `ES${edition}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

function pageLine(page: LlmsTxtPage): string {
  const details = proposalDetails(page) ?? page.description;
  return `- [${page.title}](${page.link})${details ? ` — ${details}` : ''}`;
}

/** 只暴露 canonical 提案页，并把兼容性判断需要的结构化元数据写入索引。 */
export function renderLlmsTxt({
  title,
  description,
  lang,
  sections,
}: LlmsTxtContext): string {
  const seenLinks = new Set<string>();
  const content = sections.flatMap((section) => {
    const pages = section.pages.filter((page) => {
      if (contextualProposalRoute.test(page.routePath)) return false;
      if (seenLinks.has(page.link)) return false;
      seenLinks.add(page.link);
      return true;
    });
    return pages.length
      ? [`## ${section.title}\n\n${pages.map(pageLine).join('\n')}`]
      : [];
  });
  return [
    `# ${title ?? 'TC39 Atlas'}`,
    lang === 'en'
      ? '> A searchable knowledge base for TC39 proposals'
      : description
        ? `> ${description}`
        : '',
    ...content,
  ]
    .filter(Boolean)
    .join('\n\n');
}
