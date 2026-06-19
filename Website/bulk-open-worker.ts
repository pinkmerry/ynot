// OpenNext generates this module during the Cloudflare build.
// @ts-ignore - The file intentionally does not exist during the prebuild typecheck.
import openNextWorker from "./.open-next/worker.js";

type QueueBinding = {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<unknown>;
};

type BulkOpenEnv = {
  BULK_OPEN_QUEUE?: QueueBinding;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const REWARD_CONVERSION_PROCESS_LIMIT = 5000;

type BulkOpenQueueMessage = {
  type?: string;
  sessionId?: string;
  jobId?: string;
  attempt?: number;
};

type QueueBatchMessage = {
  body: unknown;
  ack?: () => void;
  retry?: (options?: { delaySeconds?: number }) => void;
};

type QueueBatch = {
  messages: QueueBatchMessage[];
};

type WorkerContext = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readMessage(body: unknown): BulkOpenQueueMessage | null {
  if (!isRecord(body)) return null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  if (!sessionId && !jobId) return null;
  return {
    type: typeof body.type === "string"
      ? body.type
      : sessionId
        ? "bulk_open_process"
        : "reward_conversion_process",
    sessionId: sessionId || undefined,
    jobId: jobId || undefined,
    attempt: typeof body.attempt === "number" ? body.attempt : 0,
  };
}

function supabaseRpcHeaders(env: BulkOpenEnv) {
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("bulk_open_missing_service_role_key");
  }
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
}

async function callSupabaseRpc(
  env: BulkOpenEnv,
  functionName: string,
  args: Record<string, unknown>,
) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) {
    throw new Error("bulk_open_missing_supabase_url");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: supabaseRpcHeaders(env),
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 160);
    throw new Error(`bulk_open_rpc_failed:${functionName}:${response.status}:${detail}`);
  }

  return response.json().catch(() => null);
}

function shouldContinue(result: unknown) {
  if (!isRecord(result)) return false;
  if (result.completed === true) return false;
  if (result.shouldContinue === true) return true;
  const processed = Number(result.processedSlots);
  const target = Number(result.targetSlots);
  return Number.isFinite(processed) && Number.isFinite(target) && processed < target;
}

function shouldContinueRewardConversion(result: unknown) {
  if (!isRecord(result)) return false;
  if (result.completed === true || result.status === "completed") return false;
  if (result.shouldContinue === true) return true;
  const converted = Number(result.convertedCount);
  const total = Number(result.itemCount);
  return Number.isFinite(converted) && Number.isFinite(total) && converted < total;
}

function retryDelaySeconds(attempt: number) {
  const safeAttempt = Math.max(0, Math.min(Math.floor(attempt), 6));
  return Math.min(900, Math.max(15, 15 * 2 ** safeAttempt));
}

async function processBulkOpenSession(
  env: BulkOpenEnv,
  message: BulkOpenQueueMessage,
) {
  if (!message.sessionId) {
    throw new Error("bulk_open_missing_session_id");
  }
  const result = await callSupabaseRpc(env, "process_bulk_open_chunk", {
    p_bulk_open_session_id: message.sessionId,
    p_limit: 1000,
    p_worker_id: "cloudflare-queue",
  });

  if (shouldContinue(result)) {
    if (!env.BULK_OPEN_QUEUE) {
      throw new Error("bulk_open_missing_queue_binding");
    }
    await env.BULK_OPEN_QUEUE.send(
      {
        type: "bulk_open_process",
        sessionId: message.sessionId,
        attempt: 0,
      },
      { delaySeconds: 0 },
    );
  }
}

async function processRewardConversionJob(
  env: BulkOpenEnv,
  message: BulkOpenQueueMessage,
) {
  if (!message.jobId) {
    throw new Error("reward_conversion_missing_job_id");
  }
  const result = await callSupabaseRpc(env, "process_reward_conversion_chunk", {
    p_job_id: message.jobId,
    p_limit: REWARD_CONVERSION_PROCESS_LIMIT,
    p_worker_id: "cloudflare-queue",
  });

  if (shouldContinueRewardConversion(result)) {
    if (!env.BULK_OPEN_QUEUE) {
      throw new Error("reward_conversion_missing_queue_binding");
    }
    await env.BULK_OPEN_QUEUE.send(
      {
        type: "reward_conversion_process",
        jobId: message.jobId,
        attempt: 0,
      },
      { delaySeconds: 0 },
    );
  }
}

async function recoverBulkOpenSessions(env: BulkOpenEnv) {
  if (!env.BULK_OPEN_QUEUE) return;
  const sessions = await callSupabaseRpc(env, "list_bulk_open_recovery_sessions", {
    p_limit: 10,
  });
  if (!Array.isArray(sessions)) return;

  for (const session of sessions) {
    if (!isRecord(session) || typeof session.sessionId !== "string") continue;
    await env.BULK_OPEN_QUEUE.send(
      {
        type: "bulk_open_process",
        sessionId: session.sessionId,
        attempt: 0,
      },
      { delaySeconds: 0 },
    );
  }
}

async function recoverRewardConversionJobs(env: BulkOpenEnv) {
  if (!env.BULK_OPEN_QUEUE) return;
  const result = await callSupabaseRpc(env, "list_reward_conversion_recovery_jobs", {
    p_limit: 10,
  });
  const jobs = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.jobs)
      ? result.jobs
      : [];

  for (const job of jobs) {
    if (!isRecord(job) || typeof job.jobId !== "string") continue;
    await env.BULK_OPEN_QUEUE.send(
      {
        type: "reward_conversion_process",
        jobId: job.jobId,
        attempt: 0,
      },
      { delaySeconds: 0 },
    );
  }
}

async function handleQueueMessage(message: QueueBatchMessage, env: BulkOpenEnv) {
  const body = readMessage(message.body);
  if (
    !body ||
    (body.type !== "bulk_open_process" && body.type !== "reward_conversion_process")
  ) {
    message.ack?.();
    return;
  }

  try {
    if (body.type === "reward_conversion_process") {
      await processRewardConversionJob(env, body);
    } else {
      await processBulkOpenSession(env, body);
    }
    message.ack?.();
  } catch (error) {
    const attempt = Math.max(0, body.attempt ?? 0) + 1;
    const retryEvent =
      body.type === "reward_conversion_process"
        ? "reward_conversion_process_retry"
        : "bulk_open_queue_retry";
    console.warn(retryEvent, {
      sessionId: body.sessionId,
      jobId: body.jobId,
      attempt,
      reason: error instanceof Error ? error.message.split(":").slice(0, 3).join(":") : "unknown",
    });
    message.retry?.({ delaySeconds: retryDelaySeconds(attempt) });
  }
}

const worker = {
  fetch(request: Request, env: BulkOpenEnv, ctx: WorkerContext) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async queue(batch: QueueBatch, env: BulkOpenEnv) {
    await Promise.all(batch.messages.map((message) => handleQueueMessage(message, env)));
  },

  async scheduled(_event: unknown, env: BulkOpenEnv, ctx: WorkerContext) {
    ctx.waitUntil?.(Promise.all([
      recoverBulkOpenSessions(env),
      recoverRewardConversionJobs(env),
    ]));
  },
};

export default worker;
