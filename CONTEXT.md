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
