BEGIN;

CREATE TRIGGER set_audio_reference_catalogues_updated_at
BEFORE UPDATE ON public.audio_reference_catalogues
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_audio_reference_tracks_updated_at
BEFORE UPDATE ON public.audio_reference_tracks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_clip_audio_analyses_updated_at
BEFORE UPDATE ON public.clip_audio_analyses
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.audio_reference_catalogues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_reference_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_audio_analyses ENABLE ROW LEVEL SECURITY;

COMMIT;
