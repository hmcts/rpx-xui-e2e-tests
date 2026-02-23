import { createLogger } from "@hmcts/playwright-common";

export const logger = createLogger({
  serviceName: "exui-e2e-tests",
  format: process.env.CI ? "json" : "pretty",
  level: process.env.LOG_LEVEL ?? "info",
  enableRedaction: true,
});
