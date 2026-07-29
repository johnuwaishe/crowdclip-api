import { Injectable } from '@nestjs/common';
import { MediaDownloadConfig } from './media-download.config';

const MAX_REDIRECTS = 3;

export interface DownloadedMedia {
  data: Buffer;
  mimeType: string;
  byteSize: number;
  extension: string;
}

@Injectable()
export class RemoteMediaDownloader {
  constructor(private readonly config: MediaDownloadConfig) {}

  async download(sourceUrl: string): Promise<DownloadedMedia> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.downloadTimeoutMs,
    );
    timeout.unref();

    try {
      const response = await this.fetchFollowingSafeRedirects(
        sourceUrl,
        controller.signal,
      );

      if (!response.ok) {
        throw new Error(`Media download returned HTTP ${response.status}`);
      }

      const mimeType = this.getAllowedMimeType(response);
      this.validateContentLength(response);
      const data = await this.readBoundedBody(response);

      return {
        data,
        mimeType,
        byteSize: data.byteLength,
        extension: this.getExtension(mimeType),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Media download timed out', { cause: error });
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchFollowingSafeRedirects(
    sourceUrl: string,
    signal: AbortSignal,
  ): Promise<Response> {
    let currentUrl = this.parseSafeUrl(sourceUrl);

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: {
          Accept: 'image/*, video/*',
        },
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return response;
      }

      const location = response.headers.get('location');

      if (!location || redirects === MAX_REDIRECTS) {
        throw new Error('Media download exceeded the redirect limit');
      }

      currentUrl = this.parseSafeUrl(new URL(location, currentUrl).toString());
    }

    throw new Error('Media download exceeded the redirect limit');
  }

  private parseSafeUrl(value: string): URL {
    let url: URL;

    try {
      url = new URL(value);
    } catch {
      throw new Error('Media source URL is invalid');
    }

    if (
      url.protocol !== 'https:' ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      throw new Error('Media source URL must be a credential-free HTTPS URL');
    }

    return url;
  }

  private getAllowedMimeType(response: Response): string {
    const contentType = response.headers.get('content-type');
    const mimeType = contentType?.split(';', 1)[0].trim().toLowerCase();

    if (
      !mimeType ||
      (!mimeType.startsWith('image/') && !mimeType.startsWith('video/'))
    ) {
      throw new Error('Downloaded media has an unsupported content type');
    }

    return mimeType;
  }

  private validateContentLength(response: Response): void {
    const contentLength = response.headers.get('content-length');

    if (!contentLength) {
      return;
    }

    const parsedLength = Number(contentLength);

    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new Error('Downloaded media has an invalid content length');
    }

    if (parsedLength > this.config.maxBytes) {
      throw new Error('Downloaded media exceeds the configured size limit');
    }
  }

  private async readBoundedBody(response: Response): Promise<Buffer> {
    if (!response.body) {
      throw new Error('Media download returned an empty response body');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteSize = 0;

    try {
      while (true) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        byteSize += chunk.value.byteLength;

        if (byteSize > this.config.maxBytes) {
          await reader.cancel();
          throw new Error('Downloaded media exceeds the configured size limit');
        }

        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }

    if (byteSize === 0) {
      throw new Error('Media download returned an empty file');
    }

    return Buffer.concat(chunks, byteSize);
  }

  private getExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/heic': 'heic',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/webm': 'webm',
    };

    return extensions[mimeType] ?? 'media';
  }
}
