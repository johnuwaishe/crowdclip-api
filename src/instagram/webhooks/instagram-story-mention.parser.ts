export interface NormalizedInstagramStoryMention {
  sourceUrl: string;
}

export class InvalidInstagramStoryMentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidInstagramStoryMentionError.name;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function normalizeInstagramStoryMention(
  payload: Record<string, unknown>,
): NormalizedInstagramStoryMention {
  const message = payload.message;

  if (!isRecord(message) || !isUnknownArray(message.attachments)) {
    throw new InvalidInstagramStoryMentionError(
      'Story mention event does not contain attachments',
    );
  }

  const storyMention = message.attachments.find(
    (attachment) => isRecord(attachment) && attachment.type === 'story_mention',
  );

  if (!isRecord(storyMention)) {
    throw new InvalidInstagramStoryMentionError(
      'Story mention attachment was not found',
    );
  }

  const attachmentPayload = storyMention.payload;

  if (!isRecord(attachmentPayload)) {
    throw new InvalidInstagramStoryMentionError(
      'Story mention attachment does not contain a payload',
    );
  }

  const sourceUrl = attachmentPayload.url;

  if (typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
    throw new InvalidInstagramStoryMentionError(
      'Story mention attachment does not contain a media URL',
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new InvalidInstagramStoryMentionError(
      'Story mention media URL is invalid',
    );
  }

  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.username.length > 0 ||
    parsedUrl.password.length > 0
  ) {
    throw new InvalidInstagramStoryMentionError(
      'Story mention media URL must be a credential-free HTTPS URL',
    );
  }

  return {
    sourceUrl,
  };
}
