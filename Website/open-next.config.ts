import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Free-first deployment: use OpenNext's dummy cache so Cloudflare R2,
// Durable Objects, and paid image bindings are not required for the first cut.
export default defineCloudflareConfig();
