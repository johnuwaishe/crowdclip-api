const MEDIA_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/heic': 'heic',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function normalizeSupportedMediaType(
  value: string,
): { mimeType: string; extension: string } | null {
  const mimeType = value.split(';', 1)[0].trim().toLowerCase();
  const extension = MEDIA_EXTENSIONS[mimeType];

  return extension ? { mimeType, extension } : null;
}
