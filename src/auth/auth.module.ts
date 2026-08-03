import { Global, Module } from '@nestjs/common';
import { SupabaseAuthClaimsClient } from './supabase-auth-claims.client';
import { SupabaseAuthConfig } from './supabase-auth.config';
import { SupabaseIdentityService } from './supabase-identity.service';
import { UserProfilesRepository } from './user-profiles.repository';
import { WorkspaceMembershipsRepository } from './workspace-memberships.repository';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Global()
@Module({
  providers: [
    SupabaseAuthConfig,
    SupabaseAuthClaimsClient,
    SupabaseIdentityService,
    UserProfilesRepository,
    WorkspaceMembershipsRepository,
    SupabaseAuthGuard,
  ],
  exports: [
    SupabaseAuthConfig,
    SupabaseIdentityService,
    UserProfilesRepository,
    WorkspaceMembershipsRepository,
    SupabaseAuthGuard,
  ],
})
export class AuthModule {}
