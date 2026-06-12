-- Allow AVIF only for public visual asset uploads.
-- Payment slips stay JPG/PNG/WebP because payment verification is a separate boundary.

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'lucky-draw-assets';

update storage.buckets
set allowed_mime_types = array[
  'video/mp4',
  'video/webm',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg'
]
where id = 'tier-animations';

do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id = 'payment-slips'
      and allowed_mime_types is not null
      and 'image/avif' = any(allowed_mime_types)
  ) then
    raise exception 'payment-slips must not allow image/avif';
  end if;
end $$;
