import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

interface VerifySignatureInput {
  rawBody?: Buffer;
  signature?: string;
}

@Injectable()
export class MetaSignatureService {
  constructor(private readonly configService: ConfigService) {}

  verifySignature({ rawBody, signature }: VerifySignatureInput): void {
    const appSecret = this.configService.getOrThrow<string>(
      'INSTAGRAM_APP_SECRET',
    );

    if (!signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!rawBody) {
      throw new BadRequestException('Missing webhook body');
    }

    // To validate the payload:
    // Generate a SHA256 signature using the payload and your app’s App Secret.
    // Compare your signature to the signature in the X-Hub-Signature-256 header (everything after sha256=).
    // If the signatures match, the payload is genuine.

    const expectedSignature = `sha256=${createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;

    const suppliedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
