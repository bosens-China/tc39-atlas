import {
  countProposals,
  getLatestSync,
  getProposalChanges,
  getProposals,
  proposalChangeKinds,
  proposalStages,
  proposalStatuses,
  searchProposals,
  type Database,
  type ProposalChange,
  type ProposalFilter,
  type ProposalSnapshot,
  type ProposalStage,
  type ProposalStatus,
  type ProposalSummary,
} from '@tc39-atlas/core';
import { swaggerUI } from '@hono/swagger-ui';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

const stageSchema = z.union(proposalStages.map((stage) => z.literal(stage)));
const statusSchema = z.enum(proposalStatuses);
const changeKindSchema = z.enum(proposalChangeKinds);
const snapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  stage: stageSchema.nullable(),
  edition: z.number().int().nullable(),
  status: statusSchema,
  repository_url: z.string().url(),
});
const summarySchema = snapshotSchema
  .extend({ data_updated_at: z.string().datetime() })
  .openapi('ProposalSummary');
const detailSchema = summarySchema
  .extend({ readme: z.string() })
  .openapi('ProposalDetail');
const errorSchema = z.object({
  error: z.string(),
  issues: z.array(z.unknown()).optional(),
});
const changeSchema = z.object({
  id: z.number().int(),
  proposal_id: z.string(),
  kind: changeKindSchema,
  before: snapshotSchema.nullable(),
  after: snapshotSchema,
  occurred_at: z.string().datetime(),
});

const listQuerySchema = z.object({
  stages: z
    .string()
    .regex(/^(?:0|1|2|2\.7|3|4)(?:,(?:0|1|2|2\.7|3|4))*$/)
    .optional(),
  editions: z
    .string()
    .regex(/^20\d{2}(?:,20\d{2})*$/)
    .optional(),
  statuses: z
    .string()
    .regex(
      /^(?:active|finished|inactive|withdrawn)(?:,(?:active|finished|inactive|withdrawn))*$/,
    )
    .optional(),
  keywords: z.string().min(1).max(500).optional(),
  keyword_mode: z.enum(['all', 'any']).default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const listRoute = createRoute({
  method: 'get',
  path: '/proposals',
  request: { query: listQuerySchema },
  responses: {
    200: {
      description: 'Filtered proposal page',
      content: {
        'application/json': {
          schema: z.object({
            proposals: z.array(summarySchema),
            total: z.number().int(),
            limit: z.number().int(),
            offset: z.number().int(),
          }),
        },
      },
    },
    400: {
      description: 'Invalid query',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/proposals/{id}',
  request: {
    params: z.object({
      id: z
        .string()
        .min(1)
        .openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'Proposal metadata and repository README',
      content: { 'application/json': { schema: detailSchema } },
    },
    404: {
      description: 'Proposal not found',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

const changesRoute = createRoute({
  method: 'get',
  path: '/changes',
  request: {
    query: z.object({
      period: z.enum(['day', 'week', 'month']).default('day'),
      limit: z.coerce.number().int().min(1).max(500).default(500),
    }),
  },
  responses: {
    200: {
      description: 'Proposal changes in the selected period',
      content: {
        'application/json': {
          schema: z.object({
            period: z.enum(['day', 'week', 'month']),
            since: z.string().datetime(),
            changes: z.array(changeSchema),
          }),
        },
      },
    },
  },
});

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      description: 'Service health and latest successful sync',
      content: {
        'application/json': {
          schema: z.object({
            status: z.literal('ok'),
            latest_sync: z.string().datetime().nullable(),
          }),
        },
      },
    },
  },
});

function jsonSnapshot(proposal: ProposalSnapshot) {
  return {
    id: proposal.id,
    title: proposal.title,
    stage: proposal.stage,
    edition: proposal.edition,
    status: proposal.status,
    repository_url: proposal.repositoryUrl,
  };
}

export function jsonSummary(proposal: ProposalSummary) {
  return {
    ...jsonSnapshot(proposal),
    data_updated_at: proposal.syncedAt.toISOString(),
  };
}

function jsonChange(change: ProposalChange) {
  return {
    id: change.id,
    proposal_id: change.proposalId,
    kind: change.kind,
    before: change.before ? jsonSnapshot(change.before) : null,
    after: jsonSnapshot(change.after),
    occurred_at: change.occurredAt.toISOString(),
  };
}

function csv<T extends string | number>(
  value: string | undefined,
  convert: (item: string) => T,
): T[] | undefined {
  return value?.split(',').map(convert);
}

export function createApiApp(db: Database) {
  const api = new OpenAPIHono({
    defaultHook: (result, context) =>
      result.success
        ? undefined
        : context.json(
            { error: 'validation_error', issues: result.error.issues },
            400,
          ),
  }).basePath('/api');

  api.openapi(listRoute, async (context) => {
    const query = context.req.valid('query');
    const stages = csv(query.stages, Number) as ProposalStage[] | undefined;
    const editions = csv(query.editions, Number);
    const statuses = csv(query.statuses, String) as
      ProposalStatus[] | undefined;
    const keywords = csv(query.keywords, String);
    const filter: ProposalFilter = {
      ...(stages ? { stages } : {}),
      ...(editions ? { editions } : {}),
      ...(statuses ? { statuses } : {}),
      ...(keywords ? { keywords } : {}),
      keywordMode: query.keyword_mode,
      limit: query.limit,
      offset: query.offset,
    };
    const [proposals, total] = await Promise.all([
      searchProposals(db, filter),
      countProposals(db, filter),
    ]);
    return context.json(
      {
        proposals: proposals.map(jsonSummary),
        total,
        limit: query.limit,
        offset: query.offset,
      },
      200,
    );
  });

  api.openapi(detailRoute, async (context) => {
    const { id } = context.req.valid('param');
    const [proposal] = await getProposals(db, [id], true);
    if (!proposal || !('readme' in proposal)) {
      return context.json({ error: 'proposal_not_found' }, 404);
    }
    return context.json(
      { ...jsonSummary(proposal), readme: proposal.readme },
      200,
    );
  });

  api.openapi(changesRoute, async (context) => {
    const { period, limit } = context.req.valid('query');
    const days = { day: 1, week: 7, month: 30 }[period];
    const since = new Date(Date.now() - days * 86_400_000);
    const changes = await getProposalChanges(db, since, limit);
    return context.json(
      {
        period,
        since: since.toISOString(),
        changes: changes.map(jsonChange),
      },
      200,
    );
  });

  api.openapi(healthRoute, async (context) => {
    const latestSync = await getLatestSync(db);
    return context.json(
      {
        status: 'ok' as const,
        latest_sync: latestSync?.toISOString() ?? null,
      },
      200,
    );
  });

  api.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
      title: 'TC39 Atlas API',
      version: '0.1.0',
      description: 'Read-only proposal data for the TC39 Atlas web client.',
    },
  });
  api.get('/docs', swaggerUI({ url: '/api/openapi.json' }));
  return api;
}
