import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'node:crypto';

export interface OriginalFileUploadToken {
  requestId: string;
  expiresAt: Date;
  rawToken: string;
  tokenHash: string;
}

@Injectable()
export class OriginalFileUploadTokenService {
  constructor(private readonly configService: ConfigService) {}

  issue(ttlSeconds: number): OriginalFileUploadToken {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('Original-file upload token TTL must be positive');
    }

    const requestId = randomUUID();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);

    return this.create(requestId, expiresAt);
  }

  recreate(requestId: string, expiresAt: Date): OriginalFileUploadToken {
    return this.create(requestId, expiresAt);
  }

  private create(requestId: string, expiresAt: Date): OriginalFileUploadToken {
    const secret = this.getSecret();
    const tokenPayload = `${requestId}.${expiresAt.getTime().toString(36)}`;
    const signature = createHmac('sha256', secret)
      .update(tokenPayload, 'utf8')
      .digest('base64url');
    const rawToken = `${tokenPayload}.${signature}`;
    const tokenHash = createHash('sha256')
      .update(rawToken, 'utf8')
      .digest('hex');

    return { requestId, expiresAt, rawToken, tokenHash };
  }

  private getSecret(): string {
    const secret = this.configService.getOrThrow<string>(
      'ORIGINAL_FILE_UPLOAD_TOKEN_SECRET',
    );

    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error(
        'ORIGINAL_FILE_UPLOAD_TOKEN_SECRET must contain at least 32 bytes',
      );
    }

    return secret;
  }
}
