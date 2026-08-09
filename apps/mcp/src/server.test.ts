import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatasetStore } from './cache.js';
import { createTc39McpServer } from './server.js';

const dataset = {
  schemaVersion: 3 as const,
  generatedAt: '2026-08-08T00:00:00.000Z',
  proposals: [
    {
      id: 'proposal-a',
      title: 'Proposal A',
      titleZh: '提案 A',
      stage: 3 as const,
      edition: null,
      status: 'active' as const,
      repositoryUrl: 'https://github.com/tc39/proposal-a',
      syncedAt: '2026-08-08T00:00:00.000Z',
      readme: '# Proposal A',
      readmeHash: 'a'.repeat(64),
      readmeZh: '# 提案 A',
      quickReview: {
        en: 'Proposal A adds an example capability.',
        zh: '提案 A 增加了一项示例能力。',
      },
      translation: {
        sourceHash: 'a'.repeat(64),
        policyVersion: '2',
        model: 'test',
        translatedAt: '2026-08-08T00:00:00.000Z',
      },
    },
  ],
  changes: [],
};
const store = new DatasetStore(dataset, 'a'.repeat(64));
const server = createTc39McpServer(store);
const client = new Client({ name: 'tc39-atlas-test', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

beforeAll(async () => {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe('local MCP contract', () => {
  it('publishes the two read-only tools and proposal resources', async () => {
    const tools = await client.listTools();
    const resources = await client.listResourceTemplates();

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'search_proposals',
      'get_proposals',
    ]);
    expect(tools.tools[0]?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(
      resources.resourceTemplates.map((resource) => resource.uriTemplate),
    ).toContain('tc39://proposals/{id}');
  });

  it('returns structured search and detail results from the cache', async () => {
    const search = await client.callTool({
      name: 'search_proposals',
      arguments: { stages: [3], keywords: ['proposal'] },
    });
    const detail = await client.callTool({
      name: 'get_proposals',
      arguments: { ids: ['proposal-a', 'missing'], include_readme: true },
    });

    expect(search.structuredContent).toMatchObject({
      count: 1,
      proposals: [{ id: 'proposal-a', title_zh: '提案 A' }],
    });
    expect(detail.structuredContent).toMatchObject({
      proposals: [
        {
          id: 'proposal-a',
          readme_zh: '# 提案 A',
          quick_review: { en: 'Proposal A adds an example capability.' },
        },
      ],
      missing_ids: ['missing'],
    });
  });
});
