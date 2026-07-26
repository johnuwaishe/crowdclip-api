import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { InstagramWebhookService } from './instagram-webhook.service';
import { MetaSignatureService } from '../meta-signature.service';
import type { Request } from 'express';
import type { RawBodyRequest } from 'body-parser';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks/instagram')
export class InstagramWebhookController {
  constructor(
    private readonly webhookService: InstagramWebhookService,
    private readonly metaSignatureService: MetaSignatureService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.verify_token') suppliedToken: string,
  ): string {
    const expectedToken = this.configService.getOrThrow(
      'INSTAGRAM_WEBHOOK_VERIFY_TOKEN',
    );

    if (
      mode !== 'subscribe' ||
      !suppliedToken ||
      suppliedToken !== expectedToken ||
      !challenge
    ) {
      throw new ForbiddenException('Webhook verification failed');
    }
    return challenge;
  }

  @Post()
  async receiveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: unknown,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Missing signature header');
    }

    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body');
    }

    this.metaSignatureService.verifySignature({
      rawBody: req.rawBody,
      signature,
    });

    await this.webhookService.handleWebhookPayload(payload);

    return { received: true };
  }
}
