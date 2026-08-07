import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

export function createDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = postgres(connectionString, { max: 10 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

export type Database = ReturnType<typeof createDatabase>['db'];
