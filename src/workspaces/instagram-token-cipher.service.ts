import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

@Injectable()
export class InstagramTokenCipherService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(value: string): string {
    if (!value) throw new Error('Instagram access token cannot be empty');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(value: string): string {
    const parts = value.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Stored Instagram access token is invalid');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        Buffer.from(parts[1], 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(parts[3], 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new Error('Stored Instagram access token cannot be decrypted', {
        cause: error,
      });
    }
  }

  private key(): Buffer {
    const secret = this.configService.getOrThrow<string>(
      'INSTAGRAM_TOKEN_ENCRYPTION_KEY',
    );
    if (Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error(
        'INSTAGRAM_TOKEN_ENCRYPTION_KEY must contain at least 32 bytes',
      );
    }
    return createHash('sha256').update(secret, 'utf8').digest();
  }
}
