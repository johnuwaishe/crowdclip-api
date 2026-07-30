import {
  InvalidInstagramWebhookPayloadError,
  normalizeInstagramMessagingEvents,
} from './instagram-webhook-payload.parser';

describe('normalizeInstagramMessagingEvents', () => {
  const storyMention = {
    sender: { id: 'fan-id' },
    recipient: { id: 'artist-id' },
    timestamp: 1_753_806_000_000,
    message: {
      mid: 'message-id',
      attachments: [
        {
          type: 'story_mention',
          payload: { url: 'https://cdn.example.test/story.mp4' },
        },
      ],
    },
  };

  it('returns typed messaging events while preserving the raw event object', () => {
    const payload = {
      object: 'instagram',
      entry: [
        { id: 'artist-id', time: 1_753_806_000, messaging: [storyMention] },
      ],
    };

    expect(normalizeInstagramMessagingEvents(payload)).toEqual([storyMention]);
  });

  it.each([
    null,
    {},
    { object: 'instagram' },
    {
      object: 'instagram',
      entry: [{ messaging: [{ sender: { id: 'fan-id' } }] }],
    },
  ])('rejects a malformed payload %#', (payload) => {
    expect(() => normalizeInstagramMessagingEvents(payload)).toThrow(
      InvalidInstagramWebhookPayloadError,
    );
  });

  it('allows entries that do not contain messaging events', () => {
    expect(
      normalizeInstagramMessagingEvents({
        object: 'instagram',
        entry: [{ id: 'artist-id', time: 1_753_806_000 }],
      }),
    ).toEqual([]);
  });
});
