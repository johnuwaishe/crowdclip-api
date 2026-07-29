import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export interface OriginalFileUploadToken {
  rawToken: string;
  tokenHash: string;
}

@Injectable()
export class OriginalFileUploadTokenService {
  generate(): OriginalFileUploadToken {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256')
      .update(rawToken, 'utf8')
      .digest('hex');

    return { rawToken, tokenHash };
  }
}
