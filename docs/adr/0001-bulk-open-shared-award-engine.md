# Bulk Open uses a shared award engine with upfront spend

Pull All is a committed full-pack purchase: the customer is charged once at the start, the pack becomes unavailable to other customers immediately, and rewards are processed in batches afterward. We will not implement Pull All as repeated calls to the existing paid open RPC, because that would double-charge or require fragile wallet workarounds; instead normal opens and Bulk Open processing should share the same private reward-awarding engine, with wallet debit kept outside the shared award step.
