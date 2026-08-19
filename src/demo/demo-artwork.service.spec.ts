import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  artworkContentType,
  DemoArtworkIngestor,
  MAXIMUM_ARTWORK_BYTES,
} from './demo-artwork.service';
import { DemoConfig } from './demo.config';

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('jfif-payload'),
]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png-payload'),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x10, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPvp8 payload'),
]);

describe('artworkContentType', () => {
  it('identifies the three artwork formats browsers can all show', () => {
    expect(artworkContentType(JPEG)).toBe('image/jpeg');
    expect(artworkContentType(PNG)).toBe('image/png');
    expect(artworkContentType(WEBP)).toBe('image/webp');
  });

  it('rejects anything that is not a JPEG, PNG or WebP', () => {
    expect(() => artworkContentType(Buffer.from('GIF89a...'))).toThrow(
      /not a JPEG, PNG or WebP/,
    );
    expect(() => artworkContentType(Buffer.alloc(0))).toThrow(
      /not a JPEG, PNG or WebP/,
    );
  });
});

describe('DemoArtworkIngestor', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'crowdclip-artwork-test-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function ingestor(referenceArtworkPath: string | null) {
    return new DemoArtworkIngestor({ referenceArtworkPath } as DemoConfig);
  }

  it('reads the operator-provided artwork and reports its type', async () => {
    const path = join(directory, 'casino.jpg');
    await writeFile(path, JPEG);

    await expect(ingestor(path).ingest()).resolves.toEqual({
      data: JPEG,
      mimeType: 'image/jpeg',
      byteSize: JPEG.length,
    });
  });

  it('refuses to run without a configured artwork path', async () => {
    await expect(ingestor(null).ingest()).rejects.toThrow(
      /DEMO_REFERENCE_ARTWORK_PATH/,
    );
  });

  it('rejects artwork above the size cap', async () => {
    const path = join(directory, 'huge.jpg');
    await writeFile(
      path,
      Buffer.concat([JPEG, Buffer.alloc(MAXIMUM_ARTWORK_BYTES)]),
    );

    await expect(ingestor(path).ingest()).rejects.toThrow(
      /invalid byte size/,
    );
  });
});
