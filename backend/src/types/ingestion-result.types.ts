/** 202 body of identify/track. eventId is absent only if a concurrent request stored the event. */
export type IngestionResult = {
  accepted: true;
  eventId?: string;
};
