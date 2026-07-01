// OpenNext generates this module during the Cloudflare build.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment -- OpenNext may not exist before the Cloudflare build.
// @ts-ignore - The file intentionally does not exist during the prebuild typecheck.
import openNextWorker from "./.open-next/worker.js";
import {
  handleCoreQueueMessage,
  runCoreScheduledJobs,
  type CoreScheduledEnv,
  type QueueBatchMessage,
} from "./src/lib/worker/core-scheduled-jobs";
import {
  runMarketplaceScheduledJobs,
  type MarketplaceScheduledEnv,
} from "./src/lib/worker/marketplace-scheduled-jobs";

type BulkOpenEnv = CoreScheduledEnv & MarketplaceScheduledEnv & {
  MARKETPLACE_ENVIRONMENT?: string;
};

type QueueBatch = {
  messages: QueueBatchMessage[];
};

type WorkerContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

const worker = {
  fetch(request: Request, env: BulkOpenEnv, ctx: WorkerContext) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async queue(batch: QueueBatch, env: BulkOpenEnv) {
    await Promise.all(
      batch.messages.map((message) => handleCoreQueueMessage(message, env)),
    );
  },

  async scheduled(_event: unknown, env: BulkOpenEnv, ctx: WorkerContext) {
    ctx.waitUntil?.(Promise.all([
      runCoreScheduledJobs(env),
      runMarketplaceScheduledJobs(env),
    ]));
  },
};

export default worker;
