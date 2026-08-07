import { createDatabase } from './database.js';
import { fetchTc39Proposals } from './source.js';
import { saveProposals } from './sync.js';

const database = createDatabase();

try {
  const proposals = await fetchTc39Proposals();
  const result = await saveProposals(database.db, proposals);
  console.log(
    `Synced ${result.proposals} proposals, recorded ${result.changes} changes`,
  );
} finally {
  await database.close();
}
