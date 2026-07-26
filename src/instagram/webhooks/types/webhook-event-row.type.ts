export type WebhookEventStatus =
  'pending' | 'processing' | 'processed' | 'failed' | 'ignored';

export interface WebhookEventRow {
  id: string;
  external_event_id: string;
  event_type: string;
  sender_id: string;
  recipient_id: string;
  payload: Record<string, unknown>;
  status: WebhookEventStatus;
  attempt_count: number;
  last_error: string | null;
  occurred_at: Date | null;
  received_at: Date;
  processing_started_at: Date | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
