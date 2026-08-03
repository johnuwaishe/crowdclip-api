import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseIdentityRequest } from './current-supabase-identity.decorator';
import { SupabaseIdentityService } from './supabase-identity.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly identities: SupabaseIdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<SupabaseIdentityRequest>();
    const accessToken = this.readBearerToken(request.headers.authorization);
    request.supabaseIdentity = await this.identities.verify(accessToken);
    return true;
  }

  private readBearerToken(value: string | undefined): string {
    if (!value) throw this.required();
    const match = /^Bearer ([^\s]+)$/.exec(value);
    if (!match) throw this.required();
    return match[1];
  }

  private required(): UnauthorizedException {
    return new UnauthorizedException('Supabase Bearer token required');
  }
}
