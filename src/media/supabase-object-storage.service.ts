import { Injectable } from '@nestjs/common';
import { MediaDownloadConfig } from './media-download.config';

export interface UploadObjectInput {
  bucket: string;
  path: string;
  data: Buffer;
  contentType: string;
}

@Injectable()
export class SupabaseObjectStorage {
  constructor(private readonly config: MediaDownloadConfig) {}

  async upload(input: UploadObjectInput): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.uploadTimeoutMs,
    );
    timeout.unref();

    const serviceRoleKey = this.config.getServiceRoleKey();
    const objectUrl = this.createObjectUrl(input.bucket, input.path);
    const body = input.data.buffer.slice(
      input.data.byteOffset,
      input.data.byteOffset + input.data.byteLength,
    ) as ArrayBuffer;

    try {
      const response = await fetch(objectUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': input.contentType,
          'x-upsert': 'true',
        },
        body,
      });

      if (!response.ok) {
        const details = (await response.text()).slice(0, 500);
        throw new Error(
          `Supabase Storage upload returned HTTP ${response.status}: ${details}`,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Supabase Storage upload timed out', { cause: error });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private createObjectUrl(bucket: string, path: string): URL {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) {
      throw new Error('Storage bucket name is invalid');
    }

    const pathSegments = path.split('/');

    if (
      pathSegments.some(
        (segment) =>
          segment.length === 0 || segment === '.' || segment === '..',
      )
    ) {
      throw new Error('Storage object path is invalid');
    }

    const encodedPath = pathSegments.map(encodeURIComponent).join('/');
    const baseUrl = this.config.getSupabaseUrl().replace(/\/+$/, '');

    return new URL(
      `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
    );
  }
}
