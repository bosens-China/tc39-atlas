import { createFileRoute } from '@tanstack/react-router';
import { ProposalsPage } from '../pages/ProposalsPage';
import { validateProposalSearch } from '../pages/proposalSearch';

export const Route = createFileRoute('/')({
  validateSearch: validateProposalSearch,
  component: ProposalsPage,
});
