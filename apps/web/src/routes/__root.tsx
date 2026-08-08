import { createRootRoute, Navigate } from '@tanstack/react-router';
import { App } from '../App';
import { DEFAULT_PROPOSAL_SEARCH } from '../pages/proposalSearch';

export const Route = createRootRoute({
  component: App,
  notFoundComponent: () => (
    <Navigate to="/" search={DEFAULT_PROPOSAL_SEARCH} replace />
  ),
});
