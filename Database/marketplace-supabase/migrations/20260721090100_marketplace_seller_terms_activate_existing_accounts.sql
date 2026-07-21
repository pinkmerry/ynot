-- Irreversible forward data repair for the historical pending-review state
-- created solely by seller-terms acceptance before the activation fix.
update public.marketplace_accounts
set
  seller_status = 'active',
  updated_at = now()
where seller_status = 'pending_review'
  and seller_terms_accepted_at is not null
  and seller_terms_version is not null;
