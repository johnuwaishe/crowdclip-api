import { Logger } from '@nestjs/common';
import { InstagramWebhookService } from './instagram-webhook.service';
import { WebhookEventsRepository } from './webhook-events.repository';

describe('InstagramWebhookService', () => {
  const createIfNotExists = jest.fn();
  const repository = {
    createIfNotExists,
  } as unknown as WebhookEventsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      'story_mention',
      'pending',
      [
        {
          type: 'story_mention',
          payload: { url: 'https://cdn.example.test/story' },
        },
      ],
    ],
    ['message', 'ignored', undefined],
  ] as const)(
    'persists a %s event with %s status',
    async (eventType, initialStatus, attachments) => {
      createIfNotExists.mockResolvedValueOnce({ id: 'event-id' });
      const service = new InstagramWebhookService(repository);
      const message = {
        mid: `${eventType}-mid`,
        ...(eventType === 'message' ? { text: 'hello' } : { attachments }),
      };
      const event = {
        sender: { id: 'fan-id' },
        recipient: { id: 'artist-id' },
        timestamp: 1_753_806_000_000,
        message,
      };

      await service.handleWebhookPayload({
        object: 'instagram',
        entry: [
          {
            id: 'artist-id',
            time: 1_753_806_000,
            messaging: [event],
          },
        ],
      });

      expect(createIfNotExists).toHaveBeenCalledWith({
        externalEventId: `${eventType}-mid`,
        eventType,
        initialStatus,
        senderId: 'fan-id',
        recipientId: 'artist-id',
        occurredAt: new Date(1_753_806_000_000),
        payload: event,
      });
    },
  );
});
