/** BullMQ job counts of one queue, keyed by job state (waiting, active, delayed, failed, ...). */
export type QueueStats = {
  queue: string;
  counts: Record<string, number>;
};
