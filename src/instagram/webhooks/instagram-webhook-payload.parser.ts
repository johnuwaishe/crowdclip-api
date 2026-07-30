import {
  InstagramAttachment,
  InstagramMessage,
  InstagramMessagingEvent,
  InstagramReaction,
  InstagramWebhookParticipant,
} from './types/Instagram-webhook.type';

export class InvalidInstagramWebhookPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidInstagramWebhookPayloadError.name;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isParticipant(value: unknown): value is InstagramWebhookParticipant {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.trim().length > 0
  );
}

function isAttachment(value: unknown): value is InstagramAttachment {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.payload === undefined) {
    return true;
  }

  return isRecord(value.payload) && isOptionalString(value.payload.url);
}

function isMessage(value: unknown): value is InstagramMessage {
  if (
    !isRecord(value) ||
    typeof value.mid !== 'string' ||
    value.mid.trim().length === 0 ||
    !isOptionalString(value.text)
  ) {
    return false;
  }

  return (
    value.attachments === undefined ||
    (Array.isArray(value.attachments) && value.attachments.every(isAttachment))
  );
}

function isReaction(value: unknown): value is InstagramReaction {
  return (
    isRecord(value) &&
    isOptionalString(value.mid) &&
    isOptionalString(value.action) &&
    isOptionalString(value.reaction)
  );
}

function isMessagingEvent(value: unknown): value is InstagramMessagingEvent {
  return (
    isRecord(value) &&
    isParticipant(value.sender) &&
    isParticipant(value.recipient) &&
    typeof value.timestamp === 'number' &&
    Number.isFinite(value.timestamp) &&
    (value.message === undefined || isMessage(value.message)) &&
    (value.reaction === undefined || isReaction(value.reaction))
  );
}

export function normalizeInstagramMessagingEvents(
  payload: unknown,
): InstagramMessagingEvent[] {
  if (
    !isRecord(payload) ||
    typeof payload.object !== 'string' ||
    !Array.isArray(payload.entry)
  ) {
    throw new InvalidInstagramWebhookPayloadError(
      'Instagram webhook payload must contain an object and entry array',
    );
  }

  const events: InstagramMessagingEvent[] = [];

  for (const entry of payload.entry) {
    if (!isRecord(entry)) {
      throw new InvalidInstagramWebhookPayloadError(
        'Instagram webhook entry must be an object',
      );
    }

    if (entry.messaging === undefined) {
      continue;
    }

    if (!Array.isArray(entry.messaging)) {
      throw new InvalidInstagramWebhookPayloadError(
        'Instagram webhook entry messaging must be an array',
      );
    }

    for (const event of entry.messaging) {
      if (!isMessagingEvent(event)) {
        throw new InvalidInstagramWebhookPayloadError(
          'Instagram webhook contains an invalid messaging event',
        );
      }

      events.push(event);
    }
  }

  return events;
}
