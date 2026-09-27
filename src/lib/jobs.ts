import { getCollection, newId } from "./mongo";
import type { JobDoc } from "./types";

const running = new Set<string>();

// A running job touches updatedAt every HEARTBEAT_MS. Jobs live in this
// process's memory, so if the server restarts mid-job nothing will ever finish
// them — a job silent for longer than STALE_MS is reported as failed.
const HEARTBEAT_MS = 15000;
const STALE_MS = 90000;

export async function createJob(
  projectId: string,
  type: JobDoc["type"]
): Promise<JobDoc> {
  const col = await getCollection<JobDoc>("jobs");
  const job: JobDoc = {
    _id: newId(),
    projectId,
    type,
    status: "queued",
    progress: 0,
    stage: "Queued...",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await col.insertOne(job as any);
  return job;
}

export async function updateJob(
  jobId: string,
  patch: Partial<JobDoc>
): Promise<void> {
  const col = await getCollection<JobDoc>("jobs");
  await col.updateOne(
    { _id: jobId } as any,
    { $set: { ...patch, updatedAt: new Date().toISOString() } }
  );
}

export async function getJob(jobId: string): Promise<JobDoc | null> {
  const col = await getCollection<JobDoc>("jobs");
  const doc = await col.findOne({ _id: jobId } as any);
  if (!doc) return null;
  const job = { ...doc, _id: jobId } as JobDoc;
  const silentFor = Date.now() - new Date(job.updatedAt).getTime();
  if ((job.status === "running" || job.status === "queued") && silentFor > STALE_MS) {
    const error = "Job was interrupted (the server restarted or the worker crashed). Please run this step again.";
    await updateJob(jobId, { status: "failed", stage: "Interrupted", error });
    return { ...job, status: "failed", stage: "Interrupted", error };
  }
  return job;
}

export async function runJob(
  jobId: string,
  fn: (report: (p: number, stage: string) => Promise<void>) => Promise<unknown>
): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);
  const heartbeat = setInterval(() => {
    updateJob(jobId, {}).catch(() => {});
  }, HEARTBEAT_MS);
  try {
    await updateJob(jobId, { status: "running", progress: 1, stage: "Starting..." });
    const report = async (p: number, stage: string) => {
      await updateJob(jobId, {
        progress: Math.max(0, Math.min(100, Math.round(p))),
        stage,
      });
    };
    const result = await fn(report);
    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      stage: "Done",
      result: result ?? null,
    });
  } catch (e: any) {
    await updateJob(jobId, {
      status: "failed",
      stage: "Failed",
      error: e?.message || String(e),
    });
  } finally {
    clearInterval(heartbeat);
    running.delete(jobId);
  }
}

// ---- one render per project -------------------------------------------------
// Assemble and export both write the project's final video. Two renders at
// once (e.g. a double-click while the first request is still compiling) used
// to write the same MP4 concurrently and corrupt it. The lock lives on
// globalThis so separately bundled route modules share it.
const g = globalThis as unknown as { __ccRenderLocks?: Map<string, string | null> };
const renderLocks = (g.__ccRenderLocks ??= new Map<string, string | null>());

/**
 * Claim the render slot for a project. Synchronous check-and-set, so two
 * requests can't both win. On failure, returns the running job's id (or null
 * if the other request hasn't created its job yet).
 */
export function claimRender(projectId: string): { ok: true } | { ok: false; jobId: string | null } {
  if (renderLocks.has(projectId)) return { ok: false, jobId: renderLocks.get(projectId) ?? null };
  renderLocks.set(projectId, null);
  return { ok: true };
}

export function setRenderJob(projectId: string, jobId: string) {
  renderLocks.set(projectId, jobId);
}

export function releaseRender(projectId: string) {
  renderLocks.delete(projectId);
}
