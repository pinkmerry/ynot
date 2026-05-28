-- Defense in depth on the payment-slips storage bucket.
--
-- The bucket was created in 202604300001_lucky_draw_core.sql as public=false,
-- and all current write traffic uses service_role (createServiceSupabaseClient
-- in Website/src/app/api/ynot/wallet/route.ts), so anon/authenticated already
-- can't read objects in practice — Supabase Storage requires either
-- service_role or an explicit storage.objects RLS policy.
--
-- This migration adds the explicit deny posture so a future "let me grant
-- select on storage.objects to authenticated" accident can't quietly expose
-- bank account numbers + customer PII in the uploaded slip images.
-- Service_role continues to bypass RLS by design (Supabase platform).

-- Explicit deny for anon: no reads, no writes, no listing. The drop+create
-- pairs below are idempotent — re-running the migration just refreshes the
-- policy definitions.
drop policy if exists "payment-slips deny anon select" on storage.objects;
create policy "payment-slips deny anon select"
  on storage.objects
  for select
  to anon
  using (bucket_id <> 'payment-slips');

drop policy if exists "payment-slips deny anon insert" on storage.objects;
create policy "payment-slips deny anon insert"
  on storage.objects
  for insert
  to anon
  with check (bucket_id <> 'payment-slips');

drop policy if exists "payment-slips deny anon update" on storage.objects;
create policy "payment-slips deny anon update"
  on storage.objects
  for update
  to anon
  using (bucket_id <> 'payment-slips')
  with check (bucket_id <> 'payment-slips');

drop policy if exists "payment-slips deny anon delete" on storage.objects;
create policy "payment-slips deny anon delete"
  on storage.objects
  for delete
  to anon
  using (bucket_id <> 'payment-slips');

-- Authenticated users get the same lockout. Admins read slips through the
-- /api/ynot/admin/top-ups route which runs as service_role, so end users
-- have no legitimate direct-storage access.
drop policy if exists "payment-slips deny authenticated select" on storage.objects;
create policy "payment-slips deny authenticated select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id <> 'payment-slips');

drop policy if exists "payment-slips deny authenticated insert" on storage.objects;
create policy "payment-slips deny authenticated insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id <> 'payment-slips');

drop policy if exists "payment-slips deny authenticated update" on storage.objects;
create policy "payment-slips deny authenticated update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id <> 'payment-slips')
  with check (bucket_id <> 'payment-slips');

drop policy if exists "payment-slips deny authenticated delete" on storage.objects;
create policy "payment-slips deny authenticated delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id <> 'payment-slips');
