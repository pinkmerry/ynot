alter table public.payment_slips
  add column if not exists file_sha256 text,
  add column if not exists slip2go_reference_id text,
  add column if not exists decoded_qr_hash text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists provider_code text,
  add column if not exists provider_message text,
  add column if not exists provider_response jsonb not null default '{}'::jsonb,
  add column if not exists verified_at timestamptz,
  add column if not exists duplicate_of_slip_id uuid references public.payment_slips(id) on delete set null;

alter table public.payment_slips
  drop constraint if exists payment_slips_verification_status_check;

alter table public.payment_slips
  add constraint payment_slips_verification_status_check
  check (
    verification_status in (
      'unverified',
      'valid',
      'duplicate',
      'fraud',
      'not_found',
      'amount_mismatch',
      'receiver_mismatch',
      'date_mismatch',
      'provider_error',
      'manual_review'
    )
  );

create index if not exists payment_slips_verification_status_idx
on public.payment_slips(verification_status);

create index if not exists payment_slips_file_sha256_idx
on public.payment_slips(file_sha256)
where file_sha256 is not null;

create index if not exists payment_slips_slip2go_reference_id_idx
on public.payment_slips(slip2go_reference_id)
where slip2go_reference_id is not null;

create index if not exists payment_slips_decoded_qr_hash_idx
on public.payment_slips(decoded_qr_hash)
where decoded_qr_hash is not null;

create unique index if not exists payment_slips_valid_file_sha256_unique
on public.payment_slips(file_sha256)
where file_sha256 is not null and verification_status = 'valid';

create unique index if not exists payment_slips_valid_slip2go_reference_id_unique
on public.payment_slips(slip2go_reference_id)
where slip2go_reference_id is not null and verification_status = 'valid';

create unique index if not exists payment_slips_valid_decoded_qr_hash_unique
on public.payment_slips(decoded_qr_hash)
where decoded_qr_hash is not null and verification_status = 'valid';

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'payment-slips';
