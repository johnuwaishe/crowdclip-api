import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';

describe('OriginalFileUploadTokenService', () => {
  const secret = 's'.repeat(32);
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(secret),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_753_806_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('issues a signed token and stores only its SHA-256 hash', () => {
    const service = new OriginalFileUploadTokenService(configService);

    const first = service.issue(604_800);
    const second = service.issue(604_800);

    expect(first.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.rawToken).toMatch(
      /^[0-9a-f-]{36}\.[a-z0-9]+\.[A-Za-z0-9_-]{43}$/,
    );
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.tokenHash).toBe(
      createHash('sha256').update(first.rawToken, 'utf8').digest('hex'),
    );
    expect(second.rawToken).not.toBe(first.rawToken);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it('recreates the same token from the persisted request fields', () => {
    const service = new OriginalFileUploadTokenService(configService);
    const issued = service.issue(604_800);

    expect(service.recreate(issued.requestId, issued.expiresAt)).toEqual(
      issued,
    );
  });

  it('rejects a secret shorter than 32 bytes', () => {
    const shortConfig = {
      getOrThrow: jest.fn().mockReturnValue('too-short'),
    } as unknown as ConfigService;
    const service = new OriginalFileUploadTokenService(shortConfig);

    expect(() => service.issue(604_800)).toThrow(
      'ORIGINAL_FILE_UPLOAD_TOKEN_SECRET must contain at least 32 bytes',
    );
  });
});
