# YNOTT Context

YNOTT is a pack-opening, reward ownership, exchange, and shipping platform. This glossary names domain concepts so product, backend, database, and admin flows use the same language.

## Language

**Pull All**:
The customer-facing action that confirms spending for all remaining eligible spots in a pack and starts a Bulk Open Session.
_Avoid_: Open all, all pull, cancelable bulk open

**Bulk Open Session**:
A committed, resumable opening session created by Pull All. It cannot be cancelled after customer confirmation and owns the customer's gacha-spend lane across all packs until the target pack is sold out or a system pause requires retry.
_Avoid_: Pull-all transaction, mega pull, giant open, cancelable session

**Session-Owned Sellout**:
The state where a Pull All confirmation makes all remaining eligible spots unavailable to other customers immediately, even while the Bulk Open Session is still revealing or recording rewards.
_Avoid_: Soft hold, temporary hold, tentative sellout

**Customer Sold Out**:
A customer-facing availability state meaning customers cannot open more spots in the pack. It can be caused by all slots being opened or by a Session-Owned Sellout while the campaign is still internally processable.
_Avoid_: Campaign closed, archived pack, deleted pack

**Highlight Reward**:
A customer-visible sample reward shown during a Bulk Open Session reveal. Highlight Rewards are capped at 100 and prioritize Last Prize and the best public-facing wins; they are not the full result list.
_Avoid_: Full result, all rewards, complete pull list

**Highlight Reveal**:
The Pull All reveal experience shown after the first safe processing batch has produced customer-facing Highlight Rewards. It does not wait for the full Bulk Open Session to finish.
_Avoid_: Full-result reveal, completion screen, batch report

**Customer Bag**:
The customer-facing place where owned rewards appear after pack opening, including Pull All progress and settling state. It is also where rewards become available for exchange or shipping after they are settled.
_Avoid_: Raw collection rows, inventory table

**Settled Reward**:
An owned reward whose opening session has completed and is eligible for customer actions such as exchange or shipping.
_Avoid_: Landed reward, pending reward, unlocked row

**Convertible Reward**:
A Settled Reward that the customer may permanently convert into coins because it still belongs to them, has a positive conversion value, and is not already committed to another customer action.
_Avoid_: Any card, raw collection row, pending reward

**Reward Conversion**:
The customer-confirmed action that permanently gives up selected Convertible Rewards in exchange for wallet coins.
_Avoid_: Admin exchange approval, sell request, reversible trade

**Conversion Selection**:
The explicit customer selection of Convertible Rewards that will be converted. It may be made by choosing individual rewards or by using a select-all-eligible action, but an empty selection means no conversion.
_Avoid_: Implicit all, auto-convert bag, hidden selection

**Bulk Conversion Job**:
A committed Reward Conversion for a large Conversion Selection that continues server-side until all selected rewards are converted or operator recovery is required.
_Avoid_: Browser conversion loop, cancelable conversion, one giant transaction

**Settling Reward**:
A customer-visible reward created during an active Bulk Open Session before the full session has completed. It can appear in Customer Bag, but cannot be exchanged or shipped until it becomes a Settled Reward.
_Avoid_: Completed reward, exchange-ready reward, raw processing row

**Bulk Open Spend**:
The single upfront wallet debit that confirms a Pull All action for all remaining eligible spots in a pack. Reward processing for that Bulk Open Session must not charge the customer again.
_Avoid_: Per-chunk charge, partial bulk charge, delayed charge

**Bulk Award Engine**:
The shared reward-awarding domain path used by normal opens and Bulk Open Sessions. It awards slots and rewards without deciding whether the customer is charged per normal open or through a Bulk Open Spend.
_Avoid_: Second gacha engine, duplicated reward logic, per-chunk paid open

**Retry-Required Bulk Open**:
A Bulk Open Session whose full spend is committed but whose reward processing needs another system or admin retry before every reward becomes settled.
_Avoid_: Cancelled bulk open, refunded bulk open, abandoned pull

**Bulk Open Retry**:
An idempotent attempt to continue reward processing for a Retry-Required Bulk Open. It may be triggered by the system, the customer, or an admin, but it cannot cancel the session, change the target, or influence rewards.
_Avoid_: Manual reward fix, reroll, support cancellation

**Server-Owned Bulk Processing**:
The continuation of a Bulk Open Session after customer confirmation, independent of whether the customer keeps the browser page open.
_Avoid_: Browser-owned processing, tab-driven opening, client-finished pull

**Bulk Open Lock**:
The temporary pack-control boundary created by an active Bulk Open Session. While it exists, admins may monitor or retry processing, but they cannot edit pack cost, rewards, inventory, visibility, opening options, or Last Prize.
_Avoid_: Live edit during Pull All, reward edit while settling

**Pack Open Contract**:
The pack state that affects whether a customer can open, what they pay, what reward outcome is possible, and how fulfilment works. If this changes before a Pull All confirmation completes, the customer must refresh and reconfirm.
_Avoid_: Cosmetic pack snapshot, public display copy, banner metadata

## Marketplace MVP Language

**YNOTT Customer Account**:
The real human customer account represented by a YNOTT profile. It is used for both gacha and marketplace activity.
_Avoid_: Separate marketplace login, duplicate customer account

**Marketplace Account**:
An internal marketplace record linked to one existing YNOTT Customer Account. It supports buyer, seller, payout, and admin-facing marketplace state without creating a second public login.
_Avoid_: Second user account, marketplace password, separate LINE account

**Marketplace Inventory**:
The marketplace-owned stock record for a sellable physical item. It may come from official shop stock or admin-approved seller consignment, but it never comes from a Customer Bag reward.
_Avoid_: Gacha reward row, raw collection item, automatic resale copy

**Official Shop Product**:
A Marketplace Inventory item or product group owned by YNOTT and sold directly by YNOTT. In MVP it can be a card, sealed box, or sealed pack, and it does not create a seller payout.
_Avoid_: User listing, seller consignment item

**Consignment Intake**:
The seller-to-YNOTT middleman process where a seller submits a physical card, YNOTT receives and inspects it, and only then can Marketplace Inventory be approved for listing.
_Avoid_: Seller-direct shipping, instant listing from Customer Bag, uninspected listing

**Marketplace Listing**:
The public sellable offer created from Marketplace Inventory. It has its own price, listing state, snapshots, and pending-payment order rules.
_Avoid_: Reward Conversion, Customer Bag sell action, raw inventory row

**Marketplace Cart**:
The customer-facing saved purchase list for active Marketplace Listings. It is linked to a Marketplace Account, persists across sessions, and does not lock stock until checkout creates a Pending Payment Order.
_Avoid_: Customer Bag, order, checkout hold, browser cart

**Marketplace Watchlist**:
The customer-facing saved comparison list for Marketplace Listings. It lets the customer revisit price, condition, and seller source without implying purchase intent.
_Avoid_: hidden cart, seller follow, browser-only favorite

**Marketplace Cart Summary**:
The public-safe count and subtotal snapshot for Marketplace Cart and Marketplace Watchlist state. It is used by header badges, listing actions, cart drawer, and cart/watchlist pages without exposing private account IDs.
_Avoid_: raw cart rows, private buyer state, full order summary

**Pending Payment Order**:
The short-lived marketplace order created when a buyer starts checkout and receives a server-calculated total. It locks the listing while payment proof is submitted and verified, then becomes paid or expires.
_Avoid_: Long unpaid cart hold, browser-only hold, pay-without-lock

**Marketplace Order**:
The real-money purchase record for a buyer checkout. It tracks item price, shipping fee, payment state, fulfilment state, refund state, and audit events.
_Avoid_: Wallet ledger row, gacha open, reward conversion job

**Marketplace Fee**:
The YNOTT fee charged on the item price for a seller listing. Shipping charged to the buyer is not seller revenue and is excluded from seller payout.
_Avoid_: Coin fee, shipping commission, hidden payout adjustment

**Seller Payout**:
The money owed to a seller after a Marketplace Order is paid, fee is deducted, and the required inspection, shipment, delivery, or admin-release milestone is met.
_Avoid_: Instant wallet credit, automatic payout before fulfilment
