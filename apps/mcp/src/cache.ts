import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

import {
  parseAtlasDataset,
  parseDatasetManifest,
  type AtlasDataset,
  type DatasetManifest,
} from '@tc39-atlas/core/model';

export const DEFAULT_MANIFEST_URL =
  'https://bosens-china.github.io/tc39-atlas/data/manifest.json';

export class DatasetStore {
  #dataset: AtlasDataset;
  #revision: string;

  constructor(dataset: AtlasDataset, revision: string) {
    this.#dataset = dataset;
    this.#revision = revision;
  }

  get dataset(): AtlasDataset {
    return this.#dataset;
  }

  get revision(): string {
    return this.#revision;
  }

  replace(dataset: AtlasDataset, revision: string): void {
    this.#dataset = dataset;
    this.#revision = revision;
  }
}

export interface OpenDatasetOptions {
  manifestUrl?: string;
  cacheDirectory?: string;
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
}

export interface OpenDatasetResult {
  store: DatasetStore;
  refresh: Promise<'current' | 'updated'>;
}

interface CachedDataset {
  dataset: AtlasDataset;
  manifest: DatasetManifest;
}

function cacheDirectory(env: NodeJS.ProcessEnv): string {
  if (env.TC39_ATLAS_CACHE_DIR) return env.TC39_ATLAS_CACHE_DIR;
  if (process.platform === 'win32') {
    return join(
      env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'),
      'tc39-atlas',
    );
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'tc39-atlas');
  }
  return join(env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'tc39-atlas');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

async function readCache(directory: string): Promise<CachedDataset | null> {
  try {
    const [manifestText, datasetText] = await Promise.all([
      readFile(join(directory, 'manifest.json'), 'utf8'),
      readFile(join(directory, 'dataset.json'), 'utf8'),
    ]);
    const manifest = parseDatasetManifest(JSON.parse(manifestText) as unknown);
    if (
      Buffer.byteLength(datasetText) !== manifest.dataset.bytes ||
      sha256(datasetText) !== manifest.dataset.sha256
    ) {
      throw new Error('Cached dataset checksum does not match its manifest');
    }
    return {
      manifest,
      dataset: parseAtlasDataset(JSON.parse(datasetText) as unknown),
    };
  } catch (error: unknown) {
    if (isMissingFile(error)) return null;
    log('warn', 'dataset_cache_invalid', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function writeAtomically(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, value, 'utf8');
  await rename(temporaryPath, path);
}

async function fetchText(url: URL, fetcher: typeof fetch): Promise<string> {
  const response = await fetcher(url, {
    headers: { 'user-agent': '@tc39-atlas/mcp' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url.href}`);
  return response.text();
}

async function refreshDataset(
  store: DatasetStore | null,
  directory: string,
  manifestUrl: URL,
  fetcher: typeof fetch,
): Promise<{ store: DatasetStore; status: 'current' | 'updated' }> {
  const manifestText = await fetchText(manifestUrl, fetcher);
  const manifest = parseDatasetManifest(JSON.parse(manifestText) as unknown);
  if (store?.revision === manifest.revision) {
    log('info', 'dataset_cache_current', { revision: manifest.revision });
    return { store, status: 'current' };
  }

  const datasetUrl = new URL(manifest.dataset.url, manifestUrl);
  const datasetText = await fetchText(datasetUrl, fetcher);
  if (
    Buffer.byteLength(datasetText) !== manifest.dataset.bytes ||
    sha256(datasetText) !== manifest.dataset.sha256
  ) {
    throw new Error('Downloaded dataset checksum does not match its manifest');
  }
  const dataset = parseAtlasDataset(JSON.parse(datasetText) as unknown);
  await writeAtomically(join(directory, 'dataset.json'), datasetText);
  await writeAtomically(join(directory, 'manifest.json'), manifestText);

  if (store) store.replace(dataset, manifest.revision);
  else store = new DatasetStore(dataset, manifest.revision);
  log('info', 'dataset_cache_updated', {
    revision: manifest.revision,
    proposals: dataset.proposals.length,
  });
  return { store, status: 'updated' };
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  details: Record<string, unknown>,
): void {
  console.error(JSON.stringify({ level, event, ...details }));
}

// 有缓存时立即返回并后台检查；无缓存时等待首份完整数据下载。
export async function openDatasetStore(
  options: OpenDatasetOptions = {},
): Promise<OpenDatasetResult> {
  const env = options.env ?? process.env;
  const directory = options.cacheDirectory ?? cacheDirectory(env);
  const manifestUrl = new URL(
    options.manifestUrl ?? env.TC39_ATLAS_MANIFEST_URL ?? DEFAULT_MANIFEST_URL,
  );
  const fetcher = options.fetcher ?? fetch;
  const cached = await readCache(directory);
  const store = cached
    ? new DatasetStore(cached.dataset, cached.manifest.revision)
    : null;
  const update = refreshDataset(store, directory, manifestUrl, fetcher);

  if (!store) {
    const first = await update;
    return { store: first.store, refresh: Promise.resolve(first.status) };
  }
  return {
    store,
    refresh: update
      .then(({ status }) => status)
      .catch((error: unknown) => {
        log('warn', 'dataset_background_refresh_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return 'current';
      }),
  };
}
