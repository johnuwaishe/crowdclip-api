import { createHash } from 'node:crypto';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';

describe('OriginalFileUploadTokenService', () => {
  it('creates a URL-safe random token and stores only its SHA-256 hash', () => {
    const service = new OriginalFileUploadTokenService();

    const first = service.generate();
    const second = service.generate();

    expect(first.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHash).toBe(
      createHash('sha256').update(first.rawToken, 'utf8').digest('hex'),
    );
    expect(second.rawToken).not.toBe(first.rawToken);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });
});
