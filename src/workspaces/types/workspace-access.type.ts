export type WorkspaceAuthenticationMethod =
  'supabase' | 'instagram_provisional';

export interface WorkspaceAccess {
  workspaceId: string;
  userId: string | null;
  instagramAccountId: string | null;
  authenticationMethod: WorkspaceAuthenticationMethod;
  provisional: boolean;
  expiresAt: Date;
}
