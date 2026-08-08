import {
  proposalStageSchema,
  proposalStages,
  proposalStatusSchema,
  type ProposalSnapshot,
  type ProposalStage,
  type ProposalSummary,
} from '@tc39-atlas/core/model';
import { getProposals, searchProposals } from '@tc39-atlas/core/queries';
import {
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import type { DatasetStore } from './cache.js';

const jsonSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  stage: proposalStageSchema.nullable(),
  edition: z.number().int().nullable(),
  status: proposalStatusSchema,
  repository_url: z.string().url(),
});
const jsonSummarySchema = jsonSnapshotSchema.extend({
  title_zh: z.string().nullable(),
  data_updated_at: z.string().datetime(),
});
const jsonDetailSchema = jsonSummarySchema.extend({
  readme: z.string(),
  readme_zh: z.string().nullable(),
});

function jsonContent(value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }];
}

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

function jsonSummary(proposal: ProposalSummary) {
  return {
    ...jsonSnapshot(proposal),
    title_zh: proposal.titleZh,
    data_updated_at: proposal.syncedAt,
  };
}

// 工具调用只读取内存快照；网络更新在启动阶段独立进行。
export function createTc39McpServer(store: DatasetStore): McpServer {
  const server = new McpServer({ name: 'tc39-atlas', version: '1.0.0' });

  server.registerTool(
    'search_proposals',
    {
      title: 'Search TC39 proposals',
      description:
        'Search the locally cached current TC39 proposal dataset by stage, ECMAScript edition, status, and keywords. Keywords cover ID, English or Chinese titles, and English or Chinese README content.',
      inputSchema: z.object({
        stages: z
          .array(proposalStageSchema)
          .optional()
          .describe('TC39 stages to include.'),
        editions: z
          .array(z.number().int().min(2015))
          .optional()
          .describe('Published ECMAScript edition years to include.'),
        statuses: z
          .array(proposalStatusSchema)
          .optional()
          .describe('Proposal statuses to include.'),
        keywords: z
          .array(z.string().min(1))
          .optional()
          .describe(
            'Case-insensitive terms to find in IDs, titles, and READMEs.',
          ),
        keyword_mode: z
          .enum(['all', 'any'])
          .default('all')
          .describe('Whether all terms or any term must match.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(500)
          .describe('Maximum proposals to return, capped at 500.'),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe('Number of matching proposals to skip.'),
      }),
      outputSchema: z.object({
        proposals: z.array(jsonSummarySchema),
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
      const result = searchProposals(store.dataset.proposals, {
        ...(input.stages ? { stages: input.stages } : {}),
        ...(input.editions ? { editions: input.editions } : {}),
        ...(input.statuses ? { statuses: input.statuses } : {}),
        ...(input.keywords ? { keywords: input.keywords } : {}),
        keywordMode: input.keyword_mode,
        limit: input.limit,
        offset: input.offset,
      });
      const output = {
        proposals: result.proposals.map(jsonSummary),
        count: result.total,
      };
      return { content: jsonContent(output), structuredContent: output };
    },
  );

  server.registerTool(
    'get_proposals',
    {
      title: 'Get TC39 proposals',
      description:
        'Get one or more current TC39 proposals by stable ID from the local cache. Use search_proposals first when the IDs are unknown.',
      inputSchema: z.object({
        ids: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe('Stable proposal IDs to return, in requested order.'),
        include_readme: z
          .boolean()
          .default(true)
          .describe(
            'Include English README and available Chinese translation.',
          ),
      }),
      outputSchema: z.object({
        proposals: z.array(z.union([jsonSummarySchema, jsonDetailSchema])),
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
      const rows = getProposals(store.dataset.proposals, ids, include_readme);
      const proposals = rows.map((proposal) => ({
        ...jsonSummary(proposal),
        ...('readme' in proposal
          ? { readme: proposal.readme, readme_zh: proposal.readmeZh }
          : {}),
      }));
      const found = new Set(proposals.map((proposal) => proposal.id));
      const output = {
        proposals,
        missing_ids: ids.filter((id) => !found.has(id)),
      };
      return { content: jsonContent(output), structuredContent: output };
    },
  );

  registerResources(server, store);
  return server;
}

function registerResources(server: McpServer, store: DatasetStore): void {
  const resource = (
    name: string,
    template: string,
    description: string,
    load: (value: string) => unknown,
  ) =>
    server.registerResource(
      name,
      new ResourceTemplate(template, { list: undefined }),
      { title: name, description, mimeType: 'application/json' },
      async (uri, variables) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              load(String(Object.values(variables)[0] ?? '')),
              null,
              2,
            ),
          },
        ],
        ttlMs: 300_000,
        cacheScope: 'public' as const,
      }),
    );

  resource(
    'TC39 proposals by stage',
    'tc39://stages/{stage}',
    'Lightweight current proposal index for one TC39 stage.',
    (value) => {
      const stage = Number(value) as ProposalStage;
      if (!proposalStages.includes(stage)) {
        throw new ResourceNotFoundError(`tc39://stages/${value}`);
      }
      return searchProposals(store.dataset.proposals, {
        stages: [stage],
      }).proposals.map(jsonSummary);
    },
  );
  resource(
    'TC39 proposals by edition',
    'tc39://editions/{edition}',
    'Lightweight current proposal index for one ECMAScript edition.',
    (value) => {
      const edition = Number(value);
      if (!Number.isInteger(edition)) {
        throw new ResourceNotFoundError(`tc39://editions/${value}`);
      }
      return searchProposals(store.dataset.proposals, {
        editions: [edition],
      }).proposals.map(jsonSummary);
    },
  );
  resource(
    'TC39 proposal',
    'tc39://proposals/{id}',
    'Current proposal metadata and repository README.',
    (id) => {
      const [proposal] = getProposals(store.dataset.proposals, [id], true);
      if (!proposal) throw new ResourceNotFoundError(`tc39://proposals/${id}`);
      return {
        ...jsonSummary(proposal),
        ...('readme' in proposal
          ? { readme: proposal.readme, readme_zh: proposal.readmeZh }
          : {}),
      };
    },
  );
}
