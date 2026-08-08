import { createDatabase } from './database.js';
import { fetchTc39Proposals } from './source.js';
import { saveProposals } from './sync.js';
import { translatePendingReadmesFromEnv } from './translation.js';

const database = createDatabase();

try {
  const proposals = await fetchTc39Proposals();
  const result = await saveProposals(database.db, proposals);
  console.log(
    `Synced ${result.proposals} proposals, recorded ${result.changes} changes`,
  );
  try {
    const translation = await translatePendingReadmesFromEnv(database.db);
    console.log(
      translation.skipped
        ? 'Translation skipped: no API key configured'
        : `Translated ${translation.translated}/${translation.pending} proposals, ${translation.failed} failed, ${translation.stale} became stale`,
    );
  } catch (error: unknown) {
    console.error('README translation failed', error);
  }
} finally {
  await database.close();
}
