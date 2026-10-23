/** Workflow node kinds; values are stored in definition JSON. */
export enum NodeType {
  Branch = 'branch',
  Delay = 'delay',
  WaitForEvent = 'wait_for_event',
  SendEmail = 'send_email',
  Exit = 'exit',
}
