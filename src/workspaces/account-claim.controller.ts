import { Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentSupabaseIdentity } from '../auth/current-supabase-identity.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { SupabaseIdentity } from '../auth/types/supabase-identity.type';
import { AccountClaimService } from './account-claim.service';
import { CurrentWorkspaceSession } from './current-workspace-session.decorator';
import type { WorkspaceSession } from './workspace-session.service';
import { WorkspaceSessionGuard } from './workspace-session.guard';

@Controller('auth/account')
export class AccountClaimController {
  constructor(private readonly claims: AccountClaimService) {}

  @Post('claim')
  @UseGuards(SupabaseAuthGuard, WorkspaceSessionGuard)
  claim(
    @CurrentSupabaseIdentity() identity: SupabaseIdentity,
    @CurrentWorkspaceSession() session: WorkspaceSession,
  ) {
    return this.claims.claim(identity, session);
  }
}
