import { promises as fs } from "node:fs";
import path from "node:path";

type RetryConfig = {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
};

type LockOptions = {
  retries?: RetryConfig;
  stale?: number;
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const isStaleLock = async (
  lockFilePath: string,
  staleMs: number,
): Promise<boolean> => {
  if (staleMs <= 0) {
    return false;
  }

  try {
    const stat = await fs.stat(lockFilePath);
    return Date.now() - stat.mtimeMs > staleMs;
  } catch {
    return false;
  }
};

export async function lock(
  lockFilePath: string,
  options: LockOptions = {},
): Promise<() => Promise<void>> {
  const retries = Math.max(0, options.retries?.retries ?? 0);
  const minTimeout = Math.max(50, options.retries?.minTimeout ?? 250);
  const maxTimeout = Math.max(
    minTimeout,
    options.retries?.maxTimeout ?? minTimeout,
  );
  const staleMs = Math.max(0, options.stale ?? 0);

  await fs.mkdir(path.dirname(lockFilePath), { recursive: true });

  let attempt = 0;
  while (true) {
    try {
      const handle = await fs.open(lockFilePath, "wx");
      try {
        await handle.writeFile(`${process.pid}:${Date.now()}\n`, "utf8");
      } finally {
        await handle.close();
      }

      let released = false;
      return async () => {
        if (released) {
          return;
        }
        released = true;
        try {
          await fs.unlink(lockFilePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
        }
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw error;
      }

      if (staleMs > 0 && (await isStaleLock(lockFilePath, staleMs))) {
        try {
          await fs.unlink(lockFilePath);
          continue;
        } catch (unlinkError) {
          const unlinkCode = (unlinkError as NodeJS.ErrnoException).code;
          if (unlinkCode !== "ENOENT") {
            throw unlinkError;
          }
          continue;
        }
      }

      if (attempt >= retries) {
        throw new Error(
          `Failed to acquire lock for "${lockFilePath}" after ${attempt + 1} attempts`,
        );
      }

      const delayMs = Math.min(maxTimeout, minTimeout * (attempt + 1));
      attempt += 1;
      await sleep(delayMs);
    }
  }
}
