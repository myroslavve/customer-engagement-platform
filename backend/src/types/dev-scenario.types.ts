import { WorkflowDefinition } from './workflow-definition.types';

/** A built-in workflow that exercises one part of the engine; triggered by `dev.<name>`. */
export type DevScenario = {
  name: string;
  description: string;
  /** How to drive the run further (events to send, fast-forward, inputs that change the path). */
  hint: string;
  definition(templateId: string): Omit<WorkflowDefinition, 'trigger'>;
};

export type DevScenarioInfo = Pick<DevScenario, 'name' | 'description' | 'hint'>;
