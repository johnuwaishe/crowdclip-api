import { ClipMediaChoice } from './clip-row.type';
import { OriginalFileRequestStatus } from './original-file-request-row.type';

export type ArtistClipMediaChoice = Exclude<ClipMediaChoice, 'undecided'>;

export interface ClipDecisionResult {
  clipId: string;
  mediaChoice: ArtistClipMediaChoice;
  updatedAt: Date;
  originalFileRequest: {
    id: string;
    status: OriginalFileRequestStatus;
    expiresAt: Date;
    uploadPath: string | null;
  } | null;
}
