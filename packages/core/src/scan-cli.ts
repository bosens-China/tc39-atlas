import { join } from 'node:path';

import { translationWorkflowOptions } from './cli-options.js';
import {
  scanTranslationWork,
  TRANSLATION_PLAN_FILE,
} from './translation-workflow.js';

const options = translationWorkflowOptions();
const result = await scanTranslationWork(options);

console.log(
  JSON.stringify({
    event: 'translation_scan_completed',
    proposals: result.dataset.proposals.length,
    pending: result.plan.items.length,
    planPath: join(options.workDirectory, TRANSLATION_PLAN_FILE),
    items: result.plan.items.map((item) => ({
      proposalId: item.proposalId,
      repositoryUrl: item.repositoryUrl,
      reasons: item.reasons,
    })),
  }),
);
