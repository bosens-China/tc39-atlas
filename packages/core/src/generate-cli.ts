import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateAtlasDataset } from './dataset.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const outputDirectory = resolve(
  repositoryRoot,
  process.env.DATASET_OUTPUT_DIR ?? 'apps/web/docs/public/data',
);
const result = await generateAtlasDataset({
  outputDirectory,
  ...(process.env.PREVIOUS_DATASET_URL
    ? { previousUrl: process.env.PREVIOUS_DATASET_URL }
    : {}),
});

console.log(
  JSON.stringify({
    proposals: result.dataset.proposals.length,
    changes: result.dataset.changes.length,
    revision: result.manifest.revision,
    translation: result.translation,
    outputDirectory,
  }),
);
