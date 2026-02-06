import { promises as fs } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { acquireFileLock } from "../../utils/file-lock.utils";

test.describe.configure({ mode: "serial" });

test.describe("File lock utility", () => {
  test("evicts stale lock when heartbeat is stale even if owner process is alive", async () => {
    const lockPath = path.join(
      process.cwd(),
      "test-results",
      "tmp-lock-tests",
      `alive-${Date.now()}.lock`,
    );
    await fs.mkdir(path.dirname(lockPath), { recursive: true });

    const staleTime = new Date(Date.now() - 120_000);
    await fs.writeFile(
      lockPath,
      `${JSON.stringify({ token: "existing", pid: process.pid })}\n`,
      "utf8",
    );
    await fs.utimes(lockPath, staleTime, staleTime);

    const releaseLock = await acquireFileLock(lockPath, {
      retries: 1,
      retryDelayMs: 50,
      maxRetryDelayMs: 50,
      staleMs: 1_000,
    });

    await expect(
      acquireFileLock(lockPath, {
        retries: 0,
        retryDelayMs: 50,
        maxRetryDelayMs: 50,
        staleMs: 60_000,
      }),
    ).rejects.toThrow("Timed out acquiring lock file");

    await releaseLock();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  test("evicts stale lock with inactive owner and acquires a fresh lock", async () => {
    const lockPath = path.join(
      process.cwd(),
      "test-results",
      "tmp-lock-tests",
      `stale-${Date.now()}.lock`,
    );
    await fs.mkdir(path.dirname(lockPath), { recursive: true });

    const staleTime = new Date(Date.now() - 120_000);
    await fs.writeFile(
      lockPath,
      `${JSON.stringify({ token: "stale", pid: 0 })}\n`,
      "utf8",
    );
    await fs.utimes(lockPath, staleTime, staleTime);

    const releaseLock = await acquireFileLock(lockPath, {
      retries: 1,
      retryDelayMs: 50,
      maxRetryDelayMs: 50,
      staleMs: 1_000,
    });

    await expect(
      acquireFileLock(lockPath, {
        retries: 0,
        retryDelayMs: 50,
        maxRetryDelayMs: 50,
        staleMs: 60_000,
      }),
    ).rejects.toThrow("Timed out acquiring lock file");

    await releaseLock();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  test("does not evict active lock while heartbeat is fresh", async () => {
    const lockPath = path.join(
      process.cwd(),
      "test-results",
      "tmp-lock-tests",
      `fresh-${Date.now()}.lock`,
    );
    await fs.mkdir(path.dirname(lockPath), { recursive: true });

    await fs.writeFile(
      lockPath,
      `${JSON.stringify({ token: "active", pid: process.pid })}\n`,
      "utf8",
    );

    await expect(
      acquireFileLock(lockPath, {
        retries: 0,
        retryDelayMs: 50,
        maxRetryDelayMs: 50,
        staleMs: 60_000,
      }),
    ).rejects.toThrow("Timed out acquiring lock file");

    const lockState = await fs.readFile(lockPath, "utf8");
    expect(lockState).toContain('"token":"active"');
    await fs.unlink(lockPath);
  });
});
