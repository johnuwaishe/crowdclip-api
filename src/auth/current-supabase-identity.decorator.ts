import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseIdentity } from './types/supabase-identity.type';

export interface SupabaseIdentityRequest extends Request {
  supabaseIdentity?: SupabaseIdentity;
}

export const CurrentSupabaseIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SupabaseIdentity => {
    const request = context
      .switchToHttp()
      .getRequest<SupabaseIdentityRequest>();
    if (!request.supabaseIdentity) {
      throw new Error('Supabase identity was not attached to the request');
    }
    return request.supabaseIdentity;
  },
);
