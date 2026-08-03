import { ConfigService } from '@nestjs/config';
import { InstagramTokenCipherService } from './instagram-token-cipher.service';

describe('InstagramTokenCipherService', () => {
  const config = {
    getOrThrow: jest.fn(() => 'encryption-key-that-is-longer-than-32-bytes'),
  } as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it('round-trips an access token without storing it in plaintext', () => {
    const service = new InstagramTokenCipherService(config);
    const encrypted = service.encrypt('instagram-access-token');

    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain('instagram-access-token');
    expect(service.decrypt(encrypted)).toBe('instagram-access-token');
  });

  it('rejects a modified encrypted token', () => {
    const service = new InstagramTokenCipherService(config);
    const encrypted = service.encrypt('instagram-access-token');
    const parts = encrypted.split('.');
    parts[2] = `${parts[2][0] === 'a' ? 'b' : 'a'}${parts[2].slice(1)}`;

    expect(() => service.decrypt(parts.join('.'))).toThrow(
      'cannot be decrypted',
    );
  });
});
