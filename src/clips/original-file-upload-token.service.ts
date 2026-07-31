import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

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

  verify(rawToken: string): OriginalFileUploadToken | null {
    if (rawToken.length > 512) {
      return null;
    }

    const parts = rawToken.split('.');

    if (
      parts.length !== 3 ||
      !this.isUuid(parts[0]) ||
      !/^[a-z0-9]+$/.test(parts[1])
    ) {
      return null;
    }

    const expiresAtMs = Number.parseInt(parts[1], 36);

    if (
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= 0 ||
      expiresAtMs.toString(36) !== parts[1]
    ) {
      return null;
    }

    const expected = this.create(parts[0], new Date(expiresAtMs));

    if (!this.safeEqual(rawToken, expected.rawToken)) {
      return null;
    }

    return expected;
  }

  matchesHash(tokenHash: string, storedHash: string): boolean {
    return this.safeEqual(tokenHash, storedHash);
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

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
