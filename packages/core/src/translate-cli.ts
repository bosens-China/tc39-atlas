import { translationWorkflowOptions } from './cli-options.js';
import { executeTranslationWork } from './translation-workflow.js';

const options = translationWorkflowOptions();
const result = await executeTranslationWork(options);

console.log(
  JSON.stringify({
    event: 'translation_execution_completed',
    proposals: result.dataset.proposals.length,
    revision: result.manifest.revision,
    agentApplied: result.agentApplied,
    translation: result.translation,
    outputDirectory: options.outputDirectory,
  }),
);
