export type OriginalFileRequestStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'fulfilled'
  | 'failed'
  | 'expired'
  | 'cancelled';

export interface OriginalFileRequestRow {
  id: string;
  clip_id: string;
  status: OriginalFileRequestStatus;
  upload_token_hash: string;
  expires_at: Date;
  instagram_message_id: string | null;
  attempt_count: number;
  last_error: string | null;
  sending_started_at: Date | null;
  sent_at: Date | null;
  fulfilled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
