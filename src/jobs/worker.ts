import { Worker, type Job } from "bullmq";

import { prisma } from "@/lib/db";
import { createWorkerConnection } from "@/jobs/connection";
import { closeAllQueues } from "@/jobs/queues";
import { JOB_PROCESSORS, queuesWithProcessors } from "@/jobs/registry";
import { startDispatcherLoop } from "@/jobs/dispatcher";
import { startDealHealthScheduler } from "@/jobs/deal-health-scheduler";
import type { OutboxJobData } from "@/jobs/types";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 5);
const DISPATCH_INTERVAL_MS = Number(process.env.DISPATCH_INTERVAL_MS ?? 3000);
const DEAL_HEALTH_INTERVAL_MS = Number(process.env.DEAL_HEALTH_INTERVAL_MS ?? 5 * 60 * 1000);

async function processJob(job: Job<OutboxJobData>) {
  const processor = JOB_PROCESSORS[job.name];
  if (!processor) {
    throw new Error(`No processor registered for job "${job.name}"`);
  }
  await processor(job);
}

/** Records a terminal (attempts-exhausted) job failure on its outbox row for admin inspection. */
async function markOutboxFailed(job: Job<OutboxJobData> | undefined, error: Error) {
  if (!job) return;
  try {
    await prisma.notificationOutbox.update({
      where: { id: job.data.outboxId },
      data: { status: "FAILED", lastError: error.message.slice(0, 500) },
    });
  } catch (updateError) {
    console.error("[worker] failed to record terminal job failure", { jobId: job.id, updateError });
  }
}

async function main() {
  const connection = createWorkerConnection();
  const queueNames = queuesWithProcessors();

  if (queueNames.length === 0) {
    console.warn("[worker] no queues have registered processors; nothing to do");
  }

  const workers = queueNames.map((queueName) => {
    const worker = new Worker<OutboxJobData>(queueName, processJob, {
      connection,
      concurrency: CONCURRENCY,
    });

    worker.on("active", (job) => {
      console.log(`[worker:${queueName}] active`, { jobId: job.id, name: job.name });
    });
    worker.on("completed", (job) => {
      console.log(`[worker:${queueName}] completed`, { jobId: job.id, name: job.name });
    });
    worker.on("failed", (job, error) => {
      console.error(`[worker:${queueName}] failed`, {
        jobId: job?.id,
        name: job?.name,
        attemptsMade: job?.attemptsMade,
        error: error.message,
      });
      const attemptsExhausted = job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);
      if (attemptsExhausted) {
        void markOutboxFailed(job, error);
      }
    });
    worker.on("error", (error) => {
      console.error(`[worker:${queueName}] connection error`, error);
    });

    return worker;
  });

  const stopDispatcher = startDispatcherLoop(DISPATCH_INTERVAL_MS);
  const stopDealHealthScheduler = startDealHealthScheduler(DEAL_HEALTH_INTERVAL_MS);
  console.log("[worker] started", { queues: queueNames, concurrency: CONCURRENCY });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] received ${signal}, shutting down`);
    stopDispatcher();
    stopDealHealthScheduler();
    // Worker.close() waits for active jobs to finish before resolving.
    await Promise.all(workers.map((worker) => worker.close()));
    await closeAllQueues();
    await connection.quit();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[worker] fatal startup error", error);
  process.exit(1);
});
