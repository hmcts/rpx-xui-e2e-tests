import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type AcquireFileLockOptions = {
  retries?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  staleMs?: number;
};

type LockFileState = {
  token: string;
  pid?: number;
  createdAt?: number;
  heartbeatAt?: number;
  host?: string;
  bootAt?: number;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
const lockHost = os.hostname();
const lockBootAt = Date.now() - Math.round(os.uptime() * 1_000);

const isErrno = (
  error: unknown,
): error is NodeJS.ErrnoException & { code: string } =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string";

const parseLockState = (raw: string): LockFileState | undefined => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { token?: unknown }).token === "string"
      ) {
        return parsed as LockFileState;
      }
    } catch {
      // Fall back to token-only interpretation.
    }
  }
  return { token: trimmed };
};

const readLockState = async (
  lockPath: string,
): Promise<LockFileState | undefined> => {
  try {
    const value = await fs.readFile(lockPath, "utf8");
    return parseLockState(value);
  } catch {
    return undefined;
  }
};

const ensureLockDir = async (lockPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
};

const releaseLockWithToken = async (
  lockPath: string,
  token: string,
): Promise<void> => {
  const currentState = await readLockState(lockPath);
  if (!currentState || currentState.token !== token) {
    return;
  }
  try {
    await fs.unlink(lockPath);
  } catch (error) {
    if (isErrno(error) && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
};

const isLockStaleAndUnowned = async (
  lockPath: string,
  staleMs: number,
): Promise<boolean> => {
  try {
    const stats = await fs.stat(lockPath);
    const ageMs = Date.now() - stats.mtimeMs;
    if (ageMs < staleMs) {
      return false;
    }
    // Stale mtime means lock heartbeat has stopped; evict even if owner PID still exists.
    return true;
  } catch (error) {
    if (isErrno(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const startLockHeartbeat = (
  lockPath: string,
  staleMs: number,
): NodeJS.Timeout => {
  const heartbeatMs = Math.max(500, Math.min(5_000, Math.floor(staleMs / 3)));
  const timer = setInterval(() => {
    const now = new Date();
    void fs.utimes(lockPath, now, now).catch(() => undefined);
  }, heartbeatMs);
  timer.unref?.();
  return timer;
};

export const acquireFileLock = async (
  lockPath: string,
  options: AcquireFileLockOptions = {},
): Promise<() => Promise<void>> => {
  const retries = Math.max(0, options.retries ?? 30);
  const retryDelayMs = Math.max(50, options.retryDelayMs ?? 1_000);
  const maxRetryDelayMs = Math.max(
    retryDelayMs,
    options.maxRetryDelayMs ?? 5_000,
  );
  const staleMs = Math.max(1_000, options.staleMs ?? 300_000);

  await ensureLockDir(lockPath);

  let attempt = 0;
  let delayMs = retryDelayMs;
  while (attempt <= retries) {
    attempt += 1;
    const token = `${process.pid}-${Date.now()}-${Math.random()}`;
    try {
      const now = Date.now();
      const handle = await fs.open(lockPath, "wx");
      const state: LockFileState = {
        token,
        pid: process.pid,
        createdAt: now,
        heartbeatAt: now,
        host: lockHost,
        bootAt: lockBootAt,
      };
      await handle.writeFile(`${JSON.stringify(state)}\n`, "utf8");
      await handle.close();
      const heartbeat = startLockHeartbeat(lockPath, staleMs);
      return async () => {
        clearInterval(heartbeat);
        await releaseLockWithToken(lockPath, token);
      };
    } catch (error) {
      if (!isErrno(error) || error.code !== "EEXIST") {
        throw error;
      }

      const shouldEvict = await isLockStaleAndUnowned(lockPath, staleMs);
      if (shouldEvict) {
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }

      if (attempt > retries) {
        break;
      }
      await sleep(delayMs);
      delayMs = Math.min(maxRetryDelayMs, Math.floor(delayMs * 1.5));
    }
  }

  throw new Error(`Timed out acquiring lock file: ${lockPath}`);
};
