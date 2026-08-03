export type WorkspaceMembershipRole = 'owner' | 'admin' | 'member';

export interface WorkspaceMembershipRow {
  workspace_id: string;
  user_id: string;
  role: WorkspaceMembershipRole;
  created_at: Date;
}

export interface WorkspaceMembershipAccessRow extends WorkspaceMembershipRow {
  workspace_name: string;
}
