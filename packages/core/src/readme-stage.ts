import { proposalStages, type ProposalStage } from './model.js';

const stageByText = new Map(
  proposalStages.map((stage) => [String(stage), stage] as const),
);
const STAGE_METADATA_PATTERN =
  /^(?:stage|阶段)\s*[:：]?\s*(?:第\s*)?(0|1|2(?:\.7)?|3|4)(?:\s*阶段)?(?:\s|[.,;，。；(（]|$)/i;

export interface ReadmeStageConflict {
  canonicalStage: ProposalStage;
  readmeStage: ProposalStage;
}

function plainMetadataLine(line: string): string {
  return line
    .replaceAll(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replaceAll(/[*_`]/g, '')
    .trim();
}

/** 只检查 README 开头的元数据区，避免把历史阶段叙述当成当前标注。 */
export function extractReadmeStage(markdown: string): ProposalStage | null {
  let inspectedLines = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^#{2,6}(?:\s|$)/.test(trimmed)) break;
    if (!trimmed) continue;
    inspectedLines += 1;
    if (inspectedLines > 40) break;
    const match = STAGE_METADATA_PATTERN.exec(plainMetadataLine(trimmed));
    if (!match?.[1]) continue;
    return stageByText.get(match[1]) ?? null;
  }
  return null;
}

/** Dataset 是当前阶段的唯一事实源；README 阶段只用于发现上游陈旧标注。 */
export function readmeStageConflict(
  markdown: string,
  canonicalStage: ProposalStage | null,
): ReadmeStageConflict | null {
  if (canonicalStage === null) return null;
  const readmeStage = extractReadmeStage(markdown);
  return readmeStage !== null && readmeStage !== canonicalStage
    ? { canonicalStage, readmeStage }
    : null;
}
