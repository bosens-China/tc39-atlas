import { createHash } from 'node:crypto';

import {
  DATASET_SCHEMA_VERSION,
  type AtlasDataset,
  type DatasetManifest,
} from './model.js';

export const DATASET_FILE_NAME = 'dataset.json';
export const MANIFEST_FILE_NAME = 'manifest.json';

/** 清单索引数据集的精确字节与稳定日更批次。 */
export function createDatasetManifest(
  dataset: AtlasDataset,
  serialized: string,
): DatasetManifest {
  const sha256 = createHash('sha256').update(serialized).digest('hex');
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    revision: sha256,
    generatedAt: dataset.generatedAt,
    checkedAt: dataset.checkedAt,
    reportDate: dataset.reportDate,
    dataset: {
      url: DATASET_FILE_NAME,
      sha256,
      bytes: Buffer.byteLength(serialized),
    },
  };
}
