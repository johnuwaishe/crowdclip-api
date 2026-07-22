import { Injectable } from '@nestjs/common';

@Injectable()
export class MetaSignatureService {
  verifySignature({
    rawBody,
    signature,
  }: {
    rawBody: Buffer;
    signature: string;
  }): void {}
}
