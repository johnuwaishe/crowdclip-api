import { Injectable } from '@nestjs/common';

export interface MomentAnalysis {
  status: 'matched' | 'no_match' | 'failed' | 'pending' | 'processing';
  catalogueId: string;
  referenceTrackId: string | null;
  referenceOffsetMs: number | null;
}

export interface SameMomentResult {
  sameMoment: boolean;
  offsetDifferenceMs: number | null;
  reason:
    | 'same_reference_nearby_offset'
    | 'analysis_not_matched'
    | 'different_catalogue'
    | 'different_reference_track'
    | 'offset_outside_window';
}

@Injectable()
export class SameMomentGroupingService {
  isSameMoment(
    left: MomentAnalysis,
    right: MomentAnalysis,
    windowMs = 5_000,
  ): SameMomentResult {
    if (!Number.isSafeInteger(windowMs) || windowMs < 0) {
      throw new Error('Same-moment window must be a non-negative integer');
    }
    if (
      left.status !== 'matched' ||
      right.status !== 'matched' ||
      left.referenceTrackId === null ||
      right.referenceTrackId === null ||
      left.referenceOffsetMs === null ||
      right.referenceOffsetMs === null
    ) {
      return {
        sameMoment: false,
        offsetDifferenceMs: null,
        reason: 'analysis_not_matched',
      };
    }
    if (left.catalogueId !== right.catalogueId) {
      return {
        sameMoment: false,
        offsetDifferenceMs: null,
        reason: 'different_catalogue',
      };
    }
    if (left.referenceTrackId !== right.referenceTrackId) {
      return {
        sameMoment: false,
        offsetDifferenceMs: null,
        reason: 'different_reference_track',
      };
    }
    const offsetDifferenceMs = Math.abs(
      left.referenceOffsetMs - right.referenceOffsetMs,
    );
    if (offsetDifferenceMs > windowMs) {
      return {
        sameMoment: false,
        offsetDifferenceMs,
        reason: 'offset_outside_window',
      };
    }
    return {
      sameMoment: true,
      offsetDifferenceMs,
      reason: 'same_reference_nearby_offset',
    };
  }
}
