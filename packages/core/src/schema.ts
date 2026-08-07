import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import type { ProposalSnapshot, ProposalStage } from './model.js';

export const proposalStatus = pgEnum('proposal_status', [
  'active',
  'finished',
  'inactive',
  'withdrawn',
]);
export const proposalChangeKind = pgEnum('proposal_change_kind', [
  'added',
  'stage_changed',
  'finished',
  'inactive',
  'withdrawn',
]);

export const proposals = pgTable(
  'proposals',
  {
    id: text().primaryKey(),
    title: text().notNull(),
    stage: numeric({
      precision: 2,
      scale: 1,
      mode: 'number',
    }).$type<ProposalStage>(),
    edition: integer(),
    status: proposalStatus().notNull(),
    repositoryUrl: text('repository_url').notNull(),
    readme: text().notNull(),
    readmeHash: text('readme_hash').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('proposals_stage_idx').on(table.stage),
    index('proposals_edition_idx').on(table.edition),
    index('proposals_status_idx').on(table.status),
  ],
);

export const proposalChanges = pgTable(
  'proposal_changes',
  {
    id: serial().primaryKey(),
    proposalId: text('proposal_id')
      .notNull()
      .references(() => proposals.id, { onDelete: 'cascade' }),
    kind: proposalChangeKind().notNull(),
    before: jsonb().$type<ProposalSnapshot | null>(),
    after: jsonb().$type<ProposalSnapshot>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('proposal_changes_proposal_idx').on(table.proposalId),
    index('proposal_changes_occurred_idx').on(table.occurredAt),
  ],
);
