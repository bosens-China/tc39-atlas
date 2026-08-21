import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import type { TranslationWorkflowOptions } from './translation-workflow.js';

export const repositoryRoot = fileURLToPath(
  new URL('../../../', import.meta.url),
);

const environmentPath = resolve(repositoryRoot, '.env');
if (existsSync(environmentPath)) loadEnvFile(environmentPath);

export function translationWorkflowOptions(): TranslationWorkflowOptions {
  return {
    outputDirectory: resolve(
      repositoryRoot,
      process.env.DATASET_OUTPUT_DIR ?? 'apps/web/docs/public/data',
    ),
    workDirectory: resolve(
      repositoryRoot,
      process.env.SYNC_WORK_DIR ?? '.cache/tc39-atlas',
    ),
    env: process.env,
    ...(process.env.PREVIOUS_DATASET_URL
      ? { previousUrl: process.env.PREVIOUS_DATASET_URL }
      : {}),
  };
}
