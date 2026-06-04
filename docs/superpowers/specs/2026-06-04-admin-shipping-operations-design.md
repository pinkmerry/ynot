# Admin Shipping Operations Console Design

**Date:** 2026-06-04
**Status:** Approved design for implementation planning
**Selected approach:** Plan C, hybrid operations console

## Goal

Give admins one reliable fulfilment flow for customer shipping requests. An admin must be able to answer, from the shipping page and user detail page:

- Which user requested this shipment?
- Which reward or collection item is being shipped?
- Which pack/campaign did that reward come from?
- Is the shipment already sent?
- If sent, what tracking provider and tracking number were used?
- What happened before and after this request?

This pass improves admin visibility and shipping correctness. It does not add carrier integrations, label printing, automated delivery sync, refund automation, or pack-opening behavior changes.

## Current Flow Summary

The existing customer shipping backend already performs important safety checks:

- The user must have a current profile.
- The shipping request resolves selected collection items server-side.
- The selected item is locked by the shipping request so it cannot be reused.
- The shipping RPC creates `shipping_requests` and `shipping_request_items`.
- Status updates can move items to shipped/delivered or back to owned when cancelled before shipment.

The main gaps are on admin visibility and operational context:

- Admin shipping currently has a data-scope risk: the shared shipping loader supports an `includeAll` mode, but admin usage does not clearly load all users' shipping requests.
- Shipping records shown in admin are too thin: request code, status, tracking, created date, and admin note are not enough for fulfilment.
- Admin cannot clearly see the customer, recipient, reward, source pack, and opening context on the shipping page.
- The customer shipping page does not consistently show shipped tracking and source reward context.
- The admin users page lists profiles, but it does not provide a full user detail view with rewards, shipping history, wallet history, and pack-opening history.
- The 1000-coin shipping requirement appears as a customer UI rule in one path. The implementation must not leave this as UI-only behavior: either enforce the rule server-side or remove it consistently after product confirmation.

## Target Admin Flow

```text
Customer chooses reward to ship
-> customer confirms recipient/address
-> system creates shipping request and locks reward
-> admin reviews user, reward, pack source, and address
-> admin marks processing
-> admin ships package and enters tracking
-> customer and admin see shipped status with tracking
-> admin marks delivered
```

The admin flow must make shipped requests visually obvious. A request that is already shipped should show the tracking provider and tracking number directly in the table and in the detail drawer.

## Status Model

Statuses:

- `requested`: customer submitted the request; selected items are locked.
- `processing`: admin accepted or started fulfilment.
- `shipped`: package has been sent; tracking provider and tracking number are required.
- `delivered`: shipment is complete.
- `cancelled`: request was stopped before shipment.

Allowed transitions:

- `requested -> processing`
- `requested -> cancelled`
- `processing -> shipped`
- `processing -> cancelled`
- `shipped -> delivered`

Tracking rules:

- Tracking provider and tracking number are required when marking a request `shipped`.
- Admin can correct tracking after shipment if there was a typo.
- Customer-visible shipping history shows tracking after the request is shipped.

Reward rules:

- A selected reward is locked once shipping is requested.
- If cancelled before shipment, the reward returns to the user's available collection.
- Once shipped or delivered, the item remains shipped/delivered and cannot be selected again.

Audit rules:

- Every status change records admin, timestamp, old status, new status, tracking change, and note.
- The same audit timeline appears in the shipping detail drawer and User 360 page.

## Customer Shipping Requirements

Before a user can request shipping, the system should require a complete shipping profile:

- Recipient full name
- Phone number
- Full address line
- Subdistrict, district, province, and postal code
- Country, defaulting to Thailand for v1
- Email or LINE-linked identity for support contact
- Explicit confirmation that the selected address is correct

Optional fields:

- Address label, such as Home or Office
- Delivery note, such as building name or drop-off detail
- Alternate phone, only if operationally useful

When the customer submits a request, the shipping request should keep an address snapshot. Later edits to the user's profile address must not rewrite historical shipping addresses.

The final customer confirmation should show:

- Selected reward
- Source pack/campaign
- Recipient name
- Phone
- Full address
- Shipping cost or coin requirement, after the implementation resolves whether the 1000-coin rule remains active
- Notice that the reward will be locked after request

Blocking rules:

- No request if address data is incomplete.
- No request if phone is missing or invalid.
- No request if the selected reward is already requested, shipped, delivered, or otherwise unavailable.
- No request if the item cannot be traced back to the current user.
- Resolve the 1000-coin rule during implementation planning. If active, enforce it server-side; if inactive, remove the UI-only guard.

## Admin Shipping Page

Upgrade `/admin/shipping` into the fulfilment console.

The table should show enough information to work quickly:

- Shipping request code
- Status
- Customer display name
- Customer email
- Profile ID or copyable support identifier
- LINE identity/link status when available
- Reward/card summary
- Source pack/campaign
- Created date
- Tracking provider and tracking number when shipped
- Admin note summary
- Link to User 360

Each row opens a detail drawer. The drawer should include:

- Customer block: display name, email, profile ID, LINE link status, phone if available.
- Recipient block: address snapshot used for this request.
- Reward block: reward/card name, rarity/tier, quantity, collection item status.
- Source block: pack/campaign name, open code/reference, pull position or source prize tier when available.
- Tracking block: provider, number, shipped date, delivered date.
- Timeline block: request creation and every admin status update.

Admin actions:

- Mark processing.
- Mark shipped with required tracking.
- Mark delivered.
- Cancel only while the request is still cancelable.
- Edit tracking on shipped requests.
- Open User 360.
- Copy request code, profile ID, email, and tracking number.

## Admin User 360 Page

Add or upgrade `/admin/users/[profileId]`.

The page should answer the support question: "Who is this user, what did they win, from which pack, and what happened after?"

Top user info:

- Display name
- Email
- LINE profile/link status if available
- Phone
- Default shipping address
- Wallet/coin balance
- Account created date
- Last activity date
- Admin role/status flags where relevant

Reward history:

- Reward/card name
- Rarity/tier
- Status: owned, shipping requested, shipped, delivered, or cancelled
- Source pack/campaign
- Pull/opening reference
- Date won
- Linked shipping request code if requested or shipped
- Tracking number if already shipped

Shipping history:

- Request code
- Status
- Items in the shipment
- Source pack for each item
- Recipient/address snapshot
- Tracking provider and tracking number
- Admin note
- Created, shipped, and delivered dates

Timeline:

- Pack opened
- Reward won
- Shipping requested
- Admin status changed
- Tracking added
- Delivered or cancelled
- Wallet/reward adjustments if related

Navigation:

- Open related shipping request.
- Open source pack/campaign.
- Search and filter this user's rewards.
- Copy profile ID, email, request code, and tracking number.

## Customer Shipping Page

Improve `/shipping` so customers can see:

- Requested reward.
- Source pack/campaign.
- Shipping status.
- Tracking provider and tracking number after shipment.
- Safe admin note if it is intended for the customer.

The customer view should not expose admin-only identifiers, internal pack-opening logic, or raw database IDs.

## Data And API Design

Create one enriched admin-only shipping read shape. It can be implemented by extending the existing admin shipping API or by adding a dedicated admin RPC/view.

The enriched shape should join:

- `shipping_requests`
- `shipping_request_items`
- `collection_items`
- reward/card metadata
- pack/campaign/opening source metadata
- user/profile metadata
- address snapshot/details
- tracking/status fields
- admin audit/status timeline

Do not make the customer shipping API carry admin-only data. Customer endpoints should only return the user's own request history and safe display fields.

Preferred implementation boundary:

- Server-only data helpers resolve internal IDs and joins.
- Admin APIs return fulfilment DTOs with user, reward, pack, address, and tracking detail.
- Customer APIs return public shipping DTOs with safe source/reward/tracking display.
- React components consume DTOs and do not perform shipping joins client-side.

## Likely Files

- `Website/src/app/admin/shipping/page.tsx`
- `Website/src/app/admin/users/page.tsx`
- `Website/src/app/admin/users/[profileId]/page.tsx`
- `Website/src/app/(store)/shipping/page.tsx`
- `Website/src/app/api/ynot/admin/shipping/route.ts`
- `Website/src/app/api/ynot/shipping/route.ts`
- `Website/src/features/ynot/data.ts`
- `Website/src/features/ynot/types.ts`
- `Website/src/features/ynot/components.tsx`
- Supabase migration, only if the existing RPC/view cannot return the required joined data

## Verification Plan

Run existing checks:

- `npm run test:shipping-flow`
- `npm run test:personal-info`
- `npm run verify:platform`

Add or update checks for:

- Admin can see all shipping requests.
- Admin sees customer, reward, source pack, address snapshot, and tracking for each shipment.
- Marking shipped requires tracking provider and tracking number.
- Customer can see tracking after the request is shipped.
- Cancelled pre-shipment requests return eligible items to the user collection.
- User 360 shows reward history and shipping history for the selected profile.

If a database migration is added, include migration verification before claiming completion.

## Out Of Scope

- Carrier API integration
- Label printing
- Automated carrier delivery sync
- Refund or payment automation
- Pack-opening mechanics changes
- Broad admin redesign outside shipping operations and User 360

## Success Criteria

The improvement is complete when:

- Admin shipping loads all customer shipping requests.
- Each admin shipping request shows the requesting user, reward, source pack, address snapshot, status, and tracking.
- Shipped requests are clearly marked as shipped with visible tracking.
- Admin can navigate from a shipment to the related user.
- User 360 shows user info, reward history, shipping history, wallet context, and pack/source context.
- Customer shipping history shows reward, pack source, status, and tracking after shipment.
- Existing shipping tests pass, and new admin/user-history coverage protects the added behavior.
