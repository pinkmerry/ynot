# Bulk Open processing is server-owned through a queue

Bulk Open must continue after the customer closes the browser because Pull All is a committed full purchase. We will use a queue-backed processor as the primary continuation mechanism, with customer and admin retry actions only re-enqueuing the same locked idempotent processor, instead of relying on browser-driven processing or slow periodic polling.
