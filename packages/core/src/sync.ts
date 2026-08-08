import { sql } from 'drizzle-orm';

import type { Database } from './database.js';
import type { ProposalSnapshot, SyncedProposal } from './model.js';
import { proposalChanges, proposals } from './schema.js';

function snapshot(proposal: SyncedProposal): ProposalSnapshot {
  const { id, title, stage, edition, status, repositoryUrl } = proposal;
  return { id, title, stage, edition, status, repositoryUrl };
}

// 变化计算保持为纯函数，避免数据库写入掩盖状态判定错误。
export function detectProposalChanges(
  current: readonly SyncedProposal[],
  incoming: readonly SyncedProposal[],
): Array<typeof proposalChanges.$inferInsert> {
  const byId = new Map(current.map((proposal) => [proposal.id, proposal]));
  const changes: Array<typeof proposalChanges.$inferInsert> = [];

  for (const proposal of incoming) {
    const before = byId.get(proposal.id);
    const after = snapshot(proposal);
    if (!before) {
      changes.push({
        proposalId: proposal.id,
        kind: 'added',
        before: null,
        after,
        occurredAt: proposal.syncedAt,
      });
      continue;
    }
    const beforeSnapshot = snapshot(before);
    if (before.stage !== proposal.stage) {
      changes.push({
        proposalId: proposal.id,
        kind: 'stage_changed',
        before: beforeSnapshot,
        after,
        occurredAt: proposal.syncedAt,
      });
    }
    if (before.status !== proposal.status && proposal.status !== 'active') {
      changes.push({
        proposalId: proposal.id,
        kind: proposal.status,
        before: beforeSnapshot,
        after,
        occurredAt: proposal.syncedAt,
      });
    }
  }

  return changes;
}

// 同步在一个事务和 advisory lock 内完成，避免两个定时任务互相覆盖。
export async function saveProposals(db: Database, incoming: SyncedProposal[]) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('tc39-atlas-sync'))`,
    );
    const current = await tx.select().from(proposals);
    const changes = detectProposalChanges(current, incoming);

    if (incoming.length) {
      await tx
        .insert(proposals)
        .values(
          incoming.map((proposal) => ({
            ...proposal,
            updatedAt: proposal.syncedAt,
          })),
        )
        .onConflictDoUpdate({
          target: proposals.id,
          set: {
            title: sql.raw('excluded."title"'),
            stage: sql.raw('excluded."stage"'),
            edition: sql.raw('excluded."edition"'),
            status: sql.raw('excluded."status"'),
            repositoryUrl: sql.raw('excluded."repository_url"'),
            readme: sql.raw('excluded."readme"'),
            readmeHash: sql.raw('excluded."readme_hash"'),
            syncedAt: sql.raw('excluded."synced_at"'),
            updatedAt: sql.raw('excluded."updated_at"'),
          },
        });
    }
    if (changes.length) await tx.insert(proposalChanges).values(changes);

    return { proposals: incoming.length, changes: changes.length };
  });
}

export async function getLatestSync(db: Database): Promise<Date | null> {
  const [latest] = await db
    .select({ syncedAt: proposals.syncedAt })
    .from(proposals)
    .orderBy(sql`${proposals.syncedAt} desc`)
    .limit(1);
  return latest?.syncedAt ?? null;
}
