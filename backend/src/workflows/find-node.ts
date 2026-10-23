import { WorkflowDefinition, WorkflowNode } from '../types/workflow-definition.types';

export function findNode(definition: WorkflowDefinition, nodeId: string): WorkflowNode | undefined {
  return definition.nodes.find((node) => node.id === nodeId);
}
