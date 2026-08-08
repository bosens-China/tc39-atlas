import type { Database } from '@tc39-atlas/core';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp, createTc39McpServer } from './server.js';
import { syncHealth } from './api.js';

const database = {} as unknown as Database;
const { app, close: closeApp } = createApp(database);
const handler = createMcpHandler(() => createTc39McpServer(database));
const client = new Client(
  { name: 'tc39-atlas-test', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } },
);
const transport = new StreamableHTTPClientTransport(
  new URL('http://test.local/mcp'),
  { fetch: (url, init) => handler.fetch(new Request(url, init)) },
);

beforeAll(() => client.connect(transport));
afterAll(async () => {
  await client.close();
  await handler.close();
  await closeApp();
});

describe('MCP HTTP endpoint', () => {
  it('negotiates capabilities with the official client', async () => {
    const tools = await client.listTools();
    const resources = await client.listResourceTemplates();

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'search_proposals',
      'get_proposals',
    ]);
    expect(
      resources.resourceTemplates.map((resource) => resource.uriTemplate),
    ).toContain('tc39://proposals/{id}');
  });

  it.each([
    ['tools/list', 'search_proposals'],
    ['resources/templates/list', 'tc39://proposals/{id}'],
  ])('serves %s', async (method, expected) => {
    const response = await app.request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        host: '127.0.0.1',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(expected);
  });
});

describe('REST API contract', () => {
  it('publishes OpenAPI documentation', async () => {
    const response = await app.request('http://127.0.0.1/api/openapi.json', {
      headers: { host: '127.0.0.1' },
    });
    const document = (await response.json()) as {
      paths?: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(document.paths).toHaveProperty('/api/proposals');
    expect(document.paths).toHaveProperty('/api/changes');
    expect(JSON.stringify(document)).toContain('readme_zh');
  });

  it('rejects invalid query parameters before querying the database', async () => {
    const response = await app.request(
      'http://127.0.0.1/api/proposals?statuses=unknown',
      { headers: { host: '127.0.0.1' } },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'validation_error' });
  });
});

describe('sync health', () => {
  it('requires a successful sync within 48 hours', () => {
    const now = new Date('2026-08-08T00:00:00.000Z');

    expect(syncHealth(null, now).status).toBe('unavailable');
    expect(syncHealth(new Date('2026-08-05T23:59:59.999Z'), now).status).toBe(
      'unavailable',
    );
    expect(syncHealth(new Date('2026-08-07T00:00:00.000Z'), now).status).toBe(
      'ok',
    );
  });
});
