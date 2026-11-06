import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { test as base, expect } from "@playwright/test";

// Native ES2022 fields run before TypeScript constructor parameter assignments.
export class NativeFieldOrderProbe {
  readonly earlyValue = this.readConstructorValue();

  constructor(readonly constructorValue: string) {}

  private readConstructorValue(): string | undefined {
    return this.constructorValue;
  }
}

export class ConstructorInitializedProbe {
  readonly value: string;

  constructor(readonly dependency: { value: string }) {
    this.value = dependency.value;
  }
}

export const test = base.extend<{ queryEndpoint: string }>({
  queryEndpoint: async ({}, use) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([...url.searchParams]));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  },
});

export { expect };
