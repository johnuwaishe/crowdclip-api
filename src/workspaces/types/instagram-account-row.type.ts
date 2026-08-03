export type InstagramAccountConnectionStatus =
  'unverified' | 'connected' | 'disconnected';

export interface InstagramAccountRow {
  id: string;
  workspace_id: string;
  instagram_recipient_id: string;
  username: string | null;
  account_type: 'BUSINESS' | 'CREATOR' | null;
  connection_status: InstagramAccountConnectionStatus;
  access_token_encrypted: string | null;
  token_expires_at: Date | null;
  connected_at: Date | null;
  disconnected_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface InstagramAccountRoutingRow {
  instagram_account_id: string;
  workspace_id: string;
  active_show_id: string | null;
}
