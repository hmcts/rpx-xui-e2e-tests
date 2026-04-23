import { expect, test } from "@playwright/test";

import {
  isTransientWorkflowFailure,
  retryOnTransientFailure
} from "../e2e/utils/transient-failure.utils";

test.describe("Transient workflow retry coverage", () => {
  test("classifies known workflow instability as transient", () => {
    expect(isTransientWorkflowFailure(new Error("Validation error after submit"))).toBe(true);
    expect(isTransientWorkflowFailure(new Error("Critical wizard endpoint failure after submit"))).toBe(true);
    expect(isTransientWorkflowFailure(new Error("Target page, context or browser has been closed"))).toBe(false);
  });

  test("retries transient failures until the action succeeds", async () => {
    let attempts = 0;
    const retryAttempts: number[] = [];

    const result = await retryOnTransientFailure(
      async () => {
        attempts += 1;
        if (attempts < 2) {
          throw new Error("Validation error after submit");
        }
        return "ok";
      },
      {
        maxAttempts: 2,
        onRetry: async (attempt) => {
          retryAttempts.push(attempt);
        }
      }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(retryAttempts).toEqual([1]);
  });

  test("does not retry non-transient failures", async () => {
    let attempts = 0;

    await expect(
      retryOnTransientFailure(
        async () => {
          attempts += 1;
          throw new Error("fatal validation mismatch");
        },
        { maxAttempts: 2 }
      )
    ).rejects.toThrow("fatal validation mismatch");

    expect(attempts).toBe(1);
  });
});
