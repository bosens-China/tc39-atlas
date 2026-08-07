import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDatabase } from './database.js';

const database = createDatabase();

try {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
  console.log('Database migrations applied');
} finally {
  await database.close();
}
