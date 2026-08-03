import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { MetaSignatureService } from './meta-signature.service';

describe('MetaSignatureService', () => {
  const appSecret = 'crowdclip-parent-app-secret';
  const getOrThrow = jest.fn(() => appSecret);
  const config = { getOrThrow } as unknown as ConfigService;

  beforeEach(() => jest.clearAllMocks());

  it('validates webhook signatures with the Instagram app secret', () => {
    const rawBody = Buffer.from('{"object":"instagram"}');
    const signature = `sha256=${createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;
    const service = new MetaSignatureService(config);

    expect(() => service.verifySignature({ rawBody, signature })).not.toThrow();
    expect(getOrThrow).toHaveBeenCalledWith('INSTAGRAM_APP_SECRET');
  });

  it('rejects a signature made with a different secret', () => {
    const rawBody = Buffer.from('{"object":"instagram"}');
    const signature = `sha256=${createHmac('sha256', 'wrong-secret')
      .update(rawBody)
      .digest('hex')}`;
    const service = new MetaSignatureService(config);

    expect(() => service.verifySignature({ rawBody, signature })).toThrow(
      UnauthorizedException,
    );
  });
});
