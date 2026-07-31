import {
  ExecutionContext,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { OriginalFileUploadTokenGuard } from './original-file-upload-token.guard';
import { OriginalFileUploadTokenService } from './original-file-upload-token.service';

describe('OriginalFileUploadTokenGuard', () => {
  const verify = jest.fn();
  const tokenService = {
    verify,
  } as unknown as OriginalFileUploadTokenService;
  const now = new Date('2026-07-30T17:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const contextFor = (token?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ params: { token } }),
      }),
    }) as unknown as ExecutionContext;

  it('allows a valid unexpired token before multipart parsing', () => {
    verify.mockReturnValueOnce({
      expiresAt: new Date(now.getTime() + 60_000),
    });
    const guard = new OriginalFileUploadTokenGuard(tokenService);

    expect(guard.canActivate(contextFor('signed-token'))).toBe(true);
    expect(verify).toHaveBeenCalledWith('signed-token');
  });

  it('hides a malformed token', () => {
    verify.mockReturnValueOnce(null);
    const guard = new OriginalFileUploadTokenGuard(tokenService);

    expect(() => guard.canActivate(contextFor('invalid'))).toThrow(
      NotFoundException,
    );
  });

  it('rejects an expired signed token', () => {
    verify.mockReturnValueOnce({
      expiresAt: new Date(now.getTime() - 1),
    });
    const guard = new OriginalFileUploadTokenGuard(tokenService);

    expect(() => guard.canActivate(contextFor('expired-token'))).toThrow(
      GoneException,
    );
  });
});
