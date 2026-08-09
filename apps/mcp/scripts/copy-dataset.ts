import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseAtlasDataset,
  parseDatasetManifest,
} from '@tc39-atlas/core/model';

const mcpRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = join(mcpRoot, '..', 'web', 'docs', 'public', 'data');
const outputDirectory = join(mcpRoot, 'dist', 'data');
const datasetPath = join(sourceDirectory, 'dataset.json');
const manifestPath = join(sourceDirectory, 'manifest.json');
const [datasetText, manifestText] = await Promise.all([
  readFile(datasetPath, 'utf8'),
  readFile(manifestPath, 'utf8'),
]);
const manifest = parseDatasetManifest(JSON.parse(manifestText) as unknown);
parseAtlasDataset(JSON.parse(datasetText) as unknown);
const digest = createHash('sha256').update(datasetText).digest('hex');

if (
  manifest.dataset.bytes !== Buffer.byteLength(datasetText) ||
  manifest.dataset.sha256 !== digest ||
  manifest.revision !== digest
) {
  throw new Error('Published dataset does not match its manifest');
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  copyFile(datasetPath, join(outputDirectory, 'dataset.json')),
  copyFile(manifestPath, join(outputDirectory, 'manifest.json')),
]);
console.log(
  JSON.stringify({
    event: 'bundled_dataset_copied',
    revision: manifest.revision,
    bytes: manifest.dataset.bytes,
  }),
);
