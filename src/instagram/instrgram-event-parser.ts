import { InstagramMessagingEvent } from './webhooks/types/Instagram-webhook.type';

export type InstagramEventType =
  'story_mention' | 'media_share' | 'message' | 'reaction' | 'unknown';

export function getInstagramEventType(
  event: InstagramMessagingEvent,
): InstagramEventType {
  const attachments = event.message?.attachments ?? [];

  const hasStoryMention = attachments.some(
    (attachment) => attachment.type === 'story_mention',
  );

  if (hasStoryMention) {
    return 'story_mention';
  }

  const hasMediaShare = attachments.some(
    (attachment) =>
      attachment.type === 'image' ||
      attachment.type === 'video' ||
      attachment.type === 'audio',
  );

  if (hasMediaShare) {
    return 'media_share';
  }

  if (event.message?.text) {
    return 'message';
  }

  if (event.reaction) {
    return 'reaction';
  }

  return 'unknown';
}
