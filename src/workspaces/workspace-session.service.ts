import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WorkspaceSession {
  instagramAccountId: string;
  workspaceId: string;
  expiresAt: Date;
}

@Injectable()
export class WorkspaceSessionService {
  readonly cookieName = 'crowdclip_session';
  readonly ttlSeconds = 30 * 24 * 60 * 60;

  constructor(private readonly configService: ConfigService) {}

  issue(instagramAccountId: string, workspaceId: string): string {
    const expiresAt = Date.now() + this.ttlSeconds * 1_000;
    const payload = `${instagramAccountId}.${workspaceId}.${expiresAt.toString(36)}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(value: string): WorkspaceSession | null {
    if (value.length > 1_024) return null;
    const parts = value.split('.');
    if (parts.length !== 4) return null;
    const [instagramAccountId, workspaceId, encodedExpiry, signature] = parts;
    if (!this.isUuid(instagramAccountId) || !this.isUuid(workspaceId)) {
      return null;
    }
    const expiresAtMs = Number.parseInt(encodedExpiry, 36);
    if (
      !Number.isSafeInteger(expiresAtMs) ||
      expiresAtMs <= Date.now() ||
      expiresAtMs.toString(36) !== encodedExpiry
    ) {
      return null;
    }
    const payload = `${instagramAccountId}.${workspaceId}.${encodedExpiry}`;
    const expected = this.sign(payload);
    if (!this.safeEqual(signature, expected)) return null;
    return {
      instagramAccountId,
      workspaceId,
      expiresAt: new Date(expiresAtMs),
    };
  }

  private sign(value: string): string {
    const secret = this.configService.getOrThrow<string>(
      'CROWDCLIP_SESSION_SECRET',
    );
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error(
        'CROWDCLIP_SESSION_SECRET must contain at least 32 bytes',
      );
    }
    return createHmac('sha256', secret)
      .update(value, 'utf8')
      .digest('base64url');
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
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }
}
