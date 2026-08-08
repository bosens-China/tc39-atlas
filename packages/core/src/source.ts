import { createHash } from 'node:crypto';

import { Ajv, type AnySchema } from 'ajv';
import pMap from 'p-map';
import pRetry, { AbortError } from 'p-retry';

import {
  proposalStages,
  type ProposalStage,
  type ProposalStatus,
  type SyncedProposal,
} from './model.js';

const DATASET_URL = 'https://tc39.es/dataset/proposals.min.json';
const DATASET_HOME = 'https://tc39.es/dataset/';
const SCHEMA_URL = 'https://tc39.es/dataset/schema/bundle.json';
const EXPECTED_SCHEMA_HASH =
  '569f291121340bfd4a8a76a0942f049fb6186b8fabab9d9ef129f31c8efbaf35';

type DatasetTag =
  'ECMA-262' | 'ECMA-402' | 'inactive' | 'withdrawn' | 'archived';

interface DatasetProposal {
  tags: DatasetTag[];
  stage?: number;
  name: string;
  id?: string;
  url?: string;
  authors: string[];
  champions: string[];
  edition?: number;
}

interface ProposalMetadata {
  id: string;
  title: string;
  stage: ProposalStage | null;
  edition: number | null;
  status: ProposalStatus;
  repositoryUrl: string;
}

// 官方 bundle Schema 当前与产物不自洽；哈希监控上游契约，最小 Schema 保护实际入库字段。
const datasetContract = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      tags: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['ECMA-262', 'ECMA-402', 'inactive', 'withdrawn', 'archived'],
        },
        minItems: 1,
      },
      stage: { type: 'number', enum: [-1, 0, 1, 2, 2.7, 3, 4] },
      name: { type: 'string', minLength: 1 },
      id: { type: 'string', minLength: 1 },
      url: { type: 'string', minLength: 1 },
      authors: { type: 'array', items: { type: 'string' } },
      champions: { type: 'array', items: { type: 'string' } },
      edition: { type: 'integer', minimum: 2015 },
    },
    required: ['tags', 'name', 'authors', 'champions'],
    additionalProperties: true,
  },
} as const;

const ajv = new Ajv({ allErrors: true, strict: true });
const validateDataset = ajv.compile<DatasetProposal[]>(datasetContract);

function jsonHash(value: unknown): string {
  const json = JSON.stringify(value);
  if (!json) throw new Error('TC39 dataset schema is not JSON');
  return createHash('sha256').update(json).digest('hex');
}

function failSource(event: string, details: Record<string, unknown>): never {
  console.error(JSON.stringify({ level: 'error', event, ...details }));
  throw new Error(event);
}

export function verifyOfficialSchema(schema: unknown): void {
  if (
    (typeof schema !== 'boolean' &&
      (typeof schema !== 'object' ||
        schema === null ||
        Array.isArray(schema))) ||
    !ajv.validateSchema(schema as AnySchema)
  ) {
    failSource('tc39_dataset_schema_invalid', {
      schema_url: SCHEMA_URL,
      errors: ajv.errors,
    });
  }
  const actualHash = jsonHash(schema);
  if (actualHash !== EXPECTED_SCHEMA_HASH) {
    failSource('tc39_dataset_schema_changed', {
      schema_url: SCHEMA_URL,
      expected_hash: EXPECTED_SCHEMA_HASH,
      actual_hash: actualHash,
    });
  }
}

function slug(value: string): string {
  const result = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (
    result || createHash('sha256').update(value).digest('hex').slice(0, 16)
  );
}

function normalizeRepositoryUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== 'github.com') return url.href.replace(/\/$/, '');
  const [owner, repository] = url.pathname.split('/').filter(Boolean);
  return owner && repository
    ? `https://github.com/${owner}/${repository.replace(/\.git$/, '')}`
    : url.href.replace(/\/$/, '');
}

function proposalStatus(proposal: DatasetProposal): ProposalStatus {
  if (proposal.tags.includes('withdrawn')) return 'withdrawn';
  if (proposal.tags.includes('inactive')) return 'inactive';
  return proposal.stage === 4 ? 'finished' : 'active';
}

export function parseDataset(value: unknown): ProposalMetadata[] {
  if (!validateDataset(value)) {
    failSource('tc39_dataset_validation_failed', {
      dataset_url: DATASET_URL,
      errors: validateDataset.errors,
    });
  }

  const idCounts = new Map<string, number>();
  for (const proposal of value) {
    if (proposal.id)
      idCounts.set(proposal.id, (idCounts.get(proposal.id) ?? 0) + 1);
  }

  const ids = new Set<string>();
  return value.map((proposal) => {
    const id =
      proposal.id && idCounts.get(proposal.id) === 1
        ? proposal.id
        : slug(proposal.name);
    if (ids.has(id)) {
      failSource('tc39_dataset_duplicate_id', { id, title: proposal.name });
    }
    ids.add(id);
    const stage = proposalStages.includes(proposal.stage as ProposalStage)
      ? (proposal.stage as ProposalStage)
      : null;
    return {
      id,
      title: proposal.name,
      stage,
      edition: proposal.edition ?? null,
      status: proposalStatus(proposal),
      repositoryUrl: normalizeRepositoryUrl(proposal.url ?? DATASET_HOME),
    };
  });
}

async function fetchText(url: string, notFound?: string): Promise<string> {
  return pRetry(
    async () => {
      const response = await fetch(url, {
        headers: { 'user-agent': 'tc39-atlas/0.1' },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404 && notFound !== undefined) return notFound;
      if (!response.ok) {
        const error = new Error(`${response.status} ${url}`);
        if (response.status < 500 && ![408, 429].includes(response.status)) {
          throw new AbortError(error);
        }
        throw error;
      }
      return response.text();
    },
    { retries: 3, randomize: true },
  );
}

async function fetchJson(url: string): Promise<unknown> {
  return JSON.parse(await fetchText(url)) as unknown;
}

export async function fetchReadme(repositoryUrl: string): Promise<string> {
  const url = new URL(repositoryUrl);
  if (url.hostname !== 'github.com') return '';
  const [owner, repository] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repository) return '';
  return fetchText(
    `https://raw.githubusercontent.com/${owner}/${repository}/HEAD/README.md`,
    '',
  );
}

export async function fetchTc39Proposals(): Promise<SyncedProposal[]> {
  const [schema, dataset] = await Promise.all([
    fetchJson(SCHEMA_URL),
    fetchJson(DATASET_URL),
  ]);
  verifyOfficialSchema(schema);
  const metadata = parseDataset(dataset);
  const syncedAt = new Date().toISOString();

  return pMap(
    metadata,
    async (proposal) => {
      const readme = await fetchReadme(proposal.repositoryUrl);
      return {
        ...proposal,
        readme,
        readmeHash: createHash('sha256').update(readme).digest('hex'),
        syncedAt,
      };
    },
    { concurrency: 8 },
  );
}
