export const attachmentName: string;
export const contentType: string;
export function createCapture(
  proof: string,
  binding: {
    runId: string;
    invocationId: string;
    testId: string;
    retry: number;
  },
): {
  attempt(keys: string[]): void;
  providerPoll(values: unknown): void;
  record(key: string, value: unknown): void;
  nestedEmpty(observed: unknown): void;
  nestedPopulated(observed: unknown): void;
  publish(info: {
    attach(
      name: string,
      options: { body: Buffer; contentType: string },
    ): Promise<void>;
  }): Promise<void>;
  finish(): unknown;
};

export function createIaCapture(
  family: string,
  proof: string,
  binding: {
    runId: string;
    invocationId: string;
    testId: string;
    retry: number;
  },
): Pick<
  ReturnType<typeof createCapture>,
  "attempt" | "record" | "providerPoll" | "publish"
>;
