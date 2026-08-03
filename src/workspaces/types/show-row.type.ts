export type ShowStatus = 'draft' | 'active' | 'ended';

export interface ShowRow {
  id: string;
  workspace_id: string;
  instagram_account_id: string;
  name: string;
  starts_at: Date | null;
  venue_name: string | null;
  city: string | null;
  status: ShowStatus;
  ended_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ShowWithCatalogueRow extends ShowRow {
  catalogue_id: string;
  catalogue_name: string;
}
