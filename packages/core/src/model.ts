export const proposalStages = [0, 1, 2, 2.7, 3, 4] as const;
export const proposalStatuses = [
  'active',
  'finished',
  'inactive',
  'withdrawn',
] as const;
export const proposalChangeKinds = [
  'added',
  'stage_changed',
  'finished',
  'inactive',
  'withdrawn',
] as const;

export type ProposalStage = (typeof proposalStages)[number];
export type ProposalStatus = (typeof proposalStatuses)[number];
export type ProposalChangeKind = (typeof proposalChangeKinds)[number];
export type KeywordMode = 'all' | 'any';

export interface ProposalSnapshot {
  id: string;
  title: string;
  stage: ProposalStage | null;
  edition: number | null;
  status: ProposalStatus;
  repositoryUrl: string;
}

export interface ProposalSummary extends ProposalSnapshot {
  syncedAt: Date;
}

export interface ProposalDetail extends ProposalSummary {
  readme: string;
}

export interface ProposalChange {
  id: number;
  proposalId: string;
  kind: ProposalChangeKind;
  before: ProposalSnapshot | null;
  after: ProposalSnapshot;
  occurredAt: Date;
}

export interface ProposalFilter {
  stages?: readonly ProposalStage[];
  editions?: readonly number[];
  statuses?: readonly ProposalStatus[];
  keywords?: readonly string[];
  keywordMode?: KeywordMode;
  limit?: number;
  offset?: number;
}

export interface SyncedProposal extends ProposalSnapshot {
  readme: string;
  readmeHash: string;
  syncedAt: Date;
}
