import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

@Injectable()
export class InstagramOAuthStateService {
  readonly cookieName = 'crowdclip_instagram_oauth_state';
  readonly ttlSeconds = 10 * 60;

  constructor(private readonly configService: ConfigService) {}

  issue(): string {
    const nonce = randomBytes(24).toString('base64url');
    const expiresAt = (Date.now() + this.ttlSeconds * 1_000).toString(36);
    const payload = `${nonce}.${expiresAt}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(value: string): boolean {
    if (value.length > 512) return false;
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    const expiresAt = Number.parseInt(parts[1], 36);
    if (
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Date.now() ||
      expiresAt.toString(36) !== parts[1]
    ) {
      return false;
    }
    const expected = this.sign(`${parts[0]}.${parts[1]}`);
    const actualBuffer = Buffer.from(parts[2], 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private sign(value: string): string {
    const secret = this.configService.getOrThrow<string>(
      'INSTAGRAM_OAUTH_STATE_SECRET',
    );
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error(
        'INSTAGRAM_OAUTH_STATE_SECRET must contain at least 32 bytes',
      );
    }
    return createHmac('sha256', secret)
      .update(value, 'utf8')
      .digest('base64url');
  }
}
