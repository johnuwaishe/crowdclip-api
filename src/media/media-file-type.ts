const MEDIA_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/heic': 'heic',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
};

export function normalizeSupportedMediaType(
  value: string,
): { mimeType: string; extension: string } | null {
  const mimeType = value.split(';', 1)[0].trim().toLowerCase();
  const extension = MEDIA_EXTENSIONS[mimeType];

  return extension ? { mimeType, extension } : null;
}

export function normalizeSupportedAudioType(
  value: string,
): { mimeType: string; extension: string } | null {
  const mimeType = value.split(';', 1)[0].trim().toLowerCase();
  const extension = AUDIO_EXTENSIONS[mimeType];

  return extension ? { mimeType, extension } : null;
}
