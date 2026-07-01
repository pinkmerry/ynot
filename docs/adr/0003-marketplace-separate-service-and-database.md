# Marketplace uses a separate service and database

## Status

Accepted.

## Decision

Marketplace will run behind a separate Marketplace Worker/service and a separate Marketplace Supabase project while the customer keeps one YNOT login and website experience.

The user-facing invariant is simple: a customer logs in once with YNOT and can browse, cart, buy by bank transfer, upload payment proof, see orders, sell cards, and check seller status without creating or managing a second visible account.

The internal invariant is stricter: the backend resolves `current YNOT profile -> Marketplace Account -> allowed action`. Browser requests must not supply trusted marketplace account IDs, seller account IDs, buyer account IDs, payout account IDs, or actor profile IDs.

## Rationale

We rejected putting marketplace tables and real-money workflows directly into the existing YNOT core database because marketplace orders, seller payouts, audit, and double-sell prevention need a tighter blast radius from gacha rewards, wallet coins, and Customer Bag operations.

The marketplace can have its own runtime, database, RLS rules, scheduled jobs, payout audit trail, and operational dashboard without asking the customer to understand those internals. The public domain, login session, and navigation stay unified.

## Consequences

- Marketplace browser actions derive identity from the authenticated YNOT profile on the server.
- Marketplace writes continue through the central mutation guard and RPC layer.
- Marketplace customer, admin, and HTTP routes belong to the marketplace Worker route set.
- Gacha, wallet, Customer Bag, and marketplace records stay separated at the transactional boundary.
