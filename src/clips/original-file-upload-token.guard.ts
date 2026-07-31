import {
  CanActivate,
  ExecutionContext,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';

interface OriginalFileUploadRequest extends Request {
  params: {
    token?: string;
  };
}

@Injectable()
export class OriginalFileUploadTokenGuard implements CanActivate {
  constructor(private readonly tokenService: OriginalFileUploadTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<OriginalFileUploadRequest>();
    const rawToken = request.params.token;
    const token = rawToken ? this.tokenService.verify(rawToken) : null;

    if (!token) {
      throw new NotFoundException('Original-file upload request not found');
    }

    if (token.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Original-file upload link has expired');
    }

    return true;
  }
}
