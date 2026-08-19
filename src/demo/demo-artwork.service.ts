import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { DemoConfig } from './demo.config';

/** Cover art is a single small image; anything bigger is a mistake. */
export const MAXIMUM_ARTWORK_BYTES = 2 * 1024 * 1024;

export type ArtworkMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function artworkContentType(data: Buffer): ArtworkMimeType {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  throw new Error('Reference artwork is not a JPEG, PNG or WebP image');
}

@Injectable()
export class DemoArtworkIngestor {
  constructor(private readonly config: DemoConfig) {}

  async ingest(): Promise<{
    data: Buffer;
    mimeType: ArtworkMimeType;
    byteSize: number;
  }> {
    const source = this.config.referenceArtworkPath;
    if (!source) {
      throw new Error('DEMO_REFERENCE_ARTWORK_PATH is not configured');
    }
    const data = await readFile(source);
    if (data.length === 0 || data.length > MAXIMUM_ARTWORK_BYTES) {
      throw new Error('Reference artwork has an invalid byte size');
    }
    return { data, mimeType: artworkContentType(data), byteSize: data.length };
  }
}
