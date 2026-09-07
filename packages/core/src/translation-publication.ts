import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DATASET_FILE_NAME } from './dataset-manifest.js';

/** 使用正式文件的精确字节识别同一天的更新、译文补齐和首次发布。 */
export async function publishedDatasetRevision(
  outputDirectory: string,
): Promise<string | null> {
  try {
    const contents = await readFile(join(outputDirectory, DATASET_FILE_NAME));
    return createHash('sha256').update(contents).digest('hex');
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

/** 翻译可能耗时很久，执行前和最终写入前都必须确认扫描基线未变化。 */
export async function verifyPublicationBaseline(
  outputDirectory: string,
  expectedRevision: string | null,
): Promise<void> {
  if ((await publishedDatasetRevision(outputDirectory)) !== expectedRevision) {
    throw new Error('Published dataset changed; run sync:scan again');
  }
}
