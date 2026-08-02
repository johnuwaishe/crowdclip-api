import { SameMomentGroupingService } from './same-moment-grouping.service';

describe('SameMomentGroupingService', () => {
  const service = new SameMomentGroupingService();
  const base = {
    status: 'matched' as const,
    catalogueId: 'catalogue-id',
    referenceTrackId: 'track-id',
    referenceOffsetMs: 78_000,
  };

  it('groups clips on the same reference with nearby offsets', () => {
    expect(
      service.isSameMoment(base, { ...base, referenceOffsetMs: 82_500 }),
    ).toEqual({
      sameMoment: true,
      offsetDifferenceMs: 4_500,
      reason: 'same_reference_nearby_offset',
    });
  });

  it('does not group clips outside the configured window', () => {
    expect(
      service.isSameMoment(base, { ...base, referenceOffsetMs: 83_001 }),
    ).toMatchObject({
      sameMoment: false,
      offsetDifferenceMs: 5_001,
      reason: 'offset_outside_window',
    });
  });

  it.each([
    [{ ...base, catalogueId: 'other-catalogue' }, 'different_catalogue'],
    [{ ...base, referenceTrackId: 'other-track' }, 'different_reference_track'],
    [{ ...base, status: 'no_match' as const }, 'analysis_not_matched'],
  ])('does not group incompatible analyses', (right, reason) => {
    expect(service.isSameMoment(base, right)).toMatchObject({
      sameMoment: false,
      reason,
    });
  });
});
