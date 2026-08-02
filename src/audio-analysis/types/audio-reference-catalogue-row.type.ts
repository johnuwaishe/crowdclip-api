export type AudioReferenceCatalogueStatus = 'active' | 'archived';

export interface AudioReferenceCatalogueRow {
  id: string;
  instagram_recipient_id: string;
  name: string;
  status: AudioReferenceCatalogueStatus;
  created_at: Date;
  updated_at: Date;
}
