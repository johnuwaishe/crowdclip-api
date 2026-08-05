import { Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentSupabaseIdentity } from '../auth/current-supabase-identity.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import type { SupabaseIdentity } from '../auth/types/supabase-identity.type';
import { AccountClaimService } from './account-claim.service';
import { CurrentWorkspaceSession } from './current-workspace-session.decorator';
import type { WorkspaceSession } from './workspace-session.service';
import { WorkspaceSessionGuard } from './workspace-session.guard';

@ApiTags('Account')
@Controller('auth/account')
export class AccountClaimController {
  constructor(private readonly claims: AccountClaimService) {}

  @Post('claim')
  @ApiOperation({
    summary: 'Claim a provisional workspace with a verified Supabase user',
    description:
      'Requires both a Supabase bearer token and the provisional CrowdClip session cookie.',
  })
  @ApiBearerAuth('supabase')
  @ApiCookieAuth('crowdclip-session')
  @UseGuards(SupabaseAuthGuard, WorkspaceSessionGuard)
  claim(
    @CurrentSupabaseIdentity() identity: SupabaseIdentity,
    @CurrentWorkspaceSession() session: WorkspaceSession,
  ) {
    return this.claims.claim(identity, session);
  }
}
