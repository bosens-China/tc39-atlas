import {
  createDatabase,
  getLatestSync,
  getProposals,
  proposalStages,
  proposalStatuses,
  searchProposals,
  type Database,
  type ProposalStage,
} from '@tc39-atlas/core';
import { createMcpHonoApp } from '@modelcontextprotocol/hono';
import {
  createMcpHandler,
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
} from '@modelcontextprotocol/server';
import type { Context } from 'hono';
import { logger } from 'hono/logger';
import * as z from 'zod/v4';

import { createApiApp, jsonSummary } from './api.js';

const stageSchema = z.union(proposalStages.map((stage) => z.literal(stage)));
const statusSchema = z.enum(proposalStatuses);
const summarySchema = z.object({
  id: z.string(),
  title: z.string(),
  stage: stageSchema.nullable(),
  edition: z.number().int().nullable(),
  status: statusSchema,
  repository_url: z.url(),
  data_updated_at: z.iso.datetime(),
});
const detailSchema = summarySchema.extend({ readme: z.string() });

function jsonContent(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }];
}

// 工具和资源均只调用 core 查询，避免 MCP 入口复制业务规则。
export function createTc39McpServer(db: Database): McpServer {
  const server = new McpServer({ name: 'tc39-atlas', version: '0.1.0' });

  server.registerTool(
    'search_proposals',
    {
      title: 'Search TC39 proposals',
      description:
        'Search current TC39 proposals by stages, ECMAScript editions, statuses, and keywords. Keywords cover ID, title, and README.',
      inputSchema: z.object({
        stages: z.array(stageSchema).optional(),
        editions: z.array(z.number().int().min(2015)).optional(),
        statuses: z.array(statusSchema).optional(),
        keywords: z.array(z.string().min(1)).optional(),
        keyword_mode: z.enum(['all', 'any']).default('all'),
        limit: z.number().int().min(1).max(500).default(500),
        offset: z.number().int().min(0).default(0),
      }),
      outputSchema: z.object({
        proposals: z.array(summarySchema),
        count: z.number().int(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const proposals = (
        await searchProposals(db, {
          ...(input.stages ? { stages: input.stages } : {}),
          ...(input.editions ? { editions: input.editions } : {}),
          ...(input.statuses ? { statuses: input.statuses } : {}),
          ...(input.keywords ? { keywords: input.keywords } : {}),
          keywordMode: input.keyword_mode,
          limit: input.limit,
          offset: input.offset,
        })
      ).map(jsonSummary);
      const output = { proposals, count: proposals.length };
      return { content: jsonContent(output), structuredContent: output };
    },
  );

  server.registerTool(
    'get_proposals',
    {
      title: 'Get TC39 proposals',
      description:
        'Get one or more current TC39 proposals by stable ID, optionally including each repository README.',
      inputSchema: z.object({
        ids: z.array(z.string().min(1)).min(1).max(50),
        include_readme: z.boolean().default(true),
      }),
      outputSchema: z.object({
        proposals: z.array(z.union([summarySchema, detailSchema])),
        missing_ids: z.array(z.string()),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ ids, include_readme }) => {
      const rows = await getProposals(db, ids, include_readme);
      const proposals = rows.map((proposal) => ({
        ...jsonSummary(proposal),
        ...('readme' in proposal ? { readme: proposal.readme } : {}),
      }));
      const found = new Set(proposals.map((proposal) => proposal.id));
      const output = {
        proposals,
        missing_ids: ids.filter((id) => !found.has(id)),
      };
      return { content: jsonContent(output), structuredContent: output };
    },
  );

  registerResources(server, db);
  return server;
}

function registerResources(server: McpServer, db: Database): void {
  const resource = (
    name: string,
    template: string,
    description: string,
    load: (value: string) => Promise<unknown>,
  ) =>
    server.registerResource(
      name,
      new ResourceTemplate(template, { list: undefined }),
      { title: name, description, mimeType: 'application/json' },
      async (uri, variables) => {
        const value = String(Object.values(variables)[0] ?? '');
        const result = await load(value);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
          ttlMs: 300_000,
          cacheScope: 'public' as const,
        };
      },
    );

  resource(
    'TC39 proposals by stage',
    'tc39://stages/{stage}',
    'Lightweight current proposal index for one TC39 stage.',
    async (value) => {
      const stage = Number(value) as ProposalStage;
      if (!proposalStages.includes(stage)) {
        throw new ResourceNotFoundError(`tc39://stages/${value}`);
      }
      return (await searchProposals(db, { stages: [stage] })).map(jsonSummary);
    },
  );
  resource(
    'TC39 proposals by edition',
    'tc39://editions/{edition}',
    'Lightweight current proposal index for one ECMAScript edition.',
    async (value) => {
      const edition = Number(value);
      if (!Number.isInteger(edition)) {
        throw new ResourceNotFoundError(`tc39://editions/${value}`);
      }
      return (await searchProposals(db, { editions: [edition] })).map(
        jsonSummary,
      );
    },
  );
  resource(
    'TC39 proposal',
    'tc39://proposals/{id}',
    'Current proposal metadata and repository README.',
    async (id) => {
      const [proposal] = await getProposals(db, [id], true);
      if (!proposal) throw new ResourceNotFoundError(`tc39://proposals/${id}`);
      return {
        ...jsonSummary(proposal),
        ...('readme' in proposal ? { readme: proposal.readme } : {}),
      };
    },
  );
}

export function createApp(db: Database, host = '127.0.0.1') {
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').filter(Boolean);
  const allowedOrigins =
    process.env.ALLOWED_ORIGINS?.split(',').filter(Boolean);
  if ((host === '0.0.0.0' || host === '::') && !allowedHosts?.length) {
    throw new Error(
      'ALLOWED_HOSTS is required when binding MCP to all interfaces',
    );
  }

  const handler = createMcpHandler(() => createTc39McpServer(db));
  const app = createMcpHonoApp({
    host,
    ...(allowedHosts ? { allowedHosts } : {}),
    ...(allowedOrigins ? { allowedOrigins } : {}),
  });
  app.use('*', logger());
  app.route('/', createApiApp(db));
  app.get('/health', async (context) => {
    const latestSync = await getLatestSync(db);
    return context.json({
      status: 'ok',
      latest_sync: latestSync?.toISOString() ?? null,
    });
  });
  app.all('/mcp', (context: Context) =>
    handler.fetch(context.req.raw, { parsedBody: context.get('parsedBody') }),
  );
  return { app, close: () => handler.close() };
}

export function createDefaultApp() {
  const database = createDatabase();
  return {
    ...createApp(database.db, process.env.HOST ?? '127.0.0.1'),
    database,
  };
}
