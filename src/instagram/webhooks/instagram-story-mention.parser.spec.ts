import {
  InvalidInstagramStoryMentionError,
  normalizeInstagramStoryMention,
} from './instagram-story-mention.parser';

describe('normalizeInstagramStoryMention', () => {
  it('extracts the HTTPS URL from the story mention attachment', () => {
    expect(
      normalizeInstagramStoryMention({
        message: {
          attachments: [
            {
              type: 'story_mention',
              payload: {
                url: 'https://cdn.example.test/story.mp4?signature=test',
              },
            },
          ],
        },
      }),
    ).toEqual({
      sourceUrl: 'https://cdn.example.test/story.mp4?signature=test',
    });
  });

  it('rejects a payload without a story mention attachment', () => {
    expect(() =>
      normalizeInstagramStoryMention({
        message: {
          attachments: [{ type: 'image', payload: {} }],
        },
      }),
    ).toThrow(
      new InvalidInstagramStoryMentionError(
        'Story mention attachment was not found',
      ),
    );
  });

  it.each([
    'not-a-url',
    'http://cdn.example.test/story.mp4',
    'https://user:password@cdn.example.test/story.mp4',
  ])('rejects unsafe media URL %s', (sourceUrl) => {
    expect(() =>
      normalizeInstagramStoryMention({
        message: {
          attachments: [
            {
              type: 'story_mention',
              payload: { url: sourceUrl },
            },
          ],
        },
      }),
    ).toThrow(InvalidInstagramStoryMentionError);
  });
});
