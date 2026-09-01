import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { DATASET_SCHEMA_VERSION, type AtlasDataset } from './model.js';
import { INITIAL_REPORT_DATE } from './report-date.js';

export const INITIAL_GENERATED_AT = new Date(0).toISOString();

export function emptyDataset(): AtlasDataset {
  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    generatedAt: INITIAL_GENERATED_AT,
    checkedAt: INITIAL_GENERATED_AT,
    reportDate: INITIAL_REPORT_DATE,
    previousReportDate: null,
    proposals: [],
    changes: [],
  };
}

export async function writeAtomically(
  path: string,
  contents: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}
