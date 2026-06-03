-- card_stock_ledger_edited_event

alter table public.card_stock_ledger
  drop constraint if exists card_stock_ledger_event_type_check;

alter table public.card_stock_ledger
  add constraint card_stock_ledger_event_type_check
  check (event_type in (
    'stock_created',
    'reserved',
    'reservation_released',
    'allocated',
    'unit_materialized',
    'archived',
    'deleted',
    'edited',
    'approval_failed'
  ));
