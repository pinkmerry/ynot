type QueueBinding = {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<unknown>;
};

export type CoreScheduledEnv = {
  BULK_OPEN_QUEUE?: QueueBinding;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

const REWARD_CONVERSION_PROCESS_LIMIT = 2000;
const SHIPPING_REQUEST_PROCESS_LIMIT = 2000;
const REWARD_CONVERSION_CONTINUE_DELAY_SECONDS = 1;
const REWARD_CONVERSION_RECOVERY_DELAY_SECONDS = 1;
const SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS = 1;
const SHIPPING_REQUEST_RECOVERY_DELAY_SECONDS = 1;

type BulkOpenQueueMessage = {
  type?: string;
  sessionId?: string;
  jobId?: string;
  attempt?: number;
};

export type QueueBatchMessage = {
  body: unknown;
  attempts?: number;
  ack?: () => void;
  retry?: (options?: { delaySeconds?: number }) => void;
};

type QueueJobAdapter = {
  messageType: "bulk_open_process" | "reward_conversion_process" | "shipping_request_process";
  retryLogLabel:
    | "bulk_open_queue_retry"
    | "reward_conversion_process_retry"
    | "shipping_request_process_retry";
  validateMessage(message: BulkOpenQueueMessage): string;
  processStep(env: CoreScheduledEnv, id: string): Promise<unknown>;
  shouldContinue(result: unknown): boolean;
  continuationMessage(id: string): BulkOpenQueueMessage;
  continuationOptions: { delaySeconds: number };
  missingQueueBindingError: string;
  recover(env: CoreScheduledEnv): Promise<unknown>;
  recoveryItems(result: unknown): unknown[];
  recoveryMessage(item: unknown): BulkOpenQueueMessage | null;
  recoveryDelaySeconds: number;
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
        : body.type === "shipping_request_process"
          ? "shipping_request_process"
          : "reward_conversion_process",
    sessionId: sessionId || undefined,
    jobId: jobId || undefined,
    attempt: typeof body.attempt === "number" ? body.attempt : 0,
  };
}

function supabaseRpcHeaders(env: CoreScheduledEnv) {
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
  env: CoreScheduledEnv,
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
  if (
    result.retryRequired === true ||
    result.shouldContinue === false ||
    result.status === "retry_required"
  ) {
    return false;
  }
  if (result.shouldContinue === true) return true;
  const converted = Number(result.convertedCount);
  const total = Number(result.itemCount);
  return Number.isFinite(converted) && Number.isFinite(total) && converted < total;
}

function shouldContinueShippingRequest(result: unknown) {
  if (!isRecord(result)) return false;
  if (result.completed === true || result.status === "submitted") return false;
  if (
    result.retryRequired === true ||
    result.shouldContinue === false ||
    result.status === "retry_required"
  ) {
    return false;
  }
  if (result.shouldContinue === true) return true;
  const prepared = Number(result.preparedCount);
  const total = Number(result.itemCount);
  return Number.isFinite(prepared) && Number.isFinite(total) && prepared < total;
}

function retryDelaySeconds(attempt: number) {
  const safeAttempt = Math.max(0, Math.min(Math.floor(attempt), 6));
  return Math.min(900, Math.max(15, 15 * 2 ** safeAttempt));
}

function deliveryAttempt(message: QueueBatchMessage, body: BulkOpenQueueMessage) {
  if (typeof message.attempts === "number" && Number.isFinite(message.attempts)) {
    return Math.max(0, Math.floor(message.attempts));
  }
  return Math.max(0, body.attempt ?? 0) + 1;
}

function recoveryJobs(result: unknown) {
  return Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.jobs)
      ? result.jobs
      : [];
}

const bulkOpenAdapter: QueueJobAdapter = {
  messageType: "bulk_open_process",
  retryLogLabel: "bulk_open_queue_retry",
  validateMessage(message) {
    if (!message.sessionId) {
      throw new Error("bulk_open_missing_session_id");
    }
    return message.sessionId;
  },
  processStep(env, sessionId) {
    return callSupabaseRpc(env, "process_bulk_open_chunk", {
      p_bulk_open_session_id: sessionId,
      p_limit: 1000,
      p_worker_id: "cloudflare-queue",
    });
  },
  shouldContinue,
  continuationMessage(sessionId) {
    return {
      type: "bulk_open_process",
      sessionId,
      attempt: 0,
    };
  },
  continuationOptions: { delaySeconds: REWARD_CONVERSION_CONTINUE_DELAY_SECONDS },
  missingQueueBindingError: "bulk_open_missing_queue_binding",
  recover(env) {
    return callSupabaseRpc(env, "list_bulk_open_recovery_sessions", {
      p_limit: 10,
    });
  },
  recoveryItems: recoveryJobs,
  recoveryMessage(session) {
    if (!isRecord(session) || typeof session.sessionId !== "string") return null;
    return {
      type: "bulk_open_process",
      sessionId: session.sessionId,
      attempt: 0,
    };
  },
  recoveryDelaySeconds: REWARD_CONVERSION_RECOVERY_DELAY_SECONDS,
};

const rewardConversionAdapter: QueueJobAdapter = {
  messageType: "reward_conversion_process",
  retryLogLabel: "reward_conversion_process_retry",
  validateMessage(message) {
    if (!message.jobId) {
      throw new Error("reward_conversion_missing_job_id");
    }
    return message.jobId;
  },
  processStep(env, jobId) {
    return callSupabaseRpc(env, "process_reward_conversion_chunk", {
      p_job_id: jobId,
      p_limit: REWARD_CONVERSION_PROCESS_LIMIT,
      p_worker_id: "cloudflare-queue",
    });
  },
  shouldContinue: shouldContinueRewardConversion,
  continuationMessage(jobId) {
    return {
      type: "reward_conversion_process",
      jobId,
      attempt: 0,
    };
  },
  continuationOptions: { delaySeconds: REWARD_CONVERSION_CONTINUE_DELAY_SECONDS },
  missingQueueBindingError: "reward_conversion_missing_queue_binding",
  recover(env) {
    return callSupabaseRpc(env, "list_reward_conversion_recovery_jobs", {
      p_limit: 10,
    });
  },
  recoveryItems: recoveryJobs,
  recoveryMessage(job) {
    if (!isRecord(job) || typeof job.jobId !== "string") return null;
    return {
      type: "reward_conversion_process",
      jobId: job.jobId,
      attempt: 0,
    };
  },
  recoveryDelaySeconds: REWARD_CONVERSION_RECOVERY_DELAY_SECONDS,
};

const shippingRequestAdapter: QueueJobAdapter = {
  messageType: "shipping_request_process",
  retryLogLabel: "shipping_request_process_retry",
  validateMessage(message) {
    if (!message.jobId) {
      throw new Error("shipping_request_missing_job_id");
    }
    return message.jobId;
  },
  processStep(env, jobId) {
    return callSupabaseRpc(env, "process_shipping_request_chunk", {
      p_job_id: jobId,
      p_limit: SHIPPING_REQUEST_PROCESS_LIMIT,
      p_worker_id: "cloudflare-queue",
    });
  },
  shouldContinue: shouldContinueShippingRequest,
  continuationMessage(jobId) {
    return {
      type: "shipping_request_process",
      jobId,
      attempt: 0,
    };
  },
  continuationOptions: { delaySeconds: SHIPPING_REQUEST_CONTINUE_DELAY_SECONDS },
  missingQueueBindingError: "shipping_request_missing_queue_binding",
  recover(env) {
    return callSupabaseRpc(env, "list_shipping_request_recovery_jobs", {
      p_limit: 10,
    });
  },
  recoveryItems: recoveryJobs,
  recoveryMessage(job) {
    if (!isRecord(job) || typeof job.jobId !== "string") return null;
    return {
      type: "shipping_request_process",
      jobId: job.jobId,
      attempt: 0,
    };
  },
  recoveryDelaySeconds: SHIPPING_REQUEST_RECOVERY_DELAY_SECONDS,
};

const queueJobAdapters = [
  bulkOpenAdapter,
  rewardConversionAdapter,
  shippingRequestAdapter,
];

const queueJobAdaptersByType = new Map(
  queueJobAdapters.map((adapter) => [adapter.messageType, adapter]),
);

async function enqueueJob(
  env: CoreScheduledEnv,
  body: BulkOpenQueueMessage,
  delaySeconds: number,
  missingQueueBindingError: string,
) {
  if (!env.BULK_OPEN_QUEUE) {
    throw new Error(missingQueueBindingError);
  }
  await env.BULK_OPEN_QUEUE.send(body, { delaySeconds });
}

async function runQueueJob(
  env: CoreScheduledEnv,
  message: BulkOpenQueueMessage,
  adapter: QueueJobAdapter,
) {
  const id = adapter.validateMessage(message);
  const result = await adapter.processStep(env, id);
  if (!adapter.shouldContinue(result)) return;

  await enqueueJob(
    env,
    adapter.continuationMessage(id),
    adapter.continuationOptions.delaySeconds,
    adapter.missingQueueBindingError,
  );
}

async function runScheduledRecovery(
  env: CoreScheduledEnv,
  adapter: QueueJobAdapter,
) {
  if (!env.BULK_OPEN_QUEUE) return;
  const result = await adapter.recover(env);
  for (const item of adapter.recoveryItems(result)) {
    const body = adapter.recoveryMessage(item);
    if (!body) continue;
    await env.BULK_OPEN_QUEUE.send(body, { delaySeconds: adapter.recoveryDelaySeconds });
  }
}

async function recoverBulkOpenSessions(env: CoreScheduledEnv) {
  await runScheduledRecovery(env, bulkOpenAdapter);
}

async function recoverRewardConversionJobs(env: CoreScheduledEnv) {
  await runScheduledRecovery(env, rewardConversionAdapter);
}

async function recoverShippingRequestJobs(env: CoreScheduledEnv) {
  await runScheduledRecovery(env, shippingRequestAdapter);
}

export async function runCoreScheduledJobs(env: CoreScheduledEnv) {
  await Promise.all([
    recoverBulkOpenSessions(env),
    recoverRewardConversionJobs(env),
    recoverShippingRequestJobs(env),
  ]);
}

export async function handleCoreQueueMessage(
  message: QueueBatchMessage,
  env: CoreScheduledEnv,
) {
  const body = readMessage(message.body);
  if (
    !body ||
    (body.type !== "bulk_open_process" &&
      body.type !== "reward_conversion_process" &&
      body.type !== "shipping_request_process")
  ) {
    message.ack?.();
    return;
  }

  const adapter = queueJobAdaptersByType.get(body.type);
  if (!adapter) {
    message.ack?.();
    return;
  }

  try {
    await runQueueJob(env, body, adapter);
    message.ack?.();
  } catch (error) {
    const attempt = deliveryAttempt(message, body);
    console.warn(adapter.retryLogLabel, {
      sessionId: body.sessionId,
      jobId: body.jobId,
      attempt,
      reason: error instanceof Error ? error.message.split(":").slice(0, 3).join(":") : "unknown",
    });
    message.retry?.({ delaySeconds: retryDelaySeconds(attempt) });
  }
}
