export type ClipMediaChoice =
  'undecided' | 'use_instagram_story' | 'request_fan_original';

export interface ClipRow {
  id: string;
  fan_id: string;
  source_webhook_event_id: string;
  instagram_account_id: string;
  show_id: string | null;
  media_choice: ClipMediaChoice;
  mentioned_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
