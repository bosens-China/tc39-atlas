import { createHash } from 'node:crypto';

export const TRANSLATION_TARGET_LANGUAGE = 'zh-CN';
export const TRANSLATION_CONTRACT_VERSION = '7';

export interface TranslationContent {
  title: string;
  readme: string;
  stage: number | null;
  status: string;
  edition: number | null;
}

export interface TranslationCacheKeyOptions {
  targetLanguage?: string;
  contractVersion?: string;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** 内容哈希覆盖所有会影响译文与提案速览的业务输入。 */
export function translationContentHash(content: TranslationContent): string {
  return stableHash([
    content.title,
    content.readme,
    content.stage,
    content.status,
    content.edition,
  ]);
}

/** 缓存键隔离目标语言与人工控制的翻译契约版本。 */
export function translationCacheKey(
  content: TranslationContent,
  options: TranslationCacheKeyOptions = {},
): string {
  return stableHash([
    translationContentHash(content),
    options.targetLanguage ?? TRANSLATION_TARGET_LANGUAGE,
    options.contractVersion ?? TRANSLATION_CONTRACT_VERSION,
  ]);
}
