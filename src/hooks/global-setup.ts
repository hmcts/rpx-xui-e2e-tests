import dotenv from "dotenv";
import { request } from "@playwright/test";
import CONFIG from "../../config/configManager.js";
import { getLogger } from "../logger-config.js";

dotenv.config();

const logger = getLogger("global-setup");

async function waitForAppToBeReady(targetUrl: string, maximumWaitInSeconds: number): Promise<void> {
  const maxDurationMs = maximumWaitInSeconds * 1000;
  const start = Date.now();
  const pollRateMs = 10000;

  while (Date.now() - start < maxDurationMs) {
    const apiRequestContext = await request.newContext({ ignoreHTTPSErrors: true });
    try {
      logger.info(`Checking readiness of ${targetUrl}...`);
      const response = await apiRequestContext.get(targetUrl, { failOnStatusCode: false });
      if (response.status() >= 200 && response.status() < 500) {
        logger.info(`Endpoint ${targetUrl} responded with ${response.status()}; continuing.`);
        await apiRequestContext.dispose();
        return;
      }
    } catch (error) {
      logger.warn(`Readiness check failed for ${targetUrl}: ${(error as Error).message}`);
    } finally {
      await apiRequestContext.dispose();
    }
    await new Promise((resolve) => setTimeout(resolve, pollRateMs));
  }

  throw new Error(`App ${targetUrl} not ready after ${maximumWaitInSeconds} seconds`);
}

export default async function globalSetup(): Promise<void> {
  logger.info(`Test run ID (TRI): ${CONFIG.test.TRI}`);
  logger.info(`Project: ${CONFIG.test.projectName}`);
  logger.info(`Environment: ${CONFIG.environment}`);
  logger.info(`UI URL: ${CONFIG.urls.xui}`);
  logger.info(`API URL: ${CONFIG.urls.api}`);
  logger.info(`Accessibility autoscan: ${String(CONFIG.test.accessibility?.autoscanEnabled ?? false)}`);
  logger.info(`Wiremock enabled: ${String(CONFIG.test.wiremock?.enabled ?? false)}`);

  if (process.env.SKIP_HEALTHCHECK === "1") {
    logger.info("Skipping health checks (SKIP_HEALTHCHECK=1)");
    return;
  }

  const uiHealthUrl = `${CONFIG.urls.xui.replace(/\/$/, "")}/health`;
  await waitForAppToBeReady(uiHealthUrl, CONFIG.test.maxWaitForHealthy);

  if (CONFIG.test.wiremock?.enabled && CONFIG.test.wiremock?.endpoints?.health) {
    const target = `${CONFIG.test.wiremock.baseUrl}${CONFIG.test.wiremock.endpoints.health}`;
    await waitForAppToBeReady(target, CONFIG.test.maxWaitForHealthy);
  }

  logger.info("global setup complete");
}
