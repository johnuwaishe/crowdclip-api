import { Injectable, Logger } from '@nestjs/common';
import { SupabaseObjectStorage } from '../media/supabase-object-storage.service';
import { AudioAnalysisConfig } from './audio-analysis.config';
import { AudioReferenceCataloguesRepository } from './audio-reference-catalogues.repository';
import { ClipAudioAnalysesRepository } from './clip-audio-analyses.repository';
import { ConcertAudioAnalyzerClient } from './concert-audio-analyzer.client';

const MAX_ERROR_MESSAGE_LENGTH = 2_000;

export type AudioAnalysisProcessingResult =
  | { status: 'idle' }
  | { status: 'matched' | 'no_match'; analysisId: string }
  | { status: 'retrying' | 'failed'; analysisId: string; error: string };

@Injectable()
export class AudioAnalysisProcessor {
  private readonly logger = new Logger(AudioAnalysisProcessor.name);

  constructor(
    private readonly config: AudioAnalysisConfig,
    private readonly storage: SupabaseObjectStorage,
    private readonly cataloguesRepository: AudioReferenceCataloguesRepository,
    private readonly analysesRepository: ClipAudioAnalysesRepository,
    private readonly analyzerClient: ConcertAudioAnalyzerClient,
  ) {}

  async processNext(): Promise<AudioAnalysisProcessingResult> {
    const analysis = await this.analysesRepository.claimNextPending();
    if (!analysis) return { status: 'idle' };

    try {
      const referenceTracks = await this.cataloguesRepository.listReadyTracks(
        analysis.catalogue_id,
      );
      if (referenceTracks.length === 0) {
        throw new Error('Audio reference catalogue has no ready tracks');
      }
      const [queryUrl, references] = await Promise.all([
        this.storage.createSignedUrl({
          bucket: analysis.media_storage_bucket,
          path: analysis.media_storage_path,
          expiresInSeconds: this.config.signedUrlTtlSeconds,
        }),
        Promise.all(
          referenceTracks.map(async (track) => {
            if (!track.storage_bucket || !track.storage_path) {
              throw new Error(
                `Ready reference track ${track.id} has no object`,
              );
            }
            return {
              trackId: track.id,
              source: await this.storage.createSignedUrl({
                bucket: track.storage_bucket,
                path: track.storage_path,
                expiresInSeconds: this.config.signedUrlTtlSeconds,
              }),
            };
          }),
        ),
      ]);
      const result = await this.analyzerClient.analyse({
        mediaAssetId: analysis.media_asset_id,
        source: queryUrl,
        references,
      });

      const completed =
        result.status === 'matched'
          ? await this.analysesRepository.markMatched({
              id: analysis.id,
              referenceTrackId: result.referenceTrackId,
              fingerprintSimilarity: result.fingerprintSimilarity,
              secondBestSimilarity: result.secondBestSimilarity,
              peakMargin: result.peakMargin,
              timeScale: result.timeScale,
              referenceOffsetMs: result.referenceOffsetMs,
              matchedDurationMs: result.matchedDurationMs,
            })
          : await this.analysesRepository.markNoMatch({
              id: analysis.id,
              fingerprintSimilarity: result.fingerprintSimilarity,
              secondBestSimilarity: result.secondBestSimilarity,
              peakMargin: result.peakMargin,
              timeScale: result.timeScale,
            });
      if (!completed) {
        throw new Error(
          'Audio analysis could not be completed from its current state',
        );
      }
      this.logger.log(
        `Audio analysis ${analysis.id} completed as ${result.status}`,
      );
      return { status: result.status, analysisId: analysis.id };
    } catch (error) {
      const errorMessage = this.errorMessage(error);
      const released = await this.analysesRepository.releaseAfterFailure(
        analysis.id,
        errorMessage,
        this.config.maxAttempts,
        new Date(Date.now() + this.config.retryDelayMs),
      );
      if (!released) {
        throw new Error('Audio analysis could not be released after failure', {
          cause: error,
        });
      }
      this.logger.error(
        `Audio analysis ${analysis.id} failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        status: released.status === 'failed' ? 'failed' : 'retrying',
        analysisId: analysis.id,
        error: errorMessage,
      };
    }
  }

  private errorMessage(error: unknown): string {
    return (
      error instanceof Error ? error.message : 'Unknown audio analysis error'
    ).slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
}
